// plan job (strategist): AdSpecs following the doctrine -> Ad rows -> render jobs.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  AdSpecSchema,
  AWARENESS_LEVELS,
  CorrectionsSchema,
  ExtractionSchema,
  TRIAL_AWARENESS_MIX,
  type AdSpec,
  type Awareness,
  type Extraction,
} from "../../../src/lib/ads/contracts";
import { untrusted } from "../prompts/doctrine";
import { PLAN_SYSTEM } from "../prompts/plan";
import { structured } from "../providers/structured";
import { capBody } from "./plan-body";
import { enqueue, priorityFor } from "../queue/queue";
import { throwIfAborted } from "./abort";
import { PermanentJobError, type JobContext } from "./context";
import { releaseForAd } from "./credits";
import { findNearDuplicates } from "./dedupe";
import { mapClaimsToFacts, type Fact } from "./grounding";
import { maybeFinalizeRun } from "./finalize";
import { giftPolicy, isWeeklyRun } from "./gift-policy";
import { weeklyAvoidPrompt } from "./weekly";
import { EMPTY_HISTORY, historyPrompt, hookOffset, loadBrandHistory } from "./brand-history";
import { assignLayouts } from "./layouts";
import { abandonReplacement, attemptCap, hedgeLockKey, qcObj } from "./replace";
import { countTypeAds, fallbackFor, fallbackOf, isLocked, maxTypeAds, typographicSpec } from "./trial-fill";
import { loadLayoutCatalog, loadMotionModule } from "./modules";
import { loadRunSeed, seedPrompt } from "../coach/seed";

const LlmAd = z.object({
  slot: z.number().int(),
  angle: z.string(),
  hook: z.string(),
  headline: z.string(),
  body: z.string().optional(),
  cta: z.string().optional(),
  claims: z.array(z.object({ claim: z.string(), sourceUrl: z.string() })),
  visual: z.object({
    concept: z.string(),
    assetKeys: z.array(z.string()),
    layout: z.string(),
    generateImagery: z.boolean(),
    imageryPrompt: z.string().optional(),
  }),
});
type LlmAdT = z.infer<typeof LlmAd>;
const PlanOut = z.object({ ads: z.array(LlmAd), strongestSlot: z.number().int() });

/** Expand an awareness mix into exactly `count` slots (largest-remainder scaling). */
export function awarenessSlots(mix: Partial<Record<Awareness, number>>, count: number): Awareness[] {
  const entries = AWARENESS_LEVELS.map((l) => [l, Math.max(0, mix[l] ?? 0)] as const).filter(([, n]) => n > 0);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (count <= 0) return [];
  if (total === 0) return awarenessSlots(TRIAL_AWARENESS_MIX, count);
  const scaled = entries.map(([l, n]) => ({ l, exact: (n / total) * count }));
  const base = scaled.map((s) => ({ l: s.l, n: Math.floor(s.exact), rem: s.exact - Math.floor(s.exact) }));
  let left = count - base.reduce((a, b) => a + b.n, 0);
  for (const b of [...base].sort((a, c) => c.rem - a.rem)) {
    if (left-- <= 0) break;
    b.n++;
  }
  return base.flatMap((b) => Array<Awareness>(b.n).fill(b.l));
}

/** Apply confirm-screen corrections over the extraction (user wins). */
export function applyCorrections(ex: Extraction, raw: unknown): Extraction & { goal?: string } {
  const c = CorrectionsSchema.safeParse(raw ?? {});
  if (!c.success) return ex;
  const k = c.data;
  return {
    ...ex,
    ...(k.audience ? { audience: k.audience } : {}),
    ...(k.mainOffer ? { mainOffer: k.mainOffer } : {}),
    ...(k.pains ? { pains: k.pains.map((text) => ex.pains.find((p) => p.text === text) ?? { text, sourceUrl: "user" }) } : {}),
    ...(k.landingPage ? { landingPage: k.landingPage } : {}),
    ...(k.goal ? { goal: k.goal } : {}),
  };
}

function problemsFor(ads: LlmAdT[], facts: Fact[]): Map<number, string> {
  const problems = new Map<number, string>();
  for (const i of findNearDuplicates(ads)) problems.set(i, "too similar to another ad: use a completely different buyer moment and angle");
  ads.forEach((a, i) => {
    const unmapped = mapClaimsToFacts(a.claims, facts).filter((m) => m.factIndex === null);
    if (unmapped.length) {
      const prev = problems.get(i);
      problems.set(i, `${prev ? prev + "; " : ""}claims not backed by a listed fact: ${unmapped.map((u) => JSON.stringify(u.claim)).join(", ")} (remove them or copy a fact verbatim)`);
    }
  });
  return problems;
}


type RunWithProfile = {
  extraction: unknown;
  corrections: unknown;
  resolvedGoal: string | null;
  brandProfile: { facts: unknown } | null;
};

/** Asset keys QC rejected as off-topic for this run (stored on AdRun.extraction.rejectedAssetKeys). */
export function rejectedAssetKeys(extraction: unknown): string[] {
  const r = (extraction as { rejectedAssetKeys?: unknown } | null)?.rejectedAssetKeys;
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === "string") : [];
}

/** Brand brief shared by planning and replacement. */
export function runBrief(run: RunWithProfile): { ex: Extraction & { goal?: string }; facts: Fact[]; brief: string } {
  const ex0 = ExtractionSchema.safeParse(run.extraction);
  if (!ex0.success) throw new PermanentJobError("run has no valid extraction");
  const ex1 = applyCorrections(ex0.data, run.corrections);
  // Photos QC already rejected as off-topic for this run (image_relevant) are never planned again.
  const rejected = new Set(rejectedAssetKeys(run.extraction));
  const ex = rejected.size ? { ...ex1, assets: ex1.assets.filter((a) => !rejected.has(a.key)) } : ex1;
  const bp = run.brandProfile;
  const facts: Fact[] = (Array.isArray(bp?.facts) && bp.facts.length ? (bp.facts as unknown as Fact[]) : ex.facts).filter(
    (f) => f && typeof f.claim === "string",
  );
  const goal = ex.goal ?? run.resolvedGoal ?? ex.suggestedGoal;

  const brief = `BRAND: ${ex.brandName} (${ex.domain})
GOAL: ${goal}; LANDING PAGE: ${ex.landingPage}
AUDIENCE: ${ex.audience}
MAIN OFFER: ${ex.mainOffer}
VOICE: ${ex.voice ?? "plain, friendly"}
PAINS (buyer's words):\n${ex.pains.map((p, i) => `  ${i + 1}. ${p.text}${"quote" in p && p.quote ? ` — site: "${p.quote}"` : ""}`).join("\n")}
PROOF:\n${ex.proof.map((p) => `  - [${p.kind}] ${p.text}${p.quote ? ` — "${p.quote}"` : ""} (${p.sourceUrl})`).join("\n") || "  (none)"}
FACTS (the ONLY claims allowed):\n${facts.map((f, i) => `  F${i + 1}. ${f.claim} | sourceUrl=${f.sourceUrl} | quote: "${f.quote}"`).join("\n") || "  (none: make no product claims)"}
ASSETS:\n${ex.assets.map((a) => `  - key=${a.key} kind=${a.kind} ${a.width}x${a.height} hasFace=${a.hasFace}`).join("\n") || "  (none)"}
BRAND COLORS: ${ex.colors.map((c) => `${c.hex} (${c.role})`).join(", ")}`;
  return { ex, facts, brief };
}

export async function planJob(ctx: JobContext): Promise<unknown> {
  const { db, job } = ctx;
  if (!job.runId) throw new PermanentJobError("plan job without runId");
  if (typeof job.payload.replaceAdId === "string") {
    return replaceAdJob(ctx, job.payload.replaceAdId, typeof job.payload.feedback === "string" ? job.payload.feedback : "", job.payload.hedge === true, job.payload.settle === true);
  }
  const run = await db.adRun.findUnique({ where: { id: job.runId }, include: { brandProfile: true } });
  if (!run) throw new PermanentJobError("run not found");
  if (!["queued", "generating"].includes(run.status)) return { skipped: `run status ${run.status}` };
  const existing = await db.ad.count({ where: { runId: run.id } });
  if (existing > 0) return { skipped: "ads already planned" };
  const { ex, facts, brief } = runBrief(run);
  const bp = run.brandProfile;
  void bp;

  const mix = (run.awarenessMix as Partial<Record<Awareness, number>> | null) ?? (run.isTrial ? TRIAL_AWARENESS_MIX : TRIAL_AWARENESS_MIX);
  const slots = awarenessSlots(mix, run.staticCount);

  // Brand memory: earlier sets for this website, so a repeat customer gets new angles, photos and hooks.
  // Planner-side memory is opt-in (BRAND_MEMORY_PLAN=1): in blind tests it nudged quality down (62% -> 44-48% READY)
  // while copy already doesn't repeat without it. Render-side memory (scene rotation, cross-run image dedupe) is always on.
  const history = process.env.BRAND_MEMORY_PLAN === "1" ? await loadBrandHistory(db, run) : EMPTY_HISTORY;
  const hOff = hookOffset(history);
  const slotList = slots.map((l, i) => `slot ${i}: ${l}${hOff ? ` (hook format ${(i + hOff) % 10})` : ""}`).join("\n");
  const weeklyAvoid = isWeeklyRun(run) ? await weeklyAvoidPrompt(db, run) : "";
  const memory = [historyPrompt(history, ex.assets), weeklyAvoid].filter(Boolean).join("\n\n");
  // "Make 5 more like the winner" (Ozzy Ad Coach): planning is seeded from the winning ad.
  const seed = await loadRunSeed(db, run.id, job.payload);
  const basePrompt = `${untrusted("brand-brief", brief)}${memory ? `\n\n${untrusted("brand-history", memory)}` : ""}${seed ? `\n\n${untrusted("winner-seed", seedPrompt(seed))}` : ""}\n\nWrite ${slots.length} static ads, one per slot:\n${slotList}${hOff ? "\n(Hook format per slot is given in brackets above; it overrides the slot-number rule.)" : ""}\n\nAlso return strongestSlot: the slot whose angle is the strongest (it will also become the animated ad).`;

  // Two parallel batches; each gets its own share of the pains so angles diverge.
  const half = Math.ceil(slots.length / 2);
  const batches = [slots.map((_, i) => i).slice(0, half), slots.map((_, i) => i).slice(half)].filter((b) => b.length);
  const painsFor = (bi: number) => (seed ? [] : ex.pains).filter((_, i) => i % batches.length === bi).map((p) => p.text);
  const assetKeys = new Set(ex.assets.map((a) => a.key));
  const toSpec = (a: LlmAdT, index: number, kind: "static" | "motion", awareness: Awareness): AdSpec =>
    AdSpecSchema.parse({
      index,
      kind,
      awareness,
      angle: a.angle,
      hook: a.hook,
      headline: a.headline.slice(0, 90),
      ...(capBody(a.body) ? { body: capBody(a.body) } : {}),
      ...(a.cta ? { cta: a.cta.slice(0, 30) } : {}),
      claims: a.claims,
      visual: { ...a.visual, assetKeys: a.visual.assetKeys.filter((k) => assetKeys.has(k)) },
    });
  // Drop any claim still unmapped (QC judges the copy itself).
  const finalizeClaims = (a: LlmAdT): LlmAdT => {
    const mapped = mapClaimsToFacts(a.claims, facts);
    return { ...a, claims: mapped.filter((m) => m.factIndex !== null).map((m) => ({ claim: m.claim, sourceUrl: facts[m.factIndex ?? 0]?.sourceUrl ?? m.sourceUrl })) };
  };

  // Catalog + motion availability load while the LLM writes.
  const prep = (async () => {
    const catalog = await loadLayoutCatalog({ brandName: ex.brandName, colors: ex.colors, fonts: ex.fonts, assets: ex.assets });
    const flag = await db.adsFeatureFlag.findUnique({ where: { key: "ezmotion" } });
    let motionOk = false;
    let motionWhy = "ezmotion feature flag disabled";
    if (flag?.enabled) {
      const mod = await loadMotionModule();
      const av = mod.ok ? await mod.mod.availability().catch((e: unknown) => ({ ok: false, reason: String(e) })) : { ok: false, reason: mod.error };
      motionOk = av.ok;
      motionWhy = av.reason ?? "ezmotion module reports unavailable";
    }
    return { catalog, motionOk, motionWhy };
  })();

  // Streaming commit: ads that pass dedupe + grounding are written and queued for render
  // the moment their batch lands; flagged slots get a "planned" placeholder row (keeps the
  // run from finalizing) and are rewritten after, then queued.
  const ads: Array<LlmAdT | undefined> = slots.map(() => undefined);
  const rowIds = new Map<number, string>();
  const flagged = new Map<number, string>();
  let createdCount = 0;
  let chain: Promise<void> = Promise.resolve();
  const layoutFor = async (slot: number, a: LlmAdT): Promise<AdSpec> => {
    const { catalog } = await prep;
    const known = ads.map((x, i) => (x ? toSpec(x, i, "static", slots[i] ?? "problem_aware") : null)).filter((x): x is AdSpec => x !== null);
    const assigned = assignLayouts(known, { assets: ex.assets, proof: ex.proof, ...catalog });
    return assigned.find((x) => x.index === slot) ?? toSpec(a, slot, "static", slots[slot] ?? "problem_aware");
  };
  const writeAd = async (spec: AdSpec, render: boolean): Promise<void> => {
    const data = {
      awareness: spec.awareness,
      angle: spec.angle,
      hook: spec.hook,
      headline: spec.headline,
      body: spec.body ?? null,
      cta: spec.cta ?? null,
      claims: spec.claims as unknown as Prisma.InputJsonValue,
      visualBrief: { ...spec.visual, spec } as unknown as Prisma.InputJsonValue,
    };
    await db.$transaction(async (tx) => {
      const key = spec.kind === "motion" ? -1 : spec.index;
      const existingId = rowIds.get(key);
      const row = existingId
        ? await tx.ad.update({ where: { id: existingId }, data })
        : await tx.ad.create({ data: { ...data, runId: run.id, workspaceId: run.workspaceId, kind: spec.kind, index: spec.index, status: "planned" } });
      if (!existingId) createdCount++;
      rowIds.set(key, row.id);
      if (createdCount === 1 && !existingId) await tx.adRun.update({ where: { id: run.id }, data: { status: "generating" } });
      if (render) {
        await enqueue(tx, {
          type: spec.kind === "motion" ? "render_motion" : "render_static",
          runId: run.id,
          adId: row.id,
          workspaceId: run.workspaceId,
          // Earlier ads first so the first ad lands fast; paid runs outrank trial. A run's first batch
          // (45..26) outranks other runs' QC re-renders (25), hedges (30) and replacements (35/40), so
          // a new run's ready count climbs first; photo-free statics (fastest, no image gen) get +5.
          priority: priorityFor(run.isTrial, 45 - Math.min(spec.index, 19) + (spec.kind === "static" && !spec.visual.generateImagery ? 5 : 0)),
          maxAttempts: 3,
        });
      }
    });
  };
  const commit = (incoming: LlmAdT[], final: boolean): Promise<void> => {
    chain = chain.then(async () => {
      const fresh = incoming.filter((a) => a.slot >= 0 && a.slot < slots.length && (ads[a.slot] === undefined || flagged.has(a.slot)));
      for (const a of fresh) ads[a.slot] = a;
      const known = ads.map((x, i) => ({ x, i })).filter((p): p is { x: LlmAdT; i: number } => p.x !== undefined);
      const probs = problemsFor(known.map((p) => p.x), facts);
      for (const f of fresh) {
        const k = known.findIndex((p) => p.i === f.slot);
        const why = probs.get(k);
        const ok = final || why === undefined;
        if (ok) {
          flagged.delete(f.slot);
          ads[f.slot] = finalizeClaims(f);
        } else flagged.set(f.slot, why);
        await writeAd(await layoutFor(f.slot, ads[f.slot] ?? f), ok);
      }
    });
    return chain;
  };

  // Two parallel batches; each gets its own share of the pains so angles diverge.
  // Each batch commits as soon as it returns (batch 1 can be rendering while batch 2 writes).
  let strongestSlot: number | undefined;
  await Promise.all(
    batches.map((b, bi) =>
      structured(
        ctx.provider,
        PlanOut,
        {
          system: PLAN_SYSTEM,
          prompt: `${basePrompt}\n\nIn THIS call write ONLY slots ${b.join(", ")} (keep their slot numbers). Build these angles mainly on: ${JSON.stringify(painsFor(bi))}; another writer covers the other slots${bi === 0 ? " using the other pains" : " (avoid the obvious first angle)"}. strongestSlot must be one of your slots.`,
          reasoning: "low",
          signal: ctx.signal,
        },
        ctx.usage,
      ).then(
        (r) => {
          if (bi === 0 || strongestSlot === undefined) strongestSlot = r.strongestSlot;
          return commit(r.ads.filter((a) => b.includes(a.slot)), false);
        },
        () => undefined, // missing slots get written by the repair rounds below
      ),
    ),
  );
  throwIfAborted(ctx.signal); // batch errors are swallowed above: an abort must not read as "no ads"
  if (createdCount === 0) throw new Error("strategist returned no ads");

  // Repair rounds: only flagged / missing slots (renders for the rest are already running).
  for (let round = 0; round < 2; round++) {
    const redoSlots = slots.map((_, i) => i).filter((i) => ads[i] === undefined || flagged.has(i));
    if (redoSlots.length === 0) break;
    const last = round === 1;
    const keep = ads.map((a, i) => (a && !flagged.has(i) ? `slot ${i}: ${a.angle} | ${a.headline}` : null)).filter(Boolean);
    const redo = redoSlots.map((i) => `slot ${i} (${slots[i]}): ${flagged.get(i) ?? "write this ad"}`).join("\n");
    const fix = await structured(
      ctx.provider,
      PlanOut,
      {
        system: PLAN_SYSTEM,
        prompt: `${basePrompt}\n\nThese ads are already final (do NOT repeat their angles):\n${keep.join("\n")}\n\nRewrite ONLY these slots:\n${redo}\nReturn just those slots in "ads" (strongestSlot may stay ${strongestSlot ?? 0}).`,
        reasoning: "low",
        signal: ctx.signal,
      },
      ctx.usage,
    ).catch(() => null);
    throwIfAborted(ctx.signal);
    if (fix) await commit(fix.ads.filter((a) => redoSlots.includes(a.slot)), last);
  }
  // Anything still flagged ships as-is (claims cleaned); QC is the final judge.
  const leftovers = [...flagged.keys()].map((i) => ads[i]).filter((a): a is LlmAdT => a !== undefined);
  if (leftovers.length) await commit(leftovers, true);

  const { motionOk, motionWhy } = await prep;
  const strongest = ads[strongestSlot ?? 0] ?? ads.find((a) => a !== undefined);
  for (let m = 0; m < giftPolicy(run).motionCount(run.motionCount) && strongest; m++) {
    const spec = toSpec(strongest, slots.length + m, "motion", slots[strongestSlot ?? 0] ?? "problem_aware");
    if (motionOk) {
      await writeAd(spec, true);
      continue;
    }
    const row = await db.ad.create({
      data: {
        runId: run.id,
        workspaceId: run.workspaceId,
        kind: "motion",
        index: spec.index,
        awareness: spec.awareness,
        angle: spec.angle,
        hook: spec.hook,
        headline: spec.headline,
        body: spec.body ?? null,
        cta: spec.cta ?? null,
        claims: spec.claims as unknown as Prisma.InputJsonValue,
        visualBrief: { ...spec.visual, spec } as unknown as Prisma.InputJsonValue,
        status: "failed",
        qcReport: { pass: false, checks: [{ name: "motion_available", pass: false, detail: motionWhy }] },
      },
    });
    createdCount++;
    await releaseForAd(db, row.id);
  }
  await maybeFinalizeRun(db, run.id, ctx.now());
  return { ads: createdCount, motion: motionOk, awareness: slots };
}

const OneAd = z.object({ ad: LlmAd });

/** plan job with payload.replaceAdId: write one new distinct ad to replace a failed one. */
export async function replaceAdJob(ctx: JobContext, replaceAdId: string, feedback: string, hedge = false, settle = false): Promise<unknown> {
  const { db } = ctx;
  const old = await db.ad.findUnique({ where: { id: replaceAdId }, include: { run: { include: { brandProfile: true } } } });
  if (!old) throw new PermanentJobError("ad to replace not found");
  if (qcObj(old.qcReport).replacedBy) return { skipped: "already replaced" };
  const run = old.run;
  // Hedge (parallel replacement, see replace.ts): pointless once the original passed QC or the pack is done.
  if (hedge && (old.status === "ready" || !["queued", "generating"].includes(run.status))) {
    if (qcObj(old.qcReport).replacementPending) await abandonReplacement(db, old.id);
    return { skipped: old.status === "ready" ? "original passed QC" : `run status ${run.status}` };
  }
  if (!["queued", "generating"].includes(run.status)) {
    await abandonReplacement(db, old.id);
    return { skipped: `run status ${run.status}` };
  }
  const { ex, facts, brief } = runBrief(run);
  const siblings = await db.ad.findMany({ where: { runId: run.id }, orderBy: { index: "asc" } });
  const taken = siblings.map((a) => `- ${a.angle} | ${a.headline}`).join("\n");
  const prompt = `${untrusted("brand-brief", brief)}

Write ONE new ${old.kind} ad at awareness level "${old.awareness}" to replace an ad that failed review.
The failed ad: angle "${old.angle}", headline "${old.headline}". Review feedback:\n${feedback}

It must be a NEW, distinct angle (different buyer moment) from every ad already in this run:\n${taken}
Avoid whatever caused the failure. Return {"ad": {...}} with slot 0.`;

  let ad: LlmAdT | null = null;
  for (let attempt = 0; attempt < 2 && !ad; attempt++) {
    const r = await structured(ctx.provider, OneAd, { system: PLAN_SYSTEM, prompt, reasoning: "low", signal: ctx.signal }, ctx.usage);
    const dup = findNearDuplicates([...siblings.map((s) => ({ angle: s.angle, hook: s.hook, headline: s.headline })), r.ad]);
    if (!dup.includes(siblings.length) || attempt === 1) ad = r.ad;
  }
  if (!ad) throw new Error("no replacement produced");
  const mapped = mapClaimsToFacts(ad.claims, facts);
  ad = { ...ad, claims: mapped.filter((m) => m.factIndex !== null).map((m) => ({ claim: m.claim, sourceUrl: facts[m.factIndex ?? 0]?.sourceUrl ?? m.sourceUrl })) };

  const index = Math.max(...siblings.map((s) => s.index)) + 1;
  const assetKeys = new Set(ex.assets.map((a) => a.key));
  const draft = AdSpecSchema.parse({
    index,
    kind: old.kind,
    awareness: old.awareness,
    angle: ad.angle,
    hook: ad.hook,
    headline: ad.headline.slice(0, 90),
    ...(capBody(ad.body) ? { body: capBody(ad.body) } : {}),
    ...(ad.cta ? { cta: ad.cta.slice(0, 30) } : {}),
    claims: ad.claims,
    visual: { ...ad.visual, assetKeys: ad.visual.assetKeys.filter((k) => assetKeys.has(k)) },
  });
  // Prefer layouts that already passed QC for this brand (least used first).
  const passed = siblings.filter((s) => s.status === "ready" && s.kind === "static").map((s) => (s.visualBrief as { layout?: string } | null)?.layout).filter((l): l is string => Boolean(l));
  const failedLayout = (old.visualBrief as { layout?: string } | null)?.layout;
  if (passed.length && old.kind === "static") {
    const tally = new Map<string, number>();
    for (const l of passed) tally.set(l, (tally.get(l) ?? 0) + 1);
    const best = [...tally.entries()].filter(([l]) => l !== failedLayout).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0]?.[0];
    if (best) draft.visual.layout = best;
  }
  // Layout: re-run the deterministic assignment over live siblings + the new ad, take the new one.
  const liveSpecs = siblings
    .filter((s) => s.kind === "static" && !qcObj(s.qcReport).replacedBy && s.id !== old.id)
    .map((s) => (s.visualBrief as { spec?: AdSpec } | null)?.spec)
    .filter((s): s is AdSpec => Boolean(s));
  const assigned = old.kind === "static" ? (assignLayouts([...liveSpecs, draft], { assets: ex.assets, proof: ex.proof, ...(await loadLayoutCatalog({ brandName: ex.brandName, colors: ex.colors, fonts: ex.fonts, assets: ex.assets })) }).find((s) => s.index === index) ?? draft) : draft;
  // Trial fill: the last slots get progressively safer renders (template, then typographic without photos).
  const packSiblings = siblings.filter((s) => s.kind === old.kind && !isLocked(s.visualBrief));
  // Slots still missing: promised minus ready/in-flight pack statics (failed and replaced ones don't count).
  const live = packSiblings.filter((s) => s.id !== old.id && !qcObj(s.qcReport).replacedBy && !["failed", "failed_qc"].includes(s.status)).length;
  const missing = Math.max(0, run.staticCount - live);
  let fallback = old.kind === "static" ? fallbackFor(run, packSiblings.length, attemptCap("static", run), missing) : null;
  if (old.kind === "static" && run.isTrial && fallbackOf(old.visualBrief)) fallback = "type";
  // Cap text-only ads per pack: past it, use the template renderer (site photos) instead.
  if (fallback === "type" && countTypeAds(packSiblings.filter((s) => s.id !== old.id)) >= maxTypeAds(run)) fallback = "template";
  // Settle fill (finalize.ts): the last missing slots always go typographic, the safest render, even past the type cap.
  if (settle && old.kind === "static") fallback = "type";
  const spec = fallback === "type" ? typographicSpec(assigned, liveSpecs.map((s) => s.visual.layout), ex.mainOffer) : assigned;

  const created = await db.$transaction(async (tx) => {
    const row = await tx.ad.create({
      data: {
        runId: run.id,
        workspaceId: run.workspaceId,
        kind: spec.kind,
        index,
        awareness: spec.awareness,
        angle: spec.angle,
        hook: spec.hook,
        headline: spec.headline,
        body: spec.body ?? null,
        cta: spec.cta ?? null,
        claims: spec.claims as unknown as Prisma.InputJsonValue,
        visualBrief: { ...spec.visual, spec, replaces: old.id, ...(hedge ? { hedgeOf: old.id } : {}), ...(fallback ? { fallback } : {}) } as unknown as Prisma.InputJsonValue,
        status: "planned",
      },
    });
    if (hedge) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hedgeLockKey(old.id)}))`;
    // Re-read under the lock: a hedge only supersedes the original once it has ended failed (adoptHedge).
    const cur = hedge ? await tx.ad.findUnique({ where: { id: old.id }, select: { status: true, qcReport: true } }) : old;
    const r = qcObj(cur?.qcReport);
    if (!hedge || r.replacementPending || ["failed", "failed_qc"].includes(cur?.status ?? "")) {
      delete r.replacementPending;
      await tx.ad.update({ where: { id: old.id }, data: { qcReport: { ...r, replacedBy: row.id } as Prisma.InputJsonValue } });
    }
    await enqueue(tx, {
      type: spec.kind === "motion" ? "render_motion" : "render_static",
      runId: run.id,
      adId: row.id,
      workspaceId: run.workspaceId,
      priority: priorityFor(run.isTrial, 35),
    });
    return row;
  });
  return { replaced: old.id, by: created.id };
}

const BonusOut = z.object({ ads: z.array(LlmAd) });

/** Bonus (locked upsell) motion ads: `n` new animated ads on angles distinct from every ad in the run. */
export async function planBonusMotion(ctx: JobContext, run: RunWithProfile & { id: string }, n: number, startIndex: number): Promise<AdSpec[]> {
  if (n <= 0) return [];
  const { ex, facts, brief } = runBrief(run);
  const siblings = await ctx.db.ad.findMany({ where: { runId: run.id }, orderBy: { index: "asc" }, select: { angle: true, hook: true, headline: true } });
  const levels: Awareness[] = ["problem_aware", "product_aware", "solution_aware", "most_aware", "unaware"];
  const slots = Array.from({ length: n }, (_, i) => `slot ${i}: ${levels[i % levels.length]}`).join("\n");
  const prompt = `${untrusted("brand-brief", brief)}

Write ${n} short ANIMATED (motion) ads, one per slot:\n${slots}
Each must take a NEW angle (a different buyer moment and a different reason to buy) from every ad already in this run, and from each other:\n${siblings.map((s) => `- ${s.angle} | ${s.headline}`).join("\n")}
Return {"ads": [...]} with slot numbers.`;
  const r = await structured(ctx.provider, BonusOut, { system: PLAN_SYSTEM, prompt, reasoning: "low", signal: ctx.signal }, ctx.usage);
  const assetKeys = new Set(ex.assets.map((a) => a.key));
  const real = ex.assets.filter((a) => a.kind !== "icon" && !a.hasFace && a.width >= 300).map((a) => a.key);
  const keysOr = (k: string[]) => (k.length ? k : real.slice(0, 3));
  const out: AdSpec[] = [];
  for (const [i, a] of r.ads.slice(0, n).entries()) {
    const mapped = mapClaimsToFacts(a.claims, facts);
    const claims = mapped.filter((m) => m.factIndex !== null).map((m) => ({ claim: m.claim, sourceUrl: facts[m.factIndex ?? 0]?.sourceUrl ?? m.sourceUrl }));
    const dup = findNearDuplicates([...siblings, ...out.map((o) => ({ angle: o.angle, hook: o.hook, headline: o.headline })), a]);
    if (dup.includes(siblings.length + out.length)) continue;
    out.push(
      AdSpecSchema.parse({
        index: startIndex + out.length,
        kind: "motion",
        awareness: levels[i % levels.length],
        angle: a.angle,
        hook: a.hook,
        headline: a.headline.slice(0, 90),
        ...(capBody(a.body) ? { body: capBody(a.body) } : {}),
        ...(a.cta ? { cta: a.cta.slice(0, 30) } : {}),
        claims,
        visual: { ...a.visual, assetKeys: keysOr(a.visual.assetKeys.filter((k) => assetKeys.has(k))) },
      }),
    );
  }
  return out;
}
