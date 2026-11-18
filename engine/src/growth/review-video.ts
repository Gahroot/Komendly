// review_quote_video: Kly review_gifts' default $0 gift. An animated quote video of ONE real review (verbatim words,
// reviewer name as published, business name + brand colour, end card) drawn locally: sharp renders SVG frames, ffmpeg
// joins them with crossfades. No AI, no paid provider; the only output is an S3 object (existing bucket).
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ReviewQuotePayloadSchema, reviewQuoteKey, type ReviewQuotePayload } from "../../../src/lib/kly/review-video";
import { PermanentJobError, type JobContext } from "../jobs/context";
import { runFfmpeg } from "../testimonial/ffmpeg";

export const W = 1080;
export const H = 1920;
export const FADE = 0.4;
const FONT = "DejaVu Sans, Liberation Sans, Noto Sans, sans-serif";

export interface Scene {
  svg: string;
  seconds: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Greedy word wrap to `max` chars per line. */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Quote split into reveal pages of <= `perPage` lines (each page shown in turn). */
export function quotePages(quote: string, maxChars = 22, perPage = 6): string[][] {
  const lines = wrap(`“${quote.trim()}”`, maxChars);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  return pages;
}

/** Text colour that reads on the background (WCAG luminance split). */
export function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  return l > 0.4 ? "#111111" : "#FFFFFF";
}

function frame(bg: string, ink: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${bg}"/><rect x="60" y="60" width="${W - 120}" height="${H - 120}" rx="48" fill="none" stroke="${ink}" stroke-opacity="0.18" stroke-width="4"/>${body.replace(/INK/g, ink)}</svg>`;
}

const text = (y: number, s: string, size: number, weight = 400, opacity = 1) =>
  `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="INK" fill-opacity="${opacity}">${esc(s)}</text>`;

/** The scenes (pure): title card, the review's words page by page, reviewer + stars, end card. */
export function buildScenes(p: ReviewQuotePayload): Scene[] {
  const bg = p.brandColor ?? "#1F2A44";
  const ink = inkFor(bg);
  const scenes: Scene[] = [{ svg: frame(bg, ink, text(860, "What our customers say", 64, 400, 0.8) + text(1000, p.businessName, p.businessName.length > 22 ? 64 : 84, 700)), seconds: 2.2 }];
  const pages = quotePages(p.quote);
  pages.forEach((lines) => {
    const top = H / 2 - (lines.length * 110) / 2 + 80;
    const words = lines.join(" ").split(/\s+/).length;
    scenes.push({ svg: frame(bg, ink, lines.map((l, i) => text(top + i * 110, l, 76, 600)).join("")), seconds: Math.min(6, Math.max(2.5, words / 2.6)) });
  });
  const stars = p.rating ? "★".repeat(p.rating) + "☆".repeat(5 - p.rating) : "";
  scenes.push({ svg: frame(bg, ink, (stars ? text(820, stars, 96, 400) : "") + text(960, `— ${p.reviewerName}`, 72, 700) + text(1060, `Review published on ${p.domain}`, 40, 400, 0.75)), seconds: 2.5 });
  scenes.push({ svg: frame(bg, ink, text(900, p.businessName, p.businessName.length > 22 ? 64 : 84, 700) + text(1010, p.domain, 48, 400, 0.8) + text(1700, "Made with Komendly", 34, 400, 0.55)), seconds: 2.2 });
  return scenes;
}

/** ffmpeg args (pure): one still input per scene, crossfaded, 30 fps H.264, silent. */
export function quoteVideoArgs(files: readonly string[], seconds: readonly number[], output: string): string[] {
  const inputs = files.flatMap((f, i) => ["-loop", "1", "-t", String(seconds[i]), "-i", f]);
  const parts: string[] = files.map((_f, i) => `[${i}:v]fps=30,format=yuv420p,setsar=1[v${i}]`);
  let last = "v0";
  let offset = 0;
  for (let i = 1; i < files.length; i++) {
    offset += (seconds[i - 1] ?? 0) - FADE;
    const out = i === files.length - 1 ? "vout" : `x${i}`;
    parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}[${out}]`);
    last = out;
  }
  if (files.length === 1) parts.push("[v0]null[vout]");
  return ["-y", ...inputs, "-filter_complex", parts.join(";"), "-map", "[vout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", output];
}

export async function reviewQuoteJob(ctx: JobContext): Promise<{ key: string }> {
  const parsed = ReviewQuotePayloadSchema.safeParse(ctx.job.payload);
  if (!parsed.success) throw new PermanentJobError("bad review_quote_video payload");
  const p = parsed.data;
  const gift = await ctx.db.klyReviewGift.findUnique({ where: { id: p.giftId }, select: { status: true } });
  if (!gift || gift.status !== "generating") throw new PermanentJobError("review gift not generating");
  const dir = await mkdtemp(path.join(tmpdir(), "review-quote-"));
  try {
    const scenes = buildScenes(p);
    const files: string[] = [];
    for (const [i, s] of scenes.entries()) {
      const f = path.join(dir, `s${i}.png`);
      await writeFile(f, await sharp(Buffer.from(s.svg)).png().toBuffer());
      files.push(f);
    }
    const out = path.join(dir, "out.mp4");
    await runFfmpeg(quoteVideoArgs(files, scenes.map((s) => s.seconds), out), ctx.signal);
    const key = reviewQuoteKey(p.giftId);
    await ctx.storage.put(key, await readFile(out), "video/mp4");
    await ctx.db.klyReviewGift.updateMany({ where: { id: p.giftId, status: "generating" }, data: { videoKey: key } });
    return { key };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
