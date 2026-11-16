// Blind A/B judge for the Ozzy Studio bench: Sol (the configured provider, on the Codex subscription) compares two renders
// of the same request from 12-frame contact sheets, twice with the order swapped, so position bias cancels out.
// Usage: CODEX_AUTH_FILE=... npx tsx scripts/studio-judge.ts --a base.mp4 --b new.mp4 --request "<text>" --out judge.json [--edit "<latest change>"]
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig } from "../src/config";
import { ffmpegPath, run } from "../src/modules/ezmotion/runtime";
import { createProvider } from "../src/providers/index";
import { structured } from "../src/providers/structured";
import type { UsageMeter } from "../src/providers/types";

const arg = (n: string, req = true) => { const i = process.argv.indexOf(`--${n}`); const v = i >= 0 ? process.argv[i + 1] : undefined; if (!v && req) throw new Error(`--${n} required`); return v; };
const A = arg("a")!, B = arg("b")!, request = arg("request")!, out = arg("out")!, edit = arg("edit", false), context = arg("context", false);

const Scores = z.object({
  wow: z.number().min(1).max(10).describe("would a small-business owner be impressed enough to pay for a tool that made this"),
  life: z.number().min(1).max(10).describe("motion and life: things move with intent the whole time, scenes flow, not a slideshow"),
  craft: z.number().min(1).max(10).describe("type, layout, readability on a phone, polish; deduct hard for any defect"),
  fit: z.number().min(1).max(10).describe("fits this business/request and its brand; the right mood"),
  original: z.number().min(1).max(10).describe("feels made for them, not a generic template"),
  request: z.number().min(1).max(10).describe(edit ? "the latest change was clearly done, and nothing else got worse" : "does what was asked (length, format, offer, content)"),
  defects: z.array(z.string()).max(8).describe("concrete visible defects with the second they appear (cut-off/overlapping/unreadable text, empty or half-built frames, invented facts, wrong offer, broken shapes)"),
});
const Verdict = z.object({ first: Scores, second: Scores, winner: z.enum(["first", "second", "tie"]), why: z.string().max(400) });

const SYSTEM = `You are a demanding creative director judging short motion-graphics ads for small businesses. You see two contact sheets: 12 frames each in time order (left to right, top to bottom), made from two different videos answering the same request. Judge each on its own merits with the rubric, then pick a winner (tie only if truly equal). Be strict: 9-10 is agency-level work people would share; 5 is a forgettable template; any cut-off, overlapping or unreadable text, empty frame or invented fact caps craft at 4. Ignore the small 'Made with Ozzy' credit line at the bottom (the studio adds it; it is not part of the ad). Facts the user gave or that come from the business's own profile are real. Frames are stills: judge motion from how much the frames change, layering and composition. Reply with JSON only.`;

async function sheet(mp4: string, dir: string, name: string): Promise<{ jpeg: Buffer; seconds: number }> {
  const ff = (await ffmpegPath())!;
  const probe = await run(ff, ["-hide_banner", "-i", mp4]);
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe.stderr ?? "");
  const seconds = d ? +d[1]! * 3600 + +d[2]! * 60 + +d[3]! : 15;
  const file = join(dir, `${name}.jpg`);
  const fps = 12 / Math.max(seconds, 1);
  await run(ff, ["-y", "-v", "error", "-i", mp4, "-vf", `fps=${fps.toFixed(4)},scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=0x202020,tile=4x3:padding=4`, "-frames:v", "1", file]);
  return { jpeg: await readFile(file), seconds };
}

const tmp = await mkdtemp(join(tmpdir(), "ozzy-judge-"));
const provider = createProvider(loadConfig().aiProvider);
const usage: UsageMeter[] = [];
try {
  const [sa, sb] = await Promise.all([sheet(A, tmp, "a"), sheet(B, tmp, "b")]);
  const ask = (x: typeof sa, y: typeof sa) => structured(provider, Verdict, {
    system: SYSTEM,
    prompt: `${context ? `${context}\n\n` : ""}The request:\n${request.slice(0, 2000)}${edit ? `\n\nThis is a REVISION. The user's latest change: ${edit.slice(0, 600)}` : ""}\n\nImage 1 = the FIRST video (${x.seconds.toFixed(1)} s). Image 2 = the SECOND video (${y.seconds.toFixed(1)} s).`,
    images: [{ mediaType: "image/jpeg", base64: x.jpeg.toString("base64") }, { mediaType: "image/jpeg", base64: y.jpeg.toString("base64") }],
    reasoning: "high",
  }, usage);
  const [ab, ba] = await Promise.all([ask(sa, sb), ask(sb, sa)]);
  const avg = (p: z.infer<typeof Scores>, q: z.infer<typeof Scores>) => Object.fromEntries((["wow", "life", "craft", "fit", "original", "request"] as const).map((k) => [k, (p[k] + q[k]) / 2]));
  const a = avg(ab.first, ba.second), b = avg(ab.second, ba.first);
  const total = (s: Record<string, number>) => Object.values(s).reduce((m, v) => m + v, 0) / 6;
  const votes = { a: (ab.winner === "first" ? 1 : 0) + (ba.winner === "second" ? 1 : 0), b: (ab.winner === "second" ? 1 : 0) + (ba.winner === "first" ? 1 : 0) };
  const res = { a: { file: A, scores: a, total: total(a), defects: [...ab.first.defects, ...ba.second.defects] }, b: { file: B, scores: b, total: total(b), defects: [...ab.second.defects, ...ba.first.defects] }, votes, why: [ab.why, ba.why], tokens: usage.reduce((m, u) => m + (u.inputTokens ?? 0) + (u.outputTokens ?? 0), 0) };
  await writeFile(out, JSON.stringify(res, null, 1));
  console.log("JUDGED", JSON.stringify({ a: res.a.total.toFixed(2), b: res.b.total.toFixed(2), votes }));
} finally {
  await rm(tmp, { recursive: true, force: true });
}
