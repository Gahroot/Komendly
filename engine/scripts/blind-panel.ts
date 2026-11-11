// Blind quality panel: 3 AI judges (media buyer, business owner, creative director) score each pooled ad
// against the written standard (QUALITY_STANDARD.md). Pool items carry neutral ids only.
// Usage (from engine/): CODEX_AUTH_FILE=~/.ezcoder/auth.json npx tsx scripts/blind-panel.ts --pool <dir> [--concurrency 6] [--limit N]
//   <dir>/items.json: [{ id, kind: "static"|"video", files: ["p001.png", ...], context?: { business, url, summary } }]
//   Writes <dir>/judgements.jsonl (resumable: skips id+judge pairs already present).
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createProvider } from "../src/providers/index";
import { structured } from "../src/providers/structured";
import type { UsageMeter } from "../src/providers/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type Item = { id: string; kind: "static" | "video"; files: string[]; context?: { business?: string; url?: string; summary?: string; facts?: string[] } | null };

const GATES = ["G1_technical", "G2_text_integrity", "G3_truth", "G4_brand_accuracy", "G5_meta_policy", "G6_no_uncanny_ai", "G7_phone_legibility"] as const;
const SCORES = ["S1_thumbstop_craft", "S2_clarity", "S3_buyer_relevance", "S4_brand_fit", "S5_cta"] as const;

export const Judgement = z.object({
  gates: z.object(Object.fromEntries(GATES.map((g) => [g, z.object({ pass: z.boolean(), why: z.string() })])) as Record<(typeof GATES)[number], z.ZodObject<{ pass: z.ZodBoolean; why: z.ZodString }>>),
  scores: z.object(Object.fromEntries(SCORES.map((s) => [s, z.number().min(1).max(5)])) as Record<(typeof SCORES)[number], z.ZodNumber>),
  S6_hook_pacing: z.number().min(1).max(5).nullable(),
  would_run_as_is: z.boolean(),
  one_line: z.string(),
});

const STANDARD = `READY-TO-RUN STANDARD (judge strictly; the question: would a small-business owner post this to Meta exactly as-is, and would a media buyer put money behind it?)
GATES (pass/fail):
- G1_technical: a standard Meta placement ratio (1:1, 4:5, 9:16 or 1.91:1), sharp, no compression or AI artifacts. (Judge only what you can see.)
- G2_text_integrity: no misspelling, garbled AI lettering, cut-off/overlapping text, logo covering copy, text clipped by the frame.
- G3_truth: no invented number/price/result/timeframe/guarantee/award/review/testimonial/product. If site context is given, check against it; if not, fail only claims that look fabricated or implausible.
- G4_brand_accuracy: business name/logo not mangled; imagery clearly belongs to this business/industry.
- G5_meta_policy: no assertion of personal attributes ("Are you overweight?", "your debt"), no health/weight before-after, no exaggerated claims, no fake buttons/UI, nothing shocking. For 9:16 video, key text must not sit in the top ~14% or bottom ~35% (Reels UI).
- G6_no_uncanny_ai: no distorted hands/faces/products, no AI people posing as real customers/staff, no melted objects, no cheap "AI stock" look that hurts trust.
- G7_phone_legibility: headline readable at ~375px feed width within ~2 seconds.
SCORES 1-5: S1 thumb-stop & craft (5 = strong agency work, 1 = cheap template/clip-art); S2 clarity (one idea in 2s); S3 buyer relevance (speaks to this buyer's real situation, not a generic slogan); S4 brand fit; S5 call to action (is the next step obvious? Meta shows its own CTA button (e.g. "Learn more", "Sign up") under every feed ad, so an in-image button is NOT required: score whether the copy makes the action clear and fitting). S6 hook & pacing for VIDEO only (first 1-2s hook, readable captions, ends on brand+CTA) else null.
Be calibrated: 3 = acceptable/ordinary, 4 = good, 5 = excellent. Most real small-business ads are 2-3. Don't be generous.`;

const JUDGES: Record<string, string> = {
  media_buyer: "You are a senior Meta media buyer who has spent millions on Facebook/Instagram ads for small businesses. You care about policy rejections, thumb-stop, clarity and conversion.",
  owner: "You are the owner of the small business this ad is for (or a typical owner in its industry). You only post things that make your business look professional and honest; anything off-brand, fake or embarrassing is a no.",
  creative_director: "You are a senior creative director at a performance-creative agency. You judge craft: typography, layout, hierarchy, imagery, brand consistency, copy quality.",
};

const pool = arg("pool");
if (!pool) throw new Error("--pool <dir> required");
const items = JSON.parse(await readFile(path.join(pool, "items.json"), "utf8")) as Item[];
const outFile = path.join(pool, "judgements.jsonl");
const done = new Set<string>();
try {
  for (const line of (await readFile(outFile, "utf8")).split("\n")) if (line.trim()) { const j = JSON.parse(line) as { id: string; judge: string }; done.add(`${j.id}|${j.judge}`); }
} catch { /* first run */ }

const provider = createProvider((process.env.AI_PROVIDER as "codex" | "openai") ?? "codex");
const usage: UsageMeter[] = [];
const tasks: Array<{ item: Item; judge: string }> = [];
for (const item of items.slice(0, Number(arg("limit") ?? items.length))) for (const judge of Object.keys(JUDGES)) if (!done.has(`${item.id}|${judge}`)) tasks.push({ item, judge });
console.log(`${tasks.length} judgements to do (${done.size} already done)`);

const mime = (f: string) => (f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg");
let next = 0, ok = 0, failed = 0;
async function worker() {
  while (next < tasks.length) {
    const { item, judge } = tasks[next++]!;
    try {
      const images = await Promise.all(item.files.map(async (f) => ({ mediaType: mime(f), base64: (await readFile(path.join(pool!, f))).toString("base64") })));
      const ctx = item.context?.business || item.context?.url ? `Business: ${item.context.business ?? "?"} (${item.context.url ?? "no url"}). What it sells: ${item.context.summary ?? "unknown"}.${item.context.facts?.length ? `\nSITE FACTS (verbatim quotes from the business's own website; a claim supported by one of these passes G3, anything else must still be supported):\n${item.context.facts.slice(0, 40).map((f) => `- ${f}`).join("\n")}` : ""}` : "No site context available: judge brand/truth from the ad itself.";
      const what = item.kind === "video" ? `These ${images.length} images are frames from ONE short vertical video ad, in time order (first = opening).` : "This image is ONE static social feed ad.";
      const j = await structured(provider, Judgement, { system: `${JUDGES[judge]}\n\n${STANDARD}`, prompt: `${what}\n${ctx}\nJudge it against the standard. Give a short concrete 'why' for every gate (especially fails). Return JSON.`, images, reasoning: "medium" }, usage);
      await appendFile(outFile, JSON.stringify({ id: item.id, judge, kind: item.kind, ...j }) + "\n");
      ok++;
    } catch (e) {
      failed++;
      console.error(`fail ${item.id} ${judge}: ${(e as Error).message.slice(0, 200)}`);
    }
    if ((ok + failed) % 20 === 0) console.log(`progress ${ok + failed}/${tasks.length} (fail ${failed})`);
  }
}
await Promise.all(Array.from({ length: Number(arg("concurrency") ?? 6) }, worker));
console.log(`done ok=${ok} failed=${failed}`);
