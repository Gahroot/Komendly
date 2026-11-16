// Ozzy Studio safety net: a finished video with no sound gets an original music bed + sound effects picked for the
// business and mood (a licensed library track when one fits the words, else score-synth), unless the user asked for silence. The agent is told to
// score every video itself; this only catches the times it doesn't.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { VENDOR_DIR } from "../modules/ezmotion/fonts";
import { ffmpegPath, ffprobePath, muxAudio, run, synthScore } from "../modules/ezmotion/runtime";

export const MUSIC_DIR = join(VENDOR_DIR, "music");

export type LibraryTrack = { id: string; title: string; artist: string; file: string; seconds: number; bpm: number; moods: string[]; energy: number; goodFor: string[]; hits: number[]; licence: string; credit: string | null };

const WORD_TAGS: Array<[RegExp, string[]]> = [
  [/\b(lo-?fi|cozy|cosy|chill|calm|relax)/i, ["chill", "lofi"]],
  [/\b(cafe|café|coffee|bakery|pastr|tea|brunch|book|candle|florist)/i, ["cafe", "warm"]],
  [/\b(restaurant|pizza|taco|burger|food|kitchen|menu)/i, ["food"]],
  [/\b(gym|fitness|workout|sport|crossfit|yoga)/i, ["fitness"]],
  [/\b(saas|app|software|startup|dashboard|tech|ai\b|platform|api)/i, ["saas", "tech"]],
  [/\b(real estate|listing|home for sale|property|realtor)/i, ["real estate", "premium"]],
  [/\b(luxury|premium|jewel|elegant)/i, ["premium", "cinematic"]],
  [/\b(sale|black friday|cyber|% ?off|discount|deal|drop)/i, ["sale", "punchy"]],
  [/\b(launch|announce|new product|release)/i, ["launch", "upbeat"]],
  [/\b(travel|trip|hotel|vacation|tour)/i, ["travel", "vlog"]],
  [/\b(plumb|roof|hvac|electric|clean|repair|landscap|local)/i, ["local service"]],
  [/\b(spa|salon|beauty|skincare|serum|wellness)/i, ["beauty", "wellness"]],
  [/\b(wedding|emotional|story|cinematic|reveal)/i, ["cinematic", "emotional"]],
  [/\b(hype|bold|urgent|energetic|punchy)/i, ["punchy"]],
  [/\b(vlog|upbeat|happy|fun|neistat)/i, ["upbeat", "vlog"]],
  [/\b(playful|kids|toy|cute)/i, ["playful", "kids"]],
];

/** Pure: a library track for the words (tags matched), varied by salt among the near-best; null when nothing fits. */
export function pickLibraryTrack(tracks: LibraryTrack[], text: string, durationSec: number, salt: string): LibraryTrack | null {
  const want = WORD_TAGS.filter(([re]) => re.test(text)).flatMap(([, t]) => t);
  if (!want.length) return null;
  const scored = tracks
    .filter((t) => t.seconds >= durationSec)
    .map((t) => ({ t, s: want.filter((w) => t.moods.includes(w) || t.goodFor.includes(w)).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.t.id < b.t.id ? -1 : 1));
  const best = scored[0]?.s ?? 0;
  const pool = scored.filter((x) => x.s >= best - (best > 1 ? 1 : 0)).slice(0, 6);
  return pool.length ? (pool[hash(`${salt}:${text}`) % pool.length]?.t ?? null) : null;
}

async function loadLibrary(dir: string): Promise<LibraryTrack[]> {
  try {
    return (JSON.parse(await readFile(join(dir, "tracks.json"), "utf8")) as { tracks: LibraryTrack[] }).tracks;
  } catch {
    return [];
  }
}

export type MusicStyle = "pulse" | "cinematic" | "minimal" | "lofi";

/** The user asked for a silent video. */
export function wantsSilence(text: string): boolean {
  return /\b(no|without|skip|mute[ds]?|silent|zero)\s+(background\s+)?(music|sound|audio)\b|\bsilent( video| ad)?\b|\bno soundtrack\b/i.test(text);
}

const MOODS: Array<{ style: MusicStyle; bpm: [number, number]; re: RegExp }> = [
  { style: "lofi", bpm: [76, 90], re: /\b(lo-?fi|cafe|café|coffee|bakery|pastr|tea|cozy|cosy|chill|book|candle|pizza|brunch|florist|vintage|jazz)/i },
  { style: "cinematic", bpm: [68, 96], re: /\b(cinematic|luxury|premium|real estate|listing|home for sale|wedding|jewel|spa|before\/after|before and after|reveal|logo reveal|emotional|editorial|law|lawyer|injury|medical|dental|clinic)/i },
  { style: "minimal", bpm: [98, 112], re: /\b(saas|app|software|startup|feature|dashboard|tech|ai\b|invoice|api|platform|minimal|clean|skincare|serum|beauty)/i },
  { style: "pulse", bpm: [116, 140], re: /\b(sale|black friday|cyber|% ?off|discount|deal|drop|launch|gym|fitness|sneaker|streetwear|hype|bold|urgent|countdown|plumb|roof|hvac|electric|taco|burger|truck|energy|sport)/i },
];

const PROGRESSIONS = [["Am", "F", "C", "G"], ["Em", "C", "G", "D"], ["Dm", "Bb", "F", "C"], ["C", "G", "Am", "F"], ["F", "C", "Dm", "Bb"], ["Gm", "Eb", "Bb", "F"], ["D", "A", "Bm", "G"]];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Pure: a score fitted to the request (style + tempo from the words, chords/seed varied per session). */
export function pickScore(text: string, durationSec: number, salt: string): Record<string, unknown> {
  const mood = MOODS.find((m) => m.re.test(text)) ?? MOODS[3]!;
  const h = hash(`${salt}:${text}`);
  const bpm = mood.bpm[0] + (h % (mood.bpm[1] - mood.bpm[0] + 1));
  const duration = Math.max(3, Math.round(durationSec * 100) / 100);
  const beat = 60 / bpm;
  const bar = beat * 4;
  const hits: Array<Record<string, unknown>> = [{ t: 0, sfx: mood.style === "lofi" ? "pop" : "impact", gain: 0.6 }];
  for (let t = bar * 2; t < duration - 1; t += bar * 2) hits.push({ t: Math.round(t * 100) / 100, sfx: mood.style === "pulse" ? "whoosh-short" : "whoosh", gain: 0.5 });
  const end = Math.max(0, duration - Math.min(3, duration / 4));
  hits.push({ t: Math.round(Math.max(0, end - bar) * 100) / 100, sfx: "riser", gain: 0.7 }, { t: Math.round(end * 100) / 100, sfx: "impact", gain: 0.8 });
  return {
    bpm,
    duration,
    seed: h % 1000,
    chords: PROGRESSIONS[h % PROGRESSIONS.length],
    style: mood.style,
    sections: [{ name: "intro", from: 0, energy: mood.style === "pulse" ? 0.6 : 0.4 }, { name: "lift", from: Math.round(duration * 0.45 * 100) / 100, energy: mood.style === "pulse" ? 0.9 : 0.7 }, { name: "end", from: Math.round(end * 100) / 100, energy: 0.8 }],
    hits,
    room: "room",
    duck: 0.6,
    ending: "resolve",
  };
}

async function hasAudioStream(file: string, signal?: AbortSignal): Promise<boolean | null> {
  const fp = await ffprobePath();
  if (!fp) return null;
  const r = await run(fp, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file], { signal });
  return r.code === 0 ? r.stdout.trim().length > 0 : null;
}

/** If `video` has no sound and silence wasn't asked for, return a new file with a library track fitted to the words (trimmed + faded), else synthesized music + sfx; otherwise null. */
export async function ensureMusic(o: { video: string; workDir: string; userText: string; durationSec: number; salt: string; signal?: AbortSignal; libraryDir?: string }): Promise<{ file: string; style: string; trackId?: string; credit?: string | null } | null> {
  if (wantsSilence(o.userText) || !(o.durationSec > 0)) return null;
  if ((await hasAudioStream(o.video, o.signal)) !== false) return null;
  const lib = o.libraryDir ?? MUSIC_DIR;
  const track = pickLibraryTrack(await loadLibrary(lib), o.userText, o.durationSec, o.salt);
  const ff = track ? await ffmpegPath() : null;
  if (track && ff) {
    const out = join(o.workDir, "engine-render-music.mp4");
    const d = Math.round(o.durationSec * 100) / 100;
    const fade = Math.min(2, d / 4);
    const af = `atrim=0:${d},afade=t=out:st=${(d - fade).toFixed(2)}:d=${fade.toFixed(2)}`;
    const r = await run(ff, ["-y", "-v", "error", "-i", o.video, "-i", join(lib, track.file), "-filter:a", af, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out], { signal: o.signal });
    if (r.code === 0) return { file: out, style: "library", trackId: track.id, credit: track.credit };
  }
  const score = pickScore(o.userText, o.durationSec, o.salt);
  const dir = join(o.workDir, "fallback-audio");
  const s = await synthScore(score, dir, o.signal);
  if (!s.ok || !s.music || !s.sfx) return null;
  const out = join(o.workDir, "engine-render-music.mp4");
  const m = await muxAudio(o.video, s.music, s.sfx, out, o.signal);
  return m.ok ? { file: out, style: String(score.style) } : null;
}

/** Pure: "Music: ..." credit lines for library tracks a composition uses (CC-BY needs the credit shown to the user). */
export function creditsFor(tracks: LibraryTrack[], html: string): string[] {
  return tracks.filter((t) => t.credit && html.includes(t.file)).map((t) => t.credit as string);
}

/** Credit lines for the library tracks used in a composition's index.html. */
export async function compositionMusicCredits(html: string, libraryDir: string = MUSIC_DIR): Promise<string[]> {
  return html ? creditsFor(await loadLibrary(libraryDir), html) : [];
}

/** Pure: the reply with a music credit line appended (once). */
export function withMusicCredit(reply: string, credits: string[]): string {
  const add = [...new Set(credits)].filter((c) => !reply.includes(c));
  return add.length ? `${reply.trim()}\n\nMusic: ${add.join("; ")}`.trim() : reply;
}
