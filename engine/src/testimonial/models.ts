// THE place testimonial models are chosen. Everything else reads this object, so switching
// model/pipeline is a config change (edit DEFAULT_PIPELINE or set TESTIMONIAL_PIPELINE_JSON).
// Endpoint ids for FAL TTS/avatar are placeholders until the model research lands.
import { z } from "zod";

/** Input templates: string leaves equal to "{var}" are replaced by that variable (any type). */
const Template = z.record(z.string(), z.unknown());

export const FalQueueModelSchema = z.object({
  adapter: z.literal("fal_queue"),
  endpointId: z.string().min(1),
  input: Template,
  /** Dot path to the media URL in the FAL result, e.g. "video.url". */
  outputPath: z.string().min(1),
  pollMs: z.number().int().positive().default(5_000),
  timeoutMs: z.number().int().positive().default(15 * 60_000),
});

export const PriceSchema = z.object({
  perCallMicros: z.number().nonnegative().default(0),
  perSecondMicros: z.number().nonnegative().default(0),
  perThousandCharsMicros: z.number().nonnegative().default(0),
  /** Per-second price multiplier for outputs longer than longOverSeconds (e.g. H3 x1.2 over 15 s). */
  longMultiplier: z.number().positive().default(1),
  longOverSeconds: z.number().positive().default(1e9),
});

export const NativeVoiceModelSchema = z.object({
  /** Input/prompt shape: kling = kling/v4/reference-to-video, heygen = heygen image-to-video, boreal = creatify/boreal. */
  kind: z.enum(["happy_horse", "kling", "heygen", "boreal"]),
  endpointId: z.string().min(1),
  resolution: z.string().min(1),
  minTakeSeconds: z.number().int().positive(),
  maxTakeSeconds: z.number().int().positive(),
  pollMs: z.number().int().positive().default(5_000),
  timeoutMs: z.number().int().positive().default(20 * 60_000),
  /** Billed per requested second. */
  price: PriceSchema,
});
export type NativeVoiceModel = z.infer<typeof NativeVoiceModelSchema>;

export const NativeVoiceSchema = z.object({
  models: z.record(z.string(), NativeVoiceModelSchema),
  /** Model keys: first = primary, the rest = fallbacks in order. */
  order: z.array(z.string().min(1)).min(1),
  /** Extra attempts with the same model before falling back. */
  retriesPerModel: z.number().int().min(0).max(3).default(1),
  wordsPerSecond: z.number().positive().default(2.6),
  /** Silence kept after the last word of each take. */
  tailSeconds: z.number().min(0).max(2).default(0.35),
  voiceClone: z.object({
    enabled: z.boolean().default(true),
    endpointId: z.string().min(1),
    minSeconds: z.number().positive().default(5),
    maxSeconds: z.number().positive().default(30),
    pollMs: z.number().int().positive().default(2_000),
    timeoutMs: z.number().int().positive().default(5 * 60_000),
    price: PriceSchema,
  }),
  finish: z.object({
    /** Kling already moves the camera like a hand-held phone: synthetic shake off by default. */
    shakePx: z.number().min(0).max(20).default(0),
    grain: z.number().min(0).max(30).default(3),
    sharpen: z.number().min(0).max(2).default(0.3),
    /** Takes carry their own ambience: no synthetic room tone by default. */
    roomTone: z.boolean().default(false),
  }),
});

export const PipelineConfigSchema = z.object({
  /**
   * native_fal: an image-to-video model that speaks in its own voice (Happy Horse), one take per
   * segment, voice pinned per actor by a fixed seed + identical voice description.
   */
  mode: z.enum(["native_voice", "native_fal", "native_speech", "audio_driven"]),
  /** Max seconds per generated clip/audio chunk. */
  maxChunkSeconds: z.number().positive().max(300),
  minChunkSeconds: z.number().positive().default(2),
  wordsPerSecond: z.number().positive().default(2.5),
  crossfadeSeconds: z.number().min(0).max(1).default(0.12),
  /** audio_driven: one avatar call for the whole audio when it is at most this long (no stitching). */
  singleTakeMaxSeconds: z.number().positive().default(290),
  /** Default ElevenLabs stability when the actor's voiceSettings has none. */
  defaultStability: z.number().min(0).max(1).default(0.45),
  finish: z.object({
    /** Synthetic handheld shake in px (0 = off). The avatar model already moves the camera. */
    shakePx: z.number().min(0).max(20).default(1.5),
    /** Luma grain strength for ffmpeg noise (0 = off). */
    grain: z.number().min(0).max(30).default(3),
    sharpen: z.number().min(0).max(2).default(0.3),
  }),
  nativeSpeech: z.object({
    adapter: z.literal("kie_veo"),
    model: z.enum(["veo3_fast", "veo3"]),
    aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
    clipSeconds: z.number().positive().default(8),
    pollMs: z.number().int().positive().default(10_000),
    timeoutMs: z.number().int().positive().default(15 * 60_000),
    price: PriceSchema,
  }),
  nativeFal: FalQueueModelSchema.extend({
    price: PriceSchema,
    /** Model limits for one take (Happy Horse: 3-15 s, whole seconds). */
    maxClipSeconds: z.number().int().positive().default(15),
    minClipSeconds: z.number().int().positive().default(3),
    /** Measured speaking rate of the model, used to size each take's duration. */
    speechWps: z.number().positive().default(2.3),
    /** Silence kept after the last word of each take. */
    tailSeconds: z.number().min(0).max(2).default(0.35),
  }),
  /**
   * native_voice (default): the video model speaks in its own voice; accent comes from the actor's
   * voicePrompt, and the voice is locked per actor with a Kling voice clone after the first take.
   */
  nativeVoice: NativeVoiceSchema,
  tts: FalQueueModelSchema.extend({ price: PriceSchema }),
  avatar: FalQueueModelSchema.extend({ price: PriceSchema }),
  /** Tried once when `avatar` fails; null disables. */
  avatarFallback: FalQueueModelSchema.extend({ price: PriceSchema }).nullable(),
});
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type FalQueueModel = z.infer<typeof FalQueueModelSchema>;
export type Price = z.infer<typeof PriceSchema>;

const P = (p: Partial<Price>): Price => ({ perCallMicros: 0, perSecondMicros: 0, perThousandCharsMicros: 0, longMultiplier: 1, longOverSeconds: 1e9, ...p });

export const OMNIHUMAN_PROMPT =
  "Handheld iPhone front-camera selfie video, subtle natural hand shake, natural blinking and small head movements, talking casually to camera";

// Bake-off 2 (2026-11-07): the owner rejected TTS + lip-sync as audibly AI and picked Happy Horse
// v1.1 (native voice) for the most real expressions, voice pacing and movement.
export const DEFAULT_NATIVE_VOICE: PipelineConfig["nativeVoice"] = {
  models: {
    // Owner's pick (bake-off 2): most real expressions, voice pacing and movement. No voice-reference
    // input, so the voice is held across one video's takes by the same seed + same voice description.
    happy_horse: { kind: "happy_horse", endpointId: "alibaba/happy-horse/v1.1/image-to-video", resolution: "720p", minTakeSeconds: 3, maxTakeSeconds: 15, pollMs: 5_000, timeoutMs: 20 * 60_000, price: P({ perSecondMicros: 140_000 }) }, // $0.14/s 720p ($0.18/s 1080p)
    kling: { kind: "kling", endpointId: "kling/v4/reference-to-video", resolution: "720p", minTakeSeconds: 3, maxTakeSeconds: 30, pollMs: 5_000, timeoutMs: 25 * 60_000, price: P({ perSecondMicros: 157_000 }) }, // $0.157/s 720p ($0.235/s 1080p)
    heygen: { kind: "heygen", endpointId: "heygen/heygen-video/image-to-video", resolution: "1080p", minTakeSeconds: 5, maxTakeSeconds: 15, pollMs: 5_000, timeoutMs: 20 * 60_000, price: P({ perSecondMicros: 60_000 }) }, // $0.06/s
    boreal: { kind: "boreal", endpointId: "creatify/boreal", resolution: "1080p", minTakeSeconds: 3, maxTakeSeconds: 20, pollMs: 5_000, timeoutMs: 20 * 60_000, price: P({ perSecondMicros: 30_000 }) }, // $0.03/s
  },
  order: ["happy_horse", "kling"],
  retriesPerModel: 1,
  wordsPerSecond: 2.6,
  tailSeconds: 0.35,
  // Off: the owner only needs one voice within a video, not per actor across videos.
  voiceClone: { enabled: false, endpointId: "fal-ai/kling-video/create-voice", minSeconds: 5, maxSeconds: 30, pollMs: 2_000, timeoutMs: 5 * 60_000, price: P({ perCallMicros: 7_000 }) }, // $0.007
  finish: { shakePx: 0, grain: 3, sharpen: 0.3, roomTone: false },
};

// Bake-off 2 (2026-11-07): the owner rejected TTS voices (robotic, accent mismatch) and picked
// Happy Horse v1.1 with a native, accent-matched voice; Kling v4 is the fallback.
export const DEFAULT_PIPELINE: PipelineConfig = {
  mode: "native_voice",
  nativeVoice: DEFAULT_NATIVE_VOICE,
  maxChunkSeconds: 120, // only used when audio > singleTakeMaxSeconds (OmniHuman takes 4-300 s)
  minChunkSeconds: 5, // H3 fallback needs >= 5 s of audio
  wordsPerSecond: 2.5,
  crossfadeSeconds: 0.12,
  singleTakeMaxSeconds: 290,
  defaultStability: 0.45,
  finish: { shakePx: 1.5, grain: 3, sharpen: 0.3 },
  nativeSpeech: {
    adapter: "kie_veo",
    model: "veo3_fast",
    aspectRatio: "9:16",
    clipSeconds: 8,
    pollMs: 10_000,
    timeoutMs: 15 * 60_000,
    price: P({ perCallMicros: 400_000 }), // KIE veo3_fast $0.40/clip
  },
  nativeFal: {
    adapter: "fal_queue",
    endpointId: "alibaba/happy-horse/v1.1/image-to-video",
    input: { image_url: "{imageUrl}", prompt: "{prompt}", duration: "{duration}", resolution: "720p", seed: "{seed}" },
    outputPath: "video.url",
    pollMs: 5_000,
    timeoutMs: 20 * 60_000,
    maxClipSeconds: 15,
    minClipSeconds: 3,
    speechWps: 2.3,
    tailSeconds: 0.35,
    price: P({ perSecondMicros: 140_000 }), // $0.14/s @720p ($0.18/s @1080p)
  },
  tts: {
    adapter: "fal_queue",
    endpointId: "fal-ai/elevenlabs/tts/eleven-v3",
    input: { text: "{text}", voice: "{voiceId}", stability: "{stability}", apply_text_normalization: "auto" },
    outputPath: "audio.url",
    pollMs: 2_000,
    timeoutMs: 5 * 60_000,
    price: P({ perThousandCharsMicros: 100_000 }), // $0.10 / 1k chars
  },
  avatar: {
    adapter: "fal_queue",
    endpointId: "bytedance/omnihuman/v2",
    input: { image_url: "{imageUrl}", audio_url: "{audioUrl}", prompt: OMNIHUMAN_PROMPT },
    outputPath: "video.url",
    pollMs: 5_000,
    timeoutMs: 30 * 60_000,
    price: P({ perSecondMicros: 105_000 }), // $0.105/s
  },
  avatarFallback: {
    adapter: "fal_queue",
    endpointId: "minimax/h3-max/lip-sync/image-to-video",
    input: { image_url: "{imageUrl}", audio_url: "{audioUrl}", resolution: "768P", enable_transcription: true, seed: "{seed}" },
    outputPath: "video.url",
    pollMs: 5_000,
    timeoutMs: 30 * 60_000,
    price: P({ perSecondMicros: 80_000, longMultiplier: 1.2, longOverSeconds: 15 }), // $0.08/s @768P, x1.2 over 15 s
  },
};

/** DEFAULT_PIPELINE, deep-merged one level with TESTIMONIAL_PIPELINE_JSON, validated. */
export function loadPipelineConfig(env: NodeJS.ProcessEnv = process.env): PipelineConfig {
  const raw = env.TESTIMONIAL_PIPELINE_JSON;
  if (!raw) return DEFAULT_PIPELINE;
  const o = JSON.parse(raw) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...DEFAULT_PIPELINE };
  for (const [k, v] of Object.entries(o)) {
    const base = (DEFAULT_PIPELINE as Record<string, unknown>)[k];
    merged[k] = base && typeof base === "object" && v && typeof v === "object" && !Array.isArray(v) ? { ...base, ...v } : v;
  }
  return PipelineConfigSchema.parse(merged);
}

export function estimateMicros(p: Price, u: { calls?: number; seconds?: number; chars?: number }): number {
  const sec = u.seconds ?? 0;
  const perSec = p.perSecondMicros * (sec > p.longOverSeconds ? p.longMultiplier : 1);
  return Math.round(p.perCallMicros * (u.calls ?? 1) + perSec * sec + (p.perThousandCharsMicros * (u.chars ?? 0)) / 1000);
}
