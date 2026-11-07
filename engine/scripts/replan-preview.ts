// Re-runs only the plan LLM step on stored runs and writes old vs new copy side by side.
// Usage: set -a; . ../.env.local; set +a; CODEX_AUTH_FILE=... npx tsx scripts/replan-preview.ts [domain ...]
// Output: /Users/groot/.ezcoder/goals/website2ads/quality/copy/<domain>.md
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { TRIAL_AWARENESS_MIX, type Awareness } from "../../src/lib/ads/contracts";
import { createDb } from "../src/db";
import { awarenessSlots, runBrief } from "../src/jobs/plan";
import { untrusted } from "../src/prompts/doctrine";
import { PLAN_SYSTEM } from "../src/prompts/plan";
import { createProvider } from "../src/providers/index";
import { structured } from "../src/providers/structured";

const OUT = join(homedir(), ".ezcoder/goals/website2ads/quality/copy");
const LlmAd = z.object({
  slot: z.number().int(),
  angle: z.string(),
  hook: z.string(),
  headline: z.string(),
  body: z.string().optional(),
  cta: z.string().optional(),
  claims: z.array(z.object({ claim: z.string(), sourceUrl: z.string() })),
  visual: z.object({ concept: z.string(), assetKeys: z.array(z.string()), layout: z.string(), generateImagery: z.boolean(), imageryPrompt: z.string().optional() }),
});
const PlanOut = z.object({ ads: z.array(LlmAd), strongestSlot: z.number().int() });
const cell = (s: string | null | undefined) => (s ?? "").replace(/\|/g, "/").replace(/\n/g, " ");

async function main(): Promise<void> {
  const db = createDb();
  // Inline the auth JSON: CodexAuth.load() races when two calls start together with only a file set.
  const authFile = process.env.CODEX_AUTH_FILE;
  if (authFile && !process.env.CODEX_AUTH_JSON) process.env.CODEX_AUTH_JSON = await readFile(authFile, "utf8");
  const provider = createProvider("codex");
  const runs = await db.adRun.findMany({ where: { extraction: { not: undefined } }, include: { brandProfile: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const byDomain = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    try {
      const d = runBrief(r).ex.domain;
      if (!byDomain.has(d)) byDomain.set(d, r);
    } catch { /* no extraction */ }
  }
  const wanted = process.argv.slice(2);
  const domains = (wanted.length ? wanted : [...byDomain.keys()].sort().slice(0, 3)).filter((d) => byDomain.has(d));
  await mkdir(OUT, { recursive: true });
  for (const domain of domains) {
    const run = byDomain.get(domain);
    if (!run) continue;
    const { ex, brief } = runBrief(run);
    const mix = (run.awarenessMix as Partial<Record<Awareness, number>> | null) ?? TRIAL_AWARENESS_MIX;
    const slots = awarenessSlots(mix, run.staticCount);
    const old = await db.ad.findMany({ where: { runId: run.id, kind: "static" }, orderBy: { index: "asc" } });
    const basePrompt = `${untrusted("brand-brief", brief)}\n\nWrite ${slots.length} static ads, one per slot:\n${slots.map((l, i) => `slot ${i}: ${l}`).join("\n")}\n\nAlso return strongestSlot: the slot whose angle is the strongest (it will also become the animated ad).`;
    const half = Math.ceil(slots.length / 2);
    const batches = [slots.map((_, i) => i).slice(0, half), slots.map((_, i) => i).slice(half)].filter((b) => b.length);
    const painsFor = (bi: number) => ex.pains.filter((_, i) => i % batches.length === bi).map((p) => p.text);
    const t0 = Date.now();
    const results = await Promise.all(
      batches.map((b, bi) =>
        structured(provider, PlanOut, {
          system: PLAN_SYSTEM,
          prompt: `${basePrompt}\n\nIn THIS call write ONLY slots ${b.join(", ")} (keep their slot numbers). Build these angles mainly on: ${JSON.stringify(painsFor(bi))}; another writer covers the other slots${bi === 0 ? " using the other pains" : " (avoid the obvious first angle)"}. strongestSlot must be one of your slots.`,
          reasoning: "low",
        }, []),
      ),
    );
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const ads = results.flatMap((r) => r.ads).sort((a, b) => a.slot - b.slot);
    const rows = slots.map((lvl, i) => {
      const n = ads.find((a) => a.slot === i);
      const o = old.find((a) => a.index === i);
      return `| ${i} | ${lvl} | ${cell(o?.headline)} | ${cell(o?.body)} | ${cell(o?.cta)} | ${cell(n?.headline)} | ${cell(n?.body)} | ${cell(n?.cta)} | ${cell(n?.visual.layout)} |`;
    });
    const md = `# ${domain}\n\nRun ${run.id}. New plan time: ${secs}s (2 parallel calls, codex, reasoning low).\n\n| # | level | old headline | old body | old CTA | new headline | new body | new CTA | layout |\n|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n`;
    await writeFile(join(OUT, `${domain}.md`), md);
    console.log(`${domain}: ${secs}s -> ${join(OUT, `${domain}.md`)}`);
  }
  await db.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
