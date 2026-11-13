// extract job: crawl -> LLM extraction -> grounding -> upload assets -> BrandProfile + AdRun.
import { isFreeRun, isGiftRun, isWeeklyRun } from "../gift-policy";
import { markGiftGenerating } from "../gift";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeLogo } from "../../render/static/logo";
import type { Prisma } from "@prisma/client";
import { cleanTestimonialQuote } from "./quote-clean";
import { CONFIRM_WINDOW_SECONDS, CorrectionsSchema, ExtractionSchema, type Extraction } from "../../../../src/lib/ads/contracts";
import { looksLikeInjection } from "../../prompts/doctrine";
import { brandKey, runKey } from "../../storage/keys";
import { PermanentJobError, type JobContext } from "../context";
import { expandToSentence, isCompleteSentence, keepGrounded } from "../grounding";
import { crawlSite, SiteUnreachableError, type CrawlResult } from "./crawl";
import { llmExtract } from "./llm";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
};

function hashName(buf: Buffer, mime: string): string {
  return `${createHash("sha1").update(buf).digest("hex").slice(0, 16)}.${EXT[mime] ?? "bin"}`;
}

/** Dominant vivid colour of the logo (same analysis the static renderer uses). */
export async function logoVividColor(bytes: Buffer, mime: string, scratch: string): Promise<string | null> {
  const dir = await mkdtemp(path.join(scratch, "logo-"));
  try {
    const file = path.join(dir, `logo.${EXT[mime] ?? "png"}`);
    await writeFile(file, bytes);
    const info = await analyzeLogo(file);
    return info?.vivid ?? null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function domainOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

/** Fields listed in BrandProfile.userEdited (object of booleans or array of names). */
export function editedFields(userEdited: unknown): Set<string> {
  if (Array.isArray(userEdited)) return new Set(userEdited.filter((x): x is string => typeof x === "string"));
  if (userEdited && typeof userEdited === "object") {
    return new Set(Object.entries(userEdited).filter(([, v]) => Boolean(v)).map(([k]) => k));
  }
  return new Set();
}

export async function extractJob(ctx: JobContext, crawlFn: typeof crawlSite = crawlSite): Promise<unknown> {
  const { db, storage, job } = ctx;
  if (!job.runId) throw new PermanentJobError("extract job without runId");
  const run = await db.adRun.findUnique({ where: { id: job.runId } });
  if (!run) throw new PermanentJobError("run not found");
  if (run.status !== "extracting") return { skipped: `run status ${run.status}` };
  const gift = isGiftRun(run);
  if (gift) await markGiftGenerating(db, run.id);
  const autoConfirm = isFreeRun(run) || isWeeklyRun(run); // weekly drops re-extract stale brands with no human in the loop

  const corrections = CorrectionsSchema.safeParse(run.corrections ?? {});
  const note = corrections.success ? corrections.data.note : undefined;

  const t0 = Date.now();
  let crawl: CrawlResult;
  try {
    crawl = await crawlFn(run.url, undefined, ctx.signal);
  } catch (e) {
    if (e instanceof Error && e.name === "BlockedUrlError") throw new PermanentJobError(`This address can't be used (it isn't a public website): ${e.message}`);
    if (e instanceof SiteUnreachableError) throw new PermanentJobError(`${e.userMessage} (${e.message.slice(0, 300)})`);
    throw e;
  }
  const crawlMs = Date.now() - t0;
  if (crawl.pages.every((p) => p.text.trim().length < 50)) throw new PermanentJobError("site returned no readable content");

  if (crawl.pages.some((p) => looksLikeInjection(p.text))) {
    await db.abuseFlag.create({
      data: { workspaceId: run.workspaceId, userId: run.userId, kind: "prompt_injection", severity: "low", details: { runId: run.id, url: run.url } },
    });
  }

  // Brand profile + asset uploads run in parallel with the LLM call (they only need the crawl).
  const uploads = (async () => {
    const ts = Date.now();
    const domain = domainOf(crawl.finalUrl);
    // Gift for a domain the sender already has a profile for: use that profile as-is (never overwrite it).
    const prior = gift ? await db.brandProfile.findUnique({ where: { workspaceId_domain: { workspaceId: run.workspaceId, domain } }, select: { id: true } }) : null;
    const existing = await db.brandProfile.upsert({
      where: { workspaceId_domain: { workspaceId: run.workspaceId, domain } },
      create: { workspaceId: run.workspaceId, domain, url: crawl.finalUrl },
      update: {},
    });
    const bp = existing.id;
    // Gift: link the profile to the gift run right away, so the web can tell gift-only profiles apart
    // (BrandProfile whose runs are all kind=gift) even while extraction is still running.
    if (gift) await db.adRun.update({ where: { id: run.id }, data: { brandProfileId: bp } });
    const puts: Array<Promise<unknown>> = [];
    const logoKey = crawl.logo ? brandKey(run.workspaceId, bp, "logo", hashName(crawl.logo.bytes, crawl.logo.mime)) : null;
    if (crawl.logo && logoKey) puts.push(storage.put(logoKey, crawl.logo.bytes, crawl.logo.mime));
    const imageKeys = crawl.images.map((im) => {
      const key = brandKey(run.workspaceId, bp, "assets", hashName(im.bytes, im.mime));
      puts.push(storage.put(key, im.bytes, im.mime));
      return key;
    });
    const fonts: Extraction["fonts"] = crawl.fonts.map((f) => {
      const file = f.files[0];
      if (!file) return { family: f.family, role: f.role };
      const mime = file.mime.split(";")[0] ?? "font/woff2";
      const sourceUrl = brandKey(run.workspaceId, bp, "fonts", hashName(file.bytes, mime));
      puts.push(storage.put(sourceUrl, file.bytes, mime));
      return { family: f.family, role: f.role, sourceUrl };
    });
    // Homepage screenshot (temporary, run-scoped) for the confirm screen.
    const shot = crawl.pages[0]?.screenshot;
    if (shot) puts.push(storage.put(runKey(run.workspaceId, run.id, "extract", "home.jpg"), shot, "image/jpeg"));
    await Promise.all(puts);
    return { bp, domain, existing, keepProfile: Boolean(prior), logoKey, imageKeys, fonts, storeMs: Date.now() - ts };
  })();
  uploads.catch(() => undefined);

  const t1 = Date.now();
  const llm = await llmExtract(ctx.provider, crawl, { goal: run.goal, correctionNote: note, signal: ctx.signal }, ctx.usage);
  const llmMs = Date.now() - t1;
  // Never plan ads from an empty profile (e.g. a bot wall slipped through): generic ads are worse than a clear failure.
  if (!llm.brandName?.trim() && !llm.mainOffer?.trim()) throw new PermanentJobError("We couldn't read what this business sells from its website. Try another page of the site, such as a services or about page.");

  const pageTexts = crawl.pages.map((p) => ({ url: p.url, text: `${p.title}\n${p.description}\n${p.text}` }));
  const pains = keepGrounded(llm.pains, pageTexts);
  const proof0 = keepGrounded(llm.proof, pageTexts);
  // Testimonials must be complete sentences, verbatim: expand fragments from the page text.
  const proof = {
    dropped: proof0.dropped,
    kept: proof0.kept.map((p) => {
      if (p.kind !== "testimonial" || !p.quote) return p;
      const cleaned = cleanTestimonialQuote(p.quote);
      if (cleaned.attribution) p = { ...p, quote: cleaned.quote, text: cleanTestimonialQuote(p.text).quote, attribution: p.attribution ?? cleaned.attribution };
      const page = pageTexts.find((t) => t.url === p.sourceUrl);
      const full = page ? expandToSentence(p.quote, page.text) : null;
      return full && isCompleteSentence(full) ? { ...p, quote: full } : { ...p, complete: false };
    }),
  };
  const facts = keepGrounded(llm.facts, pageTexts);

  const { bp, domain, existing, keepProfile, logoKey, imageKeys, fonts, storeMs } = await uploads;
  const classByIndex = new Map(llm.images.map((c) => [c.id.replace(/^img/, ""), c]));
  // Unclassified photos are assumed to contain faces (never altered).
  const assets: Extraction["assets"] = crawl.images.map((im, i) => {
    const cls = classByIndex.get(String(i));
    return { key: imageKeys[i] ?? "", sourceUrl: im.sourceUrl, kind: cls?.kind ?? "other", width: im.width, height: im.height, hasFace: cls?.hasFace ?? true };
  });

  let logoAccent: string | null = null;
  const measured = new Set(crawl.colors.map((c) => c.hex.toLowerCase()));
  const colors = llm.colors
    .map((c): { hex: string; role: string } => ({ hex: c.hex.toLowerCase(), role: c.role }))
    .filter((c) => measured.has(c.hex) || /^#[0-9a-f]{6}$/.test(c.hex));
  if (colors.length === 0) for (const c of crawl.colors.slice(0, 4)) colors.push({ hex: c.hex, role: c.where });

  // Logo colours: the palette from CSS often misses the brand hue that only lives in the logo.
  if (crawl.logo) {
    const vivid = await logoVividColor(crawl.logo.bytes, crawl.logo.mime, ctx.config.scratchDir);
    if (vivid && !colors.some((c) => c.hex.toLowerCase() === vivid.toLowerCase())) colors.unshift({ hex: vivid.toLowerCase(), role: "accent" });
    logoAccent = vivid?.toLowerCase() ?? null;
  }

  const goal = run.goal === "auto" ? llm.suggestedGoal : run.goal;
  const landingPage = crawl.pages.some((p) => p.url === llm.landingPage) ? llm.landingPage : crawl.finalUrl;
  const extraction: Extraction = ExtractionSchema.parse({
    url: crawl.finalUrl,
    domain,
    brandName: llm.brandName,
    audience: llm.audience,
    mainOffer: llm.mainOffer,
    pains: pains.kept,
    proof: proof.kept,
    facts: facts.kept,
    landingPage,
    suggestedGoal: llm.suggestedGoal,
    voice: llm.voice,
    colors,
    fonts,
    logoKey,
    assets,
  });

  const edited = editedFields(existing.userEdited);
  const fields: Record<string, unknown> = {
    url: crawl.finalUrl,
    name: extraction.brandName,
    colors: extraction.colors.map((c) => (c.role === "accent" && c.hex === logoAccent ? { ...c, source: "logo" } : c)),
    fonts: extraction.fonts,
    logoKey: extraction.logoKey,
    assets: extraction.assets,
    audience: extraction.audience,
    mainOffer: extraction.mainOffer,
    pains: extraction.pains,
    proof: extraction.proof,
    facts: extraction.facts,
    landingPage: extraction.landingPage,
    voice: extraction.voice,
  };
  for (const k of edited) delete fields[k];
  if (!keepProfile) await db.brandProfile.update({ where: { id: bp }, data: fields as Prisma.BrandProfileUpdateInput });

  const now = ctx.now();
  const updated = await db.adRun.updateMany({
    where: { id: run.id, status: "extracting" },
    data: {
      extraction: extraction as unknown as Prisma.InputJsonValue,
      extractAttempts: { increment: 1 },
      brandProfileId: bp,
      resolvedGoal: goal,
      // Gifts skip the confirm screen: straight to queued (the confirm sweeper enqueues the plan job).
      ...(autoConfirm ? { status: "queued" as const, confirmedAt: now } : { status: "awaiting_confirm" as const, confirmDeadline: new Date(now.getTime() + CONFIRM_WINDOW_SECONDS * 1000) }),
    },
  });
  return {
    updated: updated.count,
    pages: crawl.pages.length,
    images: assets.length,
    dropped: { pains: pains.dropped.length, proof: proof.dropped.length, facts: facts.dropped.length },
    crawlMs,
    llmMs,
    storeMs,
  };
}
