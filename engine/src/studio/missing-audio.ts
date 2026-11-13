// Studio safety net: the agent sometimes points an <audio> element at a music file it never created or moved.
// The renderer then refuses the whole video ("Source not found for audio element"). Dropping the dangling
// audio element and rendering again delivers the video (without that track) instead of failing the turn.
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

export function isMissingAudioError(output: string): boolean {
  return /Source not found for audio element|audio_processing_failed/i.test(output);
}

const AUDIO_RE = /<audio\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1[^>]*?(?:\/>|>[\s\S]*?<\/audio>)/gi;

async function exists(p: string): Promise<boolean> {
  return Boolean(await stat(p).catch(() => null));
}

/** Remove <audio> elements whose local src doesn't exist, in the composition's HTML files. Returns how many. */
export async function dropMissingAudio(compDir: string): Promise<number> {
  let removed = 0;
  const files = (await readdir(compDir).catch(() => [] as string[])).filter((f) => f.endsWith(".html"));
  for (const f of files) {
    const path = join(compDir, f);
    const html = await readFile(path, "utf8");
    const keep = new Map<string, boolean>();
    for (const m of html.matchAll(AUDIO_RE)) {
      const src = (m[2] ?? "").trim();
      if (!src || /^(https?:|data:|blob:)/i.test(src)) continue;
      const clean = decodeURI(src.replace(/^file:\/\//, "").split(/[?#]/)[0] ?? "");
      keep.set(m[0], await exists(isAbsolute(clean) ? clean : resolve(dirname(path), clean)));
    }
    let out = html;
    for (const [el, ok] of keep) if (!ok) { out = out.split(el).join(""); removed++; }
    if (out !== html) await writeFile(path, out);
  }
  return removed;
}
