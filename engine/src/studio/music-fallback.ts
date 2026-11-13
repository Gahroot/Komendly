// Ozzy Studio safety net: a finished video with no sound gets an original music bed + sound effects picked for the
// business and mood (score-synth, offline, no licensing), unless the user asked for silence. The agent is told to
// score every video itself; this only catches the times it doesn't.
import { join } from "node:path";
import { ffprobePath, muxAudio, run, synthScore } from "../modules/ezmotion/runtime";

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

/** If `video` has no sound and silence wasn't asked for, return a new file with music + sfx; otherwise null. */
export async function ensureMusic(o: { video: string; workDir: string; userText: string; durationSec: number; salt: string; signal?: AbortSignal }): Promise<{ file: string; style: string } | null> {
  if (wantsSilence(o.userText) || !(o.durationSec > 0)) return null;
  if ((await hasAudioStream(o.video, o.signal)) !== false) return null;
  const score = pickScore(o.userText, o.durationSec, o.salt);
  const dir = join(o.workDir, "fallback-audio");
  const s = await synthScore(score, dir, o.signal);
  if (!s.ok || !s.music || !s.sfx) return null;
  const out = join(o.workDir, "engine-render-music.mp4");
  const m = await muxAudio(o.video, s.music, s.sfx, out, o.signal);
  return m.ok ? { file: out, style: String(score.style) } : null;
}
