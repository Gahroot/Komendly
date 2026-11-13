// Ozzy Studio creative direction: the strong model (Sol) writes a short concept before the cheap builder (Luna) starts,
// then looks at the finished frames once ("taste check") and sends one round of concrete notes if it feels templated,
// lifeless or broken. This is what gives cheap-model videos atmosphere, life and emotion instead of a template look.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { AIProvider, UsageMeter } from "../providers/types";
import { structured } from "../providers/structured";
import { ffmpegPath, run } from "../modules/ezmotion/runtime";

export const CONCEPT_SYSTEM = `You are the creative director of a small, award-winning motion studio. A fast junior motion designer will build your concept as an HTML/GSAP motion-graphics video (HyperFrames: real web layout, CSS, SVG, canvas, GSAP timelines, images, video, generated images). Your job is to make it feel ALIVE: atmosphere, emotion, a point of view. Never a template.

Write a concept the junior can build in one go. Plain markdown, max 380 words, these sections exactly:
# Concept
**Big idea:** one sentence (the feeling and the hook, not a layout).
**World & atmosphere:** the visual world in concrete terms: lighting (e.g. warm low sun, neon rim light, soft window light), background with depth (layered gradients, haze, grain, light leaks, bokeh, textures, a generated backdrop photo), colour grade, texture. Never a flat solid background, never cards floating on a blank colour.
**Type & motion language:** typeface personality, how words move (kinetic, masked reveals, per-letter, slow drift), camera moves (push-in, parallax between 3 depth layers, rack-focus blur, whip pans), easing, rhythm with the music.
**Scenes:** 3-6 numbered scenes with seconds, what we SEE (composition, foreground/midground/background), how it MOVES, the exact on-screen words (use the user's facts and offer exactly; never invent prices, claims or reviews), and the transition into the next scene.
**Images:** which of the provided assets to use where, and 2-3 images to GENERATE (exact prompt each, photographic unless the user asked otherwise, aspect) when real imagery is missing or weak: different shots, not crops of one picture. Prefer real/generated photographic imagery over clip-art icons.
**Sound:** music style (pulse/cinematic/minimal/lofi), bpm, key or chords, energy curve, and 2-4 hits synced to moments.
**Avoid:** 3 concrete template traps for THIS video.

Rules: match the requested length and aspect. Scenes must look different from each other (a new shot, image, framing or layout per scene: close-up, wide, detail, overhead, type-only); one background for the whole video is a slideshow. Every element you describe has a job; no decorative props that could cover the subject or the words. If the user says the video is for someone else (a client, not their business), ignore the brand assets listed. If it is a remix of a reference ad, the builder copies the reference's structure and pacing: your concept sets the world, atmosphere, imagery and emotion only. If it is a launch video, their recorded product footage is the hero; give it a cinematic treatment (device frames in a lit scene, depth, zooms on the key UI). Write for a builder, not a client: no fluff.`;

export interface ConceptInput {
  userText: string;
  brand?: { name?: string | null; url?: string | null; colors?: Array<{ hex: string; role?: string | undefined }>; photos?: Array<{ file: string; caption?: string | null }>; site?: Array<{ file: string; kind: string; label: string }> } | null;
  uploads?: Array<{ file: string; kind: string; reference?: boolean }>;
  launch?: boolean;
}

/** Pure: the concept request the creative director sees. */
export function conceptPrompt(o: ConceptInput): string {
  const lines = [`The request:\n${o.userText.trim().slice(0, 2000)}`];
  const b = o.brand;
  if (b) {
    lines.push("", `Their brand (from their website${b.url ? ` ${b.url}` : ""}): ${b.name ?? "unnamed"}${b.colors?.length ? `; colours ${b.colors.map((c) => `${c.hex}${c.role ? ` (${c.role})` : ""}`).join(", ")}` : ""}.`);
    if (b.photos?.length) lines.push(`Their real photos: ${b.photos.map((p) => `brand/photos/${p.file}${p.caption ? ` (${p.caption})` : ""}`).join("; ")}.`);
    if (b.site?.length) lines.push(`Pieces of their real website (screenshots): ${b.site.map((s) => `brand/site/${s.file} (${s.kind}: ${s.label.slice(0, 50)})`).join("; ")}.`);
  } else lines.push("", "No brand on file: invent a fitting look.");
  if (o.uploads?.length) lines.push(`Files the user uploaded: ${o.uploads.map((u) => `uploads/${u.file} (${u.reference ? "REFERENCE AD to remix" : u.kind})`).join("; ")}.`);
  if (o.launch) lines.push("This is a launch video from their recorded product footage (see uploads).");
  return lines.join("\n");
}

/** Sol writes ./concept.md. Returns the concept text, or null on any failure (the turn goes on without it). */
export async function writeConcept(provider: AIProvider, input: ConceptInput, usage: UsageMeter[], signal?: AbortSignal): Promise<string | null> {
  const r = await provider.text({ system: CONCEPT_SYSTEM, prompt: conceptPrompt(input), reasoning: "medium", ...(signal ? { signal } : {}) });
  usage.push(r.usage);
  const text = r.text.trim();
  return text.length > 200 ? text.slice(0, 6000) : null;
}

export const TasteOut = z.object({
  score: z.number().int().min(1).max(10).describe("1-10: would a top motion studio ship this as is? 8+ = yes"),
  templated: z.boolean().describe("true if it looks like a generic template: flat backgrounds, cards on blank colour, clip-art, no atmosphere"),
  broken: z.array(z.string()).max(6).describe("objective defects with the second: overlapping or cut-off text, stray shapes or props covering the subject or words, text over images that hurts reading, unreadable contrast, empty or half-built frames, missing logo/offer, misspelled or wrong offer, the same shot for most of the video"),
  notes: z.array(z.string()).max(5).describe("the most impactful concrete changes to make it feel alive and match the concept (what to change, where, how)"),
});
export type Taste = z.infer<typeof TasteOut>;

export const TASTE_SYSTEM = `You are the creative director reviewing a junior's motion-graphics video against your concept. You see a contact sheet of 10 frames in time order (left to right, top to bottom; the prompt lists each tile's second). Judge like a top studio would: atmosphere and life (depth, lighting, texture, motion implied between frames, emotion), craft (type hierarchy, composition, contrast, nothing overlapping or cut off, nothing half-built), and whether it delivers the concept and the user's exact message. Be specific and brief. Reply with JSON only.`;

/** Pure: does this review need a rework round? */
export function needsRework(t: Taste): boolean {
  return t.broken.length > 0 || t.score < 7 || (t.templated && t.score < 8);
}

/** Pure: the rework prompt sent to the builder (one round). */
export function reworkPrompt(t: Taste): string {
  const items = [...t.broken.map((b) => `- FIX: ${b}`), ...t.notes.map((n) => `- ${n}`)];
  return `[Creative director review, automatic] Score ${t.score}/10${t.templated ? ", reads as a template" : ""}. Rework the video with these notes, re-reading ./concept.md:\n${items.join("\n")}\nKeep what already works (copy, offer, music, timing unless a note says otherwise). Check the changed moments with \`hf snapshot --at\` and look at the images before you finish. Then reply to the user again in one or two plain lines about the video (don't mention this review).`;
}

function hyperframesEntry(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve("hyperframes/package.json");
    const pkg = req(pkgPath) as { bin: string | Record<string, string> };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.hyperframes;
    return bin ? join(dirname(pkgPath), bin) : null;
  } catch {
    return null;
  }
}

/** Contact sheet (10 frames, 5 per row) of a composition as a JPEG plus the seconds of each tile, or null. */
export async function compositionSheet(compDir: string, durationSec: number, signal?: AbortSignal): Promise<{ jpeg: Buffer; times: number[] } | null> {
  const entry = hyperframesEntry();
  const ff = await ffmpegPath();
  if (!entry || !ff || !(durationSec > 0)) return null;
  const times = Array.from({ length: 10 }, (_, i) => Math.round(((i + 0.5) / 10) * durationSec * 100) / 100);
  const out = await mkdtemp(join(tmpdir(), "ozzy-taste-"));
  try {
    const snap = await run(process.execPath, [entry, "snapshot", compDir, "-o", out, "--at", times.join(","), "--no-end", "--describe", "false"], { timeoutMs: 120_000, ...(signal ? { signal } : {}) });
    if (snap.code !== 0) { process.env.STUDIO_DEBUG && console.error("snap", snap.stderr.slice(-400)); return null; }
    const files = (await readdir(out)).filter((f) => f.endsWith(".png")).sort().slice(0, 10);
    if (files.length < 6) return null;
    const args = ["-y", "-v", "error"];
    for (const f of files) args.push("-i", join(out, f));
    // No drawtext (not in every ffmpeg build): the review prompt lists the seconds of each tile instead.
    const chains = files.map((_, i) => `[${i}:v]scale=480:-2[v${i}]`).join(";");
    const cols = 5;
    const layout = files.map((_, i) => `${(i % cols) === 0 ? "0" : Array.from({ length: i % cols }, (_, k) => `w${k}`).join("+")}_${Math.floor(i / cols) === 0 ? "0" : "h0"}`).join("|");
    const sheet = join(out, "sheet.jpg");
    const r = await run(ff, [...args, "-filter_complex", `${chains};${files.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${files.length}:layout=${layout}:fill=black[o]`, "-map", "[o]", "-frames:v", "1", "-q:v", "4", sheet], { timeoutMs: 60_000 });
    if (r.code !== 0) { process.env.STUDIO_DEBUG && console.error(r.stderr.slice(-600)); return null; }
    return { jpeg: await readFile(sheet), times: times.slice(0, files.length) };
  } finally {
    await rm(out, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Sol looks at the finished frames once. Null on any failure (never blocks delivery). */
export async function tasteCheck(provider: AIProvider, o: { sheet: { jpeg: Buffer; times: number[] }; concept: string; userText: string }, usage: UsageMeter[], signal?: AbortSignal): Promise<Taste | null> {
  return structured(provider, TasteOut, {
    system: TASTE_SYSTEM,
    prompt: `The user's request:\n${o.userText.slice(0, 1500)}\n\nYour concept:\n${o.concept.slice(0, 4000)}\n\nReview the contact sheet. Tiles in order are the frames at ${o.sheet.times.map((t) => `${t}s`).join(", ")}.`,
    images: [{ mediaType: "image/jpeg", base64: o.sheet.jpeg.toString("base64") }],
    reasoning: "medium",
    ...(signal ? { signal } : {}),
  }, usage).catch(() => null);
}
