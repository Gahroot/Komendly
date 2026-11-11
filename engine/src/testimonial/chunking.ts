// Pure helpers: split a script into speakable segments, and split one long audio track into
// <= N-second chunks cut at pauses (ffmpeg silencedetect output).

export interface Silence {
  start: number;
  end: number;
}
export interface Chunk {
  start: number;
  end: number;
}

export function parseSilenceDetect(stderr: string): Silence[] {
  const out: Silence[] = [];
  let start: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s?.[1]) start = Math.max(0, Number(s[1]));
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e?.[1] && start !== null) {
      out.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  return out;
}

/**
 * Where speech ends in a take: the start of a trailing silence that runs to the end of the file
 * (silencedetect prints silence_start with no silence_end for it), else the full duration.
 */
export function speechEndFromSilenceDetect(stderr: string, duration: number): number {
  let open: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s?.[1]) open = Math.max(0, Number(s[1]));
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e?.[1]) {
      // A silence that ends within 50 ms of the file end is still trailing.
      open = Number(e[1]) >= duration - 0.05 ? open : null;
    }
  }
  return open !== null && open > 0.5 ? Math.min(open, duration) : duration;
}

/** Greedy: cut at the latest pause midpoint within (cursor+min, cursor+max]; hard cut if none. */
export function planAudioChunks(total: number, silences: readonly Silence[], maxSec: number, minSec = 2): Chunk[] {
  if (total <= 0) return [];
  const cuts = [...silences].map((s) => (s.start + s.end) / 2).sort((a, b) => a - b);
  const chunks: Chunk[] = [];
  let cursor = 0;
  while (total - cursor > maxSec) {
    const lo = cursor + Math.min(minSec, maxSec / 2);
    const hi = cursor + maxSec;
    const cand = cuts.filter((c) => c > lo && c <= hi && total - c > 0.3);
    const cut = cand.length ? (cand[cand.length - 1] as number) : hi;
    chunks.push({ start: round3(cursor), end: round3(cut) });
    cursor = cut;
  }
  chunks.push({ start: round3(cursor), end: round3(total) });
  return chunks;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Sentence-pack text into segments of at most maxWords (long sentences split at commas, then words). */
export function segmentText(text: string, maxWords: number): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]*/g) ?? [];
  const pieces: string[] = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (words(s) <= maxWords) {
      pieces.push(s);
      continue;
    }
    let buf: string[] = [];
    for (const w of s.split(" ")) {
      buf.push(w);
      const atComma = /,$/.test(w) && buf.length >= Math.ceil(maxWords / 2);
      if (buf.length >= maxWords || atComma) {
        pieces.push(buf.join(" "));
        buf = [];
      }
    }
    if (buf.length) pieces.push(buf.join(" "));
  }
  const out: string[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last !== undefined && words(last) + words(p) <= maxWords) out[out.length - 1] = `${last} ${p}`;
    else out.push(p);
  }
  return out;
}

export const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
