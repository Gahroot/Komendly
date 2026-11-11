// native_voice mode: the video model speaks the take itself (no TTS, no lip-sync). The accent comes
// from the actor's voicePrompt; the portrait sets the look, so prompts never describe appearance.
// Kling v4 is the default; HeyGen and Creatify Boreal are fallbacks behind the same interface.
import { applyTemplate, falQueueRun, getPath, type FalSubmitted, type HttpDeps } from "./fal-queue";
import { segmentText, words } from "./chunking";
import { estimateMicros, type NativeVoiceModel, type PipelineConfig } from "./models";

export interface TakeRequest {
  imageUrl: string;
  text: string;
  voicePrompt?: string | null;
  gender?: string;
  direction?: string;
  durationSec: number;
  /** Locked Kling voice for this actor (bound to @Element1); ignored by other models. */
  klingVoiceId?: string | null;
  /** Same for every take of one video (Happy Horse/Kling seed) so the voice stays consistent. */
  seed?: number;
  signal?: AbortSignal;
  resume?: FalSubmitted;
  onSubmit?: (s: FalSubmitted) => Promise<void>;
}

export interface NativeVoiceAdapter {
  take(modelKey: string, r: TakeRequest): Promise<{ url: string; requestId: string; costMicros: number }>;
  /** Kling create-voice from a clean 5-30 s single-voice clip. */
  cloneVoice(audioUrl: string, signal?: AbortSignal): Promise<{ voiceId: string; costMicros: number }>;
}

const subject = (gender?: string) => (gender === "female" ? "She" : gender === "male" ? "He" : "They");

export function visualDirection(gender?: string): string {
  const s = subject(gender);
  const holds = s === "They" ? "hold" : "holds";
  const looks = s === "They" ? "look" : "looks";
  const talks = s === "They" ? "talk" : "talks";
  return `Handheld iPhone front-camera selfie video. ${s} ${holds} the phone at arm's length with natural small hand shake, ${looks} into the lens and ${talks} to the camera like filming a quick review for friends; natural blinking, small head tilts, an occasional small casual hand gesture, genuine expressions.`;
}

export const AUDIO_DIRECTION = "Real phone microphone audio with light room tone. No music, no narrator, no subtitles, no on-screen text.";

const voiceOf = (voicePrompt?: string | null, gender?: string) =>
  voicePrompt?.trim() || `a natural, conversational ${gender === "female" ? "woman" : "man"} with a general American accent`;

/** The exact prompt for one take (Kling/HeyGen: plain; Boreal: sectioned). */
export function buildTakePrompt(kind: NativeVoiceModel["kind"], r: Pick<TakeRequest, "text" | "voicePrompt" | "gender" | "direction" | "klingVoiceId">): string {
  const line = r.text.replace(/"/g, "'").trim();
  const voice = voiceOf(r.voicePrompt, r.gender);
  const visual = visualDirection(r.gender);
  const delivery = r.direction ? ` Delivery: ${r.direction}` : "";
  if (kind === "boreal") {
    return `[VISUAL]\n${visual}\n\n[SPEECH]\nSpeaker: ${voice}.${delivery}\n"${line}"\n\n[SOUNDS]\n${AUDIO_DIRECTION}\n\n[TEXT]\nNone.`;
  }
  const speech = `${subject(r.gender)} says, in the voice of ${voice}: "${line}"${delivery}`;
  const plain = `${visual} ${speech} ${AUDIO_DIRECTION}`;
  if (kind === "kling") return `@Image1 is the opening frame.${r.klingVoiceId ? " The person is @Element1, speaking in @Element1's own voice." : ""} ${plain}`;
  return plain;
}

export function takeInput(m: NativeVoiceModel, r: TakeRequest): Record<string, unknown> {
  const prompt = buildTakePrompt(m.kind, r);
  const duration = r.durationSec;
  if (m.kind === "kling") {
    return {
      prompt,
      start_image_url: r.imageUrl,
      duration,
      resolution: m.resolution,
      aspect_ratio: "9:16",
      ...(r.klingVoiceId ? { elements: [{ frontal_image_url: r.imageUrl, reference_image_urls: [r.imageUrl], voice_id: r.klingVoiceId }] } : {}),
    };
  }
  if (m.kind === "happy_horse") return { prompt, image_url: r.imageUrl, duration, resolution: m.resolution, ...(r.seed !== undefined ? { seed: r.seed } : {}) };
  if (m.kind === "heygen") return { prompt, image_url: r.imageUrl, duration, resolution: m.resolution, prompt_enhancement: "disabled" };
  return { prompt, image_url: r.imageUrl, duration, resolution: m.resolution, aspect_ratio: "9:16" };
}

/** Whole-second take length for `text` at `wps`, within the model's limits. */
export function takeSecondsFor(text: string, m: Pick<NativeVoiceModel, "minTakeSeconds" | "maxTakeSeconds">, wps: number, tail: number): number {
  const want = Math.ceil(words(text) / wps + 0.5 + tail);
  return Math.max(m.minTakeSeconds, Math.min(m.maxTakeSeconds, want));
}

/** Max words one take of `m` can hold. */
export const takeMaxWords = (m: Pick<NativeVoiceModel, "maxTakeSeconds">, wps: number, tail: number) => Math.max(4, Math.floor((m.maxTakeSeconds - 0.5 - tail) * wps));

export interface TakeUnit {
  text: string;
  direction: string;
}

/**
 * Split the script into the fewest takes of <= maxWords, cut at sentence boundaries and balanced
 * (60 s on Kling = two ~30 s takes, not 30 + 30 + 2). Each take keeps its first sentence's direction.
 */
export function planTakes(segments: readonly TakeUnit[], maxWords: number): TakeUnit[] {
  const units: TakeUnit[] = segments.flatMap((s) => segmentText(s.text, maxWords).flatMap((chunk) => (chunk.match(/[^.!?]+[.!?]*/g) ?? [chunk]).map((t) => ({ text: t.trim(), direction: s.direction })))).filter((u) => u.text);
  const total = units.reduce((a, u) => a + words(u.text), 0);
  if (total === 0) return [];
  for (let n = Math.ceil(total / maxWords); ; n++) {
    const target = total / n;
    const takes: TakeUnit[] = [];
    let cur: TakeUnit | null = null;
    let done = 0;
    for (const u of units) {
      const w = words(u.text);
      const curW = cur ? words(cur.text) : 0;
      const closeForBalance = cur !== null && takes.length < n - 1 && done + curW + w / 2 > target * (takes.length + 1);
      if (cur && (curW + w > maxWords || closeForBalance)) {
        takes.push(cur);
        done += curW;
        cur = null;
      }
      cur = cur ? { text: `${cur.text} ${u.text}`, direction: cur.direction } : { ...u };
    }
    if (cur) takes.push(cur);
    if (takes.every((t) => words(t.text) <= maxWords)) return takes;
  }
}

function videoUrl(output: unknown): string {
  const v = getPath(output, "video");
  const u = Array.isArray(v) ? getPath(v[0], "url") : getPath(v, "url");
  if (typeof u !== "string" || !u) throw new Error("native take: no video.url in result");
  return u;
}

export function falNativeVoiceAdapter(cfg: PipelineConfig["nativeVoice"], deps: HttpDeps = {}): NativeVoiceAdapter {
  return {
    async take(modelKey, r) {
      const m = cfg.models[modelKey];
      if (!m) throw new Error(`unknown native voice model "${modelKey}"`);
      const res = await falQueueRun(m.endpointId, takeInput(m, r), { pollMs: m.pollMs, timeoutMs: m.timeoutMs, signal: r.signal, resume: r.resume, onSubmit: r.onSubmit, ...deps });
      return { url: videoUrl(res.output), requestId: res.requestId, costMicros: estimateMicros(m.price, { seconds: r.durationSec }) };
    },
    async cloneVoice(audioUrl, signal) {
      const c = cfg.voiceClone;
      const res = await falQueueRun(c.endpointId, applyTemplate({ voice_url: "{url}" }, { url: audioUrl }), { pollMs: c.pollMs, timeoutMs: c.timeoutMs, signal, ...deps });
      const id = getPath(res.output, "voice_id");
      if (typeof id !== "string" || !id) throw new Error("create-voice returned no voice_id");
      return { voiceId: id, costMicros: estimateMicros(c.price, {}) };
    },
  };
}
