// Pluggable model adapters. Two pipeline modes:
//  - audio_driven: TtsAdapter (one fixed voice per actor, whole script once) + AvatarAdapter
//    (portrait + audio chunk -> talking video)
//  - native_speech: NativeSpeechAdapter (image-to-video model that speaks, e.g. Veo via KIE)
import { sleep } from "../util/sleep";
import { applyTemplate, falQueueRun, getPath, type FalSubmitted, type HttpDeps } from "./fal-queue";
import { falNativeVoiceAdapter, type NativeVoiceAdapter } from "./native-voice";
import { estimateMicros, type PipelineConfig } from "./models";

export interface MediaResult {
  url: string;
  requestId: string;
  costMicros: number;
}

export interface TtsAdapter {
  synthesize(r: { text: string; voiceId: string; voiceSettings?: unknown; defaultStability?: number; signal?: AbortSignal }): Promise<MediaResult>;
}
export interface AvatarAdapter {
  readonly model: string;
  animate(r: {
    imageUrl: string;
    audioUrl: string;
    durationSec: number;
    direction?: string;
    seed?: number;
    signal?: AbortSignal;
    resume?: FalSubmitted;
    onSubmit?: (s: FalSubmitted) => Promise<void>;
  }): Promise<MediaResult>;
  /** Estimated price of one call for this much audio (billed even when the request fails). */
  estimateMicros?(durationSec: number): number;
}
export interface NativeSpeechAdapter {
  speak(r: { imageUrl: string; text: string; voicePrompt?: string | null; gender?: string; direction?: string; signal?: AbortSignal }): Promise<MediaResult>;
}
/** Image-to-video model that speaks the line itself (native voice), e.g. Happy Horse. */
export interface NativeFalAdapter {
  readonly model: string;
  take(r: {
    imageUrl: string;
    text: string;
    voicePrompt?: string | null;
    gender?: string;
    direction?: string;
    durationSec: number;
    seed: number;
    signal?: AbortSignal;
    resume?: FalSubmitted;
    onSubmit?: (s: FalSubmitted) => Promise<void>;
  }): Promise<MediaResult>;
  estimateMicros(durationSec: number): number;
}
export interface Adapters {
  nativeVoice: NativeVoiceAdapter;
  nativeFal: NativeFalAdapter;
  tts: TtsAdapter;
  avatar: AvatarAdapter;
  avatarFallback: AvatarAdapter | null;
  native: NativeSpeechAdapter;
}

function urlFrom(output: unknown, path: string, what: string): string {
  const u = getPath(output, path);
  if (typeof u !== "string" || !u) throw new Error(`${what}: no URL at "${path}" in result`);
  return u;
}

export function falTtsAdapter(cfg: PipelineConfig["tts"], deps: HttpDeps = {}): TtsAdapter {
  return {
    async synthesize(r) {
      const settings = r.voiceSettings && typeof r.voiceSettings === "object" ? (r.voiceSettings as Record<string, unknown>) : {};
      const stability = typeof settings.stability === "number" ? settings.stability : (r.defaultStability ?? 0.5);
      const input = applyTemplate(cfg.input, { ...settings, text: r.text, voiceId: r.voiceId, stability });
      const res = await falQueueRun(cfg.endpointId, input, { pollMs: cfg.pollMs, timeoutMs: cfg.timeoutMs, signal: r.signal, ...deps });
      return { url: urlFrom(res.output, cfg.outputPath, "TTS"), requestId: res.requestId, costMicros: estimateMicros(cfg.price, { chars: r.text.length }) };
    },
  };
}

export function falAvatarAdapter(cfg: PipelineConfig["avatar"], deps: HttpDeps = {}): AvatarAdapter {
  return {
    model: cfg.endpointId,
    estimateMicros: (seconds) => estimateMicros(cfg.price, { seconds }),
    async animate(r) {
      const input = applyTemplate(cfg.input, { imageUrl: r.imageUrl, audioUrl: r.audioUrl, direction: r.direction, durationSec: r.durationSec, seed: r.seed });
      const res = await falQueueRun(cfg.endpointId, input, { pollMs: cfg.pollMs, timeoutMs: cfg.timeoutMs, signal: r.signal, resume: r.resume, onSubmit: r.onSubmit, ...deps });
      const outDur = getPath(res.output, "duration");
      const seconds = typeof outDur === "number" && outDur > 0 ? outDur : r.durationSec;
      return { url: urlFrom(res.output, cfg.outputPath, "Avatar"), requestId: res.requestId, costMicros: estimateMicros(cfg.price, { seconds }) };
    },
  };
}

/**
 * Veo prompt for REFERENCE_2_VIDEO: the reference image sets the look, so this must NEVER
 * describe appearance/setting — only the words, the voice and the delivery (CLAUDE.md).
 */
export function buildVeoPrompt(text: string, voicePrompt?: string | null, gender?: string, direction?: string): string {
  const voice = voicePrompt || `Natural, conversational ${gender === "female" ? "female" : "male"} voice, clear American English`;
  return `The person in the image speaks directly to camera, saying: "${text}"

VOICE CHARACTER (identical in every clip):
${voice}
${direction ? `DELIVERY: ${direction}\n` : ""}Deliver the speech naturally and conversationally.

CRITICAL REQUIREMENTS:
- The person maintains their current pose and setting from the reference image
- Avoid any captions, subtitles, or text overlays on screen
- Avoid any words, letters, or characters appearing on screen
- Single continuous shot, no cuts or transitions
- Start speaking immediately from the first frame
- Lip movements match the spoken words naturally`;
}

/**
 * Prompt for a native-voice take. Every take of one video gets the SAME voice block and the same
 * seed so the voice stays identical across stitched clips. The portrait sets the look, so the
 * prompt never describes appearance; only camera feel, the words, the voice and the delivery.
 */
export function buildNativeTakePrompt(text: string, voicePrompt?: string | null, gender?: string, direction?: string): string {
  const they = gender === "female" ? "She" : gender === "male" ? "He" : "They";
  const voice = voicePrompt || `a natural, conversational ${gender === "female" ? "female" : "male"} voice with a general American accent`;
  const said = text.replace(/"/g, "'");
  return [
    "Handheld iPhone front-camera selfie video, filmed by the person in the image. The phone is held at arm's length with natural small hand shake; they look into the lens and talk to camera like filming a quick honest review for friends. Natural blinking, small head tilts, small casual hand gestures, genuine expressions. Keep the exact same person, outfit and setting as the image.",
    `${they} says, in the voice of ${voice}: "${said}"`,
    direction ? `Delivery: ${direction}` : "",
    "Speaks from the first frame, at a natural pace, and stops after the last word. Same voice throughout. Real phone microphone audio with light room tone. No music, no narrator, no other voices, no subtitles, no on-screen text, no cuts.",
  ].filter(Boolean).join(" ");
}

export function falNativeAdapter(cfg: PipelineConfig["nativeFal"], deps: HttpDeps = {}): NativeFalAdapter {
  return {
    model: cfg.endpointId,
    estimateMicros: (seconds) => estimateMicros(cfg.price, { seconds }),
    async take(r) {
      const prompt = buildNativeTakePrompt(r.text, r.voicePrompt, r.gender, r.direction);
      const input = applyTemplate(cfg.input, { imageUrl: r.imageUrl, prompt, duration: r.durationSec, seed: r.seed });
      const res = await falQueueRun(cfg.endpointId, input, { pollMs: cfg.pollMs, timeoutMs: cfg.timeoutMs, signal: r.signal, resume: r.resume, onSubmit: r.onSubmit, ...deps });
      return { url: urlFrom(res.output, cfg.outputPath, "Native take"), requestId: res.requestId, costMicros: estimateMicros(cfg.price, { seconds: r.durationSec }) };
    },
  };
}

/** Whole-second take length for `text` within the model's limits. */
export function takeSeconds(text: string, cfg: Pick<PipelineConfig["nativeFal"], "speechWps" | "tailSeconds" | "minClipSeconds" | "maxClipSeconds">): number {
  const n = text.split(/\s+/).filter(Boolean).length;
  const want = Math.ceil(n / cfg.speechWps + 0.5 + cfg.tailSeconds);
  return Math.max(cfg.minClipSeconds, Math.min(cfg.maxClipSeconds, want));
}

const KIE = "https://api.kie.ai/api/v1/veo";

export function kieVeoAdapter(cfg: PipelineConfig["nativeSpeech"], deps: HttpDeps = {}): NativeSpeechAdapter {
  return {
    async speak(r) {
      const f = deps.fetchImpl ?? fetch;
      const wait = deps.sleepImpl ?? sleep;
      const now = deps.now ?? Date.now;
      const key = (deps.env ?? process.env).KIE_API_KEY;
      if (!key) throw new Error("KIE_API_KEY is not set");
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
      const sub = await f(`${KIE}/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: buildVeoPrompt(r.text, r.voicePrompt, r.gender, r.direction),
          model: cfg.model,
          generationType: "REFERENCE_2_VIDEO",
          aspect_ratio: cfg.aspectRatio,
          enableTranslation: true,
          imageUrls: [r.imageUrl],
        }),
        signal: r.signal,
      });
      if (!sub.ok) throw new Error(`KIE.ai API error: ${sub.status} - ${(await sub.text()).slice(0, 300)}`);
      const d = (await sub.json()) as { code?: number; msg?: string; data?: { taskId?: string } };
      const taskId = d.data?.taskId;
      if (d.code !== 200 || !taskId) throw new Error(`KIE.ai generation failed: ${d.msg ?? "no taskId"}`);
      const deadline = now() + cfg.timeoutMs;
      for (;;) {
        const st = await f(`${KIE}/record-info?taskId=${encodeURIComponent(taskId)}`, { headers, signal: r.signal });
        if (!st.ok) throw new Error(`KIE.ai status check failed: ${st.status}`);
        const s = (await st.json()) as {
          data?: { successFlag?: number; errorMessage?: string; errorCode?: number; response?: { resultUrls?: string[]; originUrls?: string[] } };
        };
        const flag = s.data?.successFlag;
        if (flag === 1) {
          const url = s.data?.response?.resultUrls?.[0] ?? s.data?.response?.originUrls?.[0];
          if (!url) throw new Error("KIE.ai completed but no URL returned");
          return { url, requestId: taskId, costMicros: estimateMicros(cfg.price, { seconds: cfg.clipSeconds }) };
        }
        if (flag === 2 || flag === 3) throw new Error(`KIE.ai video failed: ${s.data?.errorMessage || `code ${s.data?.errorCode}`}`);
        if (now() > deadline) throw new Error(`KIE.ai task ${taskId} timed out`);
        await wait(cfg.pollMs, r.signal);
      }
    },
  };
}

export function createAdapters(cfg: PipelineConfig, deps: HttpDeps = {}): Adapters {
  return {
    nativeVoice: falNativeVoiceAdapter(cfg.nativeVoice, deps),
    nativeFal: falNativeAdapter(cfg.nativeFal, deps),
    tts: falTtsAdapter(cfg.tts, deps),
    avatar: falAvatarAdapter(cfg.avatar, deps),
    avatarFallback: cfg.avatarFallback ? falAvatarAdapter(cfg.avatarFallback, deps) : null,
    native: kieVeoAdapter(cfg.nativeSpeech, deps) };
}
