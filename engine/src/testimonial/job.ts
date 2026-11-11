// testimonial_generate: script -> (voice) -> clips -> stitch + iPhone finish -> upload.
// Idempotent across retries: script/plan checkpoints live in pipelineState, finished clips are
// never regenerated, minutes are settled exactly once (store.complete / store.fail).
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { minutesForDuration, RecommendActorsPayloadSchema, TESTIMONIAL_JOB_TYPE, TestimonialJobPayloadSchema, type TestimonialJobPayload } from "../../../src/lib/testimonial/contracts";
import type { Db } from "../db";
import { PermanentJobError, type JobContext } from "../jobs/context";
import type { AIProvider, UsageMeter } from "../providers/types";
import { createAdapters, takeSeconds, type Adapters, type AvatarAdapter, type MediaResult } from "./adapters";
import { planAudioChunks, segmentText, words } from "./chunking";
import { planTakes, takeMaxWords, takeSecondsFor } from "./native-voice";
import { realMedia, type MediaOps } from "./media";
import { estimateMicros, loadPipelineConfig, type PipelineConfig } from "./models";
import { recommendActors, stripAudioTags, writeScript } from "./script";
import { prismaStore, type ClipRow, type NewClip, type PipelineState, type TestimonialStore } from "./store";

export interface TestimonialDeps {
  store: TestimonialStore;
  adapters: Adapters;
  media: MediaOps;
  provider: AIProvider | null;
  config: PipelineConfig;
  scratchDir: string;
  usage: UsageMeter[];
  signal?: AbortSignal;
}

const clipType = (i: number, n: number) => (n > 1 && i === 0 ? "hook" : n > 2 && i === n - 1 ? "cta" : "testimonial");
/** OmniHuman needs >= 4 s and the H3 fallback >= 5 s of audio: shorter speech is padded to PAD_TO_SECONDS. */
export const MIN_AVATAR_AUDIO_SECONDS = 5;
export const PAD_TO_SECONDS = 5.5;
/** Natural tail kept after the speech when padding is trimmed off in finish. */
const PAD_TAIL_SECONDS = 0.4;

const spend = (d: TestimonialDeps, costMicros: number) => d.usage.push({ costMicros, latencyMs: 0 });
/** FAL rejected the input (4xx). Such requests can still be billed, and retrying the same input fails again. */
export const isInputError = (e: unknown) => / failed: 4\d\d\b/.test(e instanceof Error ? e.message : String(e));

export async function runTestimonial(d: TestimonialDeps, p: TestimonialJobPayload): Promise<{ status: "completed"; finalVideoUrl?: string; skipped?: boolean }> {
  const id = p.compositeVideoId;
  let loaded = await d.store.load(id);
  if (!loaded) throw new PermanentJobError(`composite video ${id} not found`);
  if (loaded.video.status === "completed") return { status: "completed", skipped: true };
  if (loaded.video.status === "failed" || loaded.video.minutesState === "released") throw new PermanentJobError("video already failed/released");
  const { config: cfg } = d;
  const primary = cfg.nativeVoice.models[cfg.nativeVoice.order[0] ?? ""];
  if (cfg.mode === "native_voice" && !primary) throw new PermanentJobError(`native voice model "${cfg.nativeVoice.order[0]}" is not configured`);
  const maxWords = cfg.mode === "native_voice" && primary
    ? takeMaxWords(primary, cfg.nativeVoice.wordsPerSecond, cfg.nativeVoice.tailSeconds)
    : cfg.mode === "native_fal"
      ? Math.max(4, Math.floor((cfg.nativeFal.maxClipSeconds - 0.5 - cfg.nativeFal.tailSeconds) * cfg.nativeFal.speechWps))
      : Math.max(4, Math.floor((cfg.mode === "native_speech" ? cfg.nativeSpeech.clipSeconds : cfg.maxChunkSeconds) * cfg.wordsPerSecond));
  let state: PipelineState = { ...loaded.video.pipelineState };
  await d.store.updateVideo(id, { status: "generating_clips", pipeline: cfg.mode, modelConfig: cfg });

  // 1. Script (+ per-clip delivery direction)
  let segments = loaded.clips.map((c) => ({ text: c.scriptContent, direction: c.deliveryDirection ?? "" }));
  if (!state.scriptDone) {
    const s = await writeScript(
      d.provider,
      { reviewText: loaded.video.reviewText, reviewerName: loaded.video.reviewerName, businessName: loaded.video.businessName, targetSeconds: loaded.video.targetDuration, maxWords, customScript: p.customScript, useAI: p.useAIScript },
      d.signal,
    );
    if (s.usage) d.usage.push(s.usage);
    state = { ...state, scriptDone: true, segments: s.segments, preCostMicros: (state.preCostMicros ?? 0) + (s.usage?.costMicros ?? 0) };
    await d.store.saveScript(id, { fullScript: s.fullScript, hook: s.hook, testimonial: s.testimonial, cta: s.cta, scriptSource: s.source, state });
  }
  if (state.segments?.length) segments = state.segments;

  const work = path.join(d.scratchDir, `testimonial-${id}`);
  await mkdir(work, { recursive: true });
  try {
    // 2. Clip plan (one voice identity for the whole video)
    if (!state.clipsPlanned) {
      let clips: NewClip[];
      if (cfg.mode === "native_voice") {
        const takes = planTakes(segments.map((s) => ({ text: stripAudioTags(s.text), direction: s.direction })), maxWords);
        clips = takes.map((t, i) => ({ clipIndex: i, clipType: clipType(i, takes.length), scriptContent: t.text, deliveryDirection: t.direction || null, audioUrl: null, startMs: null, endMs: null }));
      } else if (cfg.mode === "native_speech" || cfg.mode === "native_fal") {
        clips = segments.map((s, i) => ({ clipIndex: i, clipType: clipType(i, segments.length), scriptContent: stripAudioTags(s.text), deliveryDirection: s.direction || null, audioUrl: null, startMs: null, endMs: null }));
      } else {
        const actor = loaded.video.actor;
        // Kling voice ids (native_voice lock) are not ElevenLabs voices.
        const voiceId = (actor.voiceProvider !== "kling" ? actor.voiceId : null) ?? loaded.video.voiceId;
        if (!voiceId) throw new PermanentJobError("actor has no voiceId for audio-driven pipeline");
        const fullText = segments.map((s) => s.text).join(" ");
        if (!state.audio) {
          const tts = await d.adapters.tts.synthesize({ text: fullText, voiceId, voiceSettings: actor.voiceSettings, defaultStability: cfg.defaultStability, signal: d.signal });
          spend(d, tts.costMicros);
          const file = path.join(work, "voice-full");
          await d.media.download(tts.url, file, d.signal);
          const speech = await d.media.probe(file, d.signal);
          let audioState: NonNullable<PipelineState["audio"]> = { url: tts.url, duration: speech };
          if (speech < MIN_AVATAR_AUDIO_SECONDS) {
            const padded = path.join(work, "voice-padded.mp3");
            await d.media.pad(file, PAD_TO_SECONDS, padded, d.signal);
            audioState = { url: await d.media.upload(padded, "audio/mpeg", d.signal), duration: PAD_TO_SECONDS, speechDuration: speech };
          }
          state = { ...state, audio: audioState, preCostMicros: (state.preCostMicros ?? 0) + tts.costMicros };
          await d.store.updateVideo(id, { pipelineState: state });
        }
        const audio = state.audio;
        if (!audio) throw new Error("TTS audio missing");
        const allWords = stripAudioTags(fullText).split(/\s+/).filter(Boolean);
        const direction = segments.find((s) => words(s.text) > 0)?.direction || null;
        clips = [];
        if (audio.duration <= cfg.singleTakeMaxSeconds) {
          // Single take: one avatar call over the whole voice track, nothing to stitch.
          clips.push({ clipIndex: 0, clipType: "testimonial", scriptContent: allWords.join(" "), deliveryDirection: direction, audioUrl: audio.url, startMs: 0, endMs: Math.round(audio.duration * 1000) });
        }
        const full = path.join(work, "voice-full");
        if (clips.length === 0) await d.media.download(audio.url, full, d.signal);
        const chunks = clips.length ? [] : planAudioChunks(audio.duration, await d.media.silences(full, d.signal), cfg.maxChunkSeconds, cfg.minChunkSeconds);
        for (const [i, c] of chunks.entries()) {
          const out = path.join(work, `chunk-${i}.mp3`);
          await d.media.slice(full, c.start, c.end, out, d.signal);
          const audioUrl = await d.media.upload(out, "audio/mpeg", d.signal);
          const a = Math.round((c.start / audio.duration) * allWords.length);
          const b = Math.round((c.end / audio.duration) * allWords.length);
          clips.push({ clipIndex: i, clipType: clipType(i, chunks.length), scriptContent: allWords.slice(a, b).join(" "), deliveryDirection: direction, audioUrl, startMs: Math.round(c.start * 1000), endMs: Math.round(c.end * 1000) });
        }
      }
      if (clips.length === 0) clips = segmentText(loaded.video.reviewText, maxWords).map((t, i, all) => ({ clipIndex: i, clipType: clipType(i, all.length), scriptContent: t, deliveryDirection: null, audioUrl: null, startMs: null, endMs: null }));
      state = { ...state, clipsPlanned: true };
      await d.store.replaceClips(id, clips, state);
      loaded = await d.store.load(id);
      if (!loaded) throw new PermanentJobError("video vanished");
    }

    // 3. Clips (skip finished ones)
    const actor = loaded.video.actor;
    const saveState = async (next: PipelineState) => {
      state = next;
      await d.store.updateVideo(id, { pipelineState: state });
    };
    const nv = cfg.nativeVoice;
    // One seed per video: every take of this video gets the same seed + the same voice description,
    // so the voice stays the same across stitched clips (different videos may differ slightly).
    const videoSeed = seedOf(id) % 2_147_483_647;
    const lockedVoice = () => (actor.voiceProvider === "kling" && actor.voiceId ? actor.voiceId : (state.klingVoiceId ?? null));

    /** After the first good take of an unlocked actor: clone its voice and lock it on the actor (best effort). */
    const lockVoiceFrom = async (takeUrl: string) => {
      if (!nv.voiceClone.enabled || lockedVoice() || !nv.order.some((k) => nv.models[k]?.kind === "kling")) return;
      try {
        const src = path.join(work, "voice-src.mp4");
        await d.media.download(takeUrl, src, d.signal);
        const end = await d.media.speechEnd(src, d.signal);
        if (end < nv.voiceClone.minSeconds) return; // too short for create-voice; try the next take
        const mp3 = path.join(work, "voice-src.mp3");
        await d.media.slice(src, 0, Math.min(end, nv.voiceClone.maxSeconds), mp3, d.signal);
        const audioUrl = await d.media.upload(mp3, "audio/mpeg", d.signal);
        const v = await d.adapters.nativeVoice.cloneVoice(audioUrl, d.signal);
        spend(d, v.costMicros);
        const winner = await d.store.lockActorVoice(actor.id, v.voiceId);
        await saveState({ ...state, klingVoiceId: winner, preCostMicros: (state.preCostMicros ?? 0) + v.costMicros });
      } catch (e) {
        if (d.signal?.aborted) throw e;
        // Unlocked is still a valid video: the voicePrompt keeps the accent; retry on the next take.
      }
    };

    /** One clip in native_voice: model chain (retry once, then fall back), FAL resume, sub-takes for shorter-limit fallbacks. */
    const nativeVoiceClip = async (c: ClipRow): Promise<{ model: string; url: string; costMicros: number }> => {
      const key = String(c.clipIndex);
      const ownsKey = (k: string) => k === key || k.startsWith(`${key}:`);
      const pendModel = Object.entries(state.pendingFal ?? {}).find(([k]) => ownsKey(k))?.[1].model ?? state.takeParts?.[key]?.model;
      const startAt = Math.max(0, pendModel ? nv.order.indexOf(pendModel) : 0);
      let lastErr: unknown = new Error("no native voice model configured");
      for (const mk of nv.order.slice(startAt)) {
        const m = nv.models[mk];
        if (!m) continue;
        for (let attempt = 0; attempt <= nv.retriesPerModel; attempt++) {
          const parts = planTakes([{ text: c.scriptContent, direction: c.deliveryDirection ?? "" }], takeMaxWords(m, nv.wordsPerSecond, nv.tailSeconds));
          const prev = state.takeParts?.[key];
          const saved = prev && prev.model === mk && prev.urls.length === parts.length ? prev : { model: mk, urls: parts.map(() => null), costs: parts.map(() => 0) };
          try {
            for (const [i, part] of parts.entries()) {
              if (saved.urls[i]) continue;
              const pkey = parts.length === 1 ? key : `${key}:${i}`;
              const pend = state.pendingFal?.[pkey];
              const resume = pend && pend.model === mk ? { requestId: pend.requestId, statusUrl: pend.statusUrl, responseUrl: pend.responseUrl } : undefined;
              const durationSec = takeSecondsFor(part.text, m, nv.wordsPerSecond, nv.tailSeconds);
              let submitted = resume !== undefined;
              const dropPending = () => {
                const next = { ...state.pendingFal };
                delete next[pkey];
                return next;
              };
              let r;
              try {
                r = await d.adapters.nativeVoice.take(mk, {
                  imageUrl: actor.referenceImageUrl,
                  text: part.text,
                  voicePrompt: actor.voicePrompt,
                  gender: actor.gender,
                  direction: part.direction || undefined,
                  durationSec,
                  klingVoiceId: m.kind === "kling" ? lockedVoice() : null,
                  seed: videoSeed,
                  signal: d.signal,
                  resume,
                  onSubmit: async (sub) => {
                    submitted = true;
                    await saveState({ ...state, pendingFal: { ...state.pendingFal, [pkey]: { model: mk, ...sub } } });
                  },
                });
              } catch (e) {
                if (d.signal?.aborted) throw e; // keep pendingFal: the retry resumes the same request
                const lost = submitted ? estimateMicros(m.price, { seconds: durationSec }) : 0;
                if (lost) spend(d, lost);
                await saveState({ ...state, pendingFal: dropPending(), preCostMicros: (state.preCostMicros ?? 0) + lost });
                throw e;
              }
              spend(d, r.costMicros);
              saved.urls[i] = r.url;
              saved.costs[i] = r.costMicros;
              await saveState({ ...state, pendingFal: dropPending(), takeParts: { ...state.takeParts, [key]: { ...saved } } });
              await lockVoiceFrom(r.url);
            }
            const urls = saved.urls.filter((u): u is string => !!u);
            const costMicros = saved.costs.reduce((a, b) => a + b, 0);
            let url = urls[0] ?? "";
            if (urls.length > 1) {
              const ins = [];
              for (const [i, u] of urls.entries()) {
                const f = path.join(work, `clip-${key}-part-${i}.mp4`);
                await d.media.download(u, f, d.signal);
                ins.push({ path: f, duration: Math.min(await d.media.probe(f, d.signal), (await d.media.speechEnd(f, d.signal)) + nv.tailSeconds) });
              }
              const joined = path.join(work, `clip-${key}-joined.mp4`);
              await d.media.concat(ins, joined, d.signal);
              url = await d.media.upload(joined, "video/mp4", d.signal);
            }
            const takeParts = { ...state.takeParts };
            delete takeParts[key];
            await saveState({ ...state, takeParts });
            return { model: m.endpointId, url, costMicros };
          } catch (e) {
            if (d.signal?.aborted) throw e;
            lastErr = e;
            // Abandoning this model: finished sub-takes were paid for but will not be used.
            const prevParts = state.takeParts?.[key];
            const isLast = attempt === nv.retriesPerModel || isInputError(e);
            if (isLast && prevParts?.model === mk) {
              const takeParts = { ...state.takeParts };
              delete takeParts[key];
              await saveState({ ...state, takeParts, preCostMicros: (state.preCostMicros ?? 0) + prevParts.costs.reduce((a, b) => a + b, 0) });
            }
            if (isInputError(e)) break; // same input would be rejected (and billed) again: go to the next model
          }
        }
      }
      throw lastErr;
    };
    const clips = loaded.clips;
    const genClip = async (c: ClipRow): Promise<void> => {
      if (c.status === "completed" && c.videoUrl) return;
      await d.store.updateVideo(id, { currentClip: c.clipIndex });
      await d.store.updateClip(c.id, { status: "generating_video", errorMessage: null });
      try {
        let model: string;
        let r;
        if (cfg.mode === "native_voice") {
          const g = await nativeVoiceClip(c);
          model = g.model;
          r = g;
        } else if (cfg.mode === "native_fal") {
          const nf = d.adapters.nativeFal;
          const key = String(c.clipIndex);
          const durationSec = takeSeconds(c.scriptContent, cfg.nativeFal);
          const pend = state.pendingFal?.[key];
          const resume = pend && pend.model === nf.model ? { requestId: pend.requestId, statusUrl: pend.statusUrl, responseUrl: pend.responseUrl } : undefined;
          let submitted = resume !== undefined;
          model = nf.model;
          try {
            r = await nf.take({
              imageUrl: actor.referenceImageUrl,
              text: c.scriptContent,
              voicePrompt: actor.voicePrompt,
              gender: actor.gender,
              direction: c.deliveryDirection ?? undefined,
              durationSec,
              seed: videoSeed,
              signal: d.signal,
              resume,
              onSubmit: async (sub) => {
                submitted = true;
                state = { ...state, pendingFal: { ...state.pendingFal, [key]: { model: nf.model, ...sub } } };
                await d.store.updateVideo(id, { pipelineState: state });
              },
            });
          } catch (e) {
            if (d.signal?.aborted) throw e;
            const next = { ...state.pendingFal };
            delete next[key];
            const lost = submitted ? nf.estimateMicros(durationSec) : 0;
            if (lost) spend(d, lost);
            state = { ...state, pendingFal: next, preCostMicros: (state.preCostMicros ?? 0) + lost };
            await d.store.updateVideo(id, { pipelineState: state });
            throw e;
          }
        } else if (cfg.mode === "native_speech") {
          model = `kie/${cfg.nativeSpeech.model}`;
          r = await d.adapters.native.speak({ imageUrl: actor.referenceImageUrl, text: c.scriptContent, voicePrompt: actor.voicePrompt, gender: actor.gender, direction: c.deliveryDirection ?? undefined, signal: d.signal });
        } else {
          const req1 = { imageUrl: actor.referenceImageUrl, audioUrl: req(c.audioUrl), durationSec: ((c.endMs ?? 0) - (c.startMs ?? 0)) / 1000, direction: c.deliveryDirection ?? undefined, seed: seedOf(id) % 2_147_483_647, signal: d.signal };
          const fb = d.adapters.avatarFallback;
          const key = String(c.clipIndex);
          const setPending = async (v?: NonNullable<PipelineState["pendingFal"]>[string]) => {
            const next = { ...state.pendingFal };
            if (v) next[key] = v;
            else delete next[key];
            state = { ...state, pendingFal: next };
            await d.store.updateVideo(id, { pipelineState: state });
          };
          const attempt = async (ad: AvatarAdapter): Promise<MediaResult> => {
            const pend = state.pendingFal?.[key];
            const resume = pend && pend.model === ad.model ? { requestId: pend.requestId, statusUrl: pend.statusUrl, responseUrl: pend.responseUrl } : undefined;
            let submitted = resume !== undefined;
            try {
              return await ad.animate({
                ...req1,
                resume,
                onSubmit: async (sub) => {
                  submitted = true;
                  await setPending({ model: ad.model, ...sub });
                },
              });
            } catch (e) {
              // Aborted (shutdown): keep the pending request so the retry resumes it.
              if (d.signal?.aborted) throw e;
              if (submitted) {
                // FAL bills a submitted request even when it fails or we give up on it.
                const lost = ad.estimateMicros?.(req1.durationSec) ?? 0;
                spend(d, lost);
                state = { ...state, preCostMicros: (state.preCostMicros ?? 0) + lost };
              }
              await setPending(undefined);
              throw e;
            }
          };
          // A pending fallback request means the primary already failed: resume the fallback directly.
          const resumeFallback = fb !== null && state.pendingFal?.[key]?.model === fb.model && fb.model !== d.adapters.avatar.model;
          model = resumeFallback && fb ? fb.model : d.adapters.avatar.model;
          try {
            r = await attempt(resumeFallback && fb ? fb : d.adapters.avatar);
          } catch (e) {
            if (!fb || resumeFallback || d.signal?.aborted) throw e;
            model = fb.model;
            r = await attempt(fb);
          }
        }
        if (cfg.mode !== "native_voice") spend(d, r.costMicros); // native_voice spends per take
        const pendingFal = { ...state.pendingFal };
        delete pendingFal[String(c.clipIndex)];
        state = { ...state, pendingFal, clipModels: { ...state.clipModels, [String(c.clipIndex)]: model } };
        await d.store.updateVideo(id, { pipelineState: state, modelConfig: { ...cfg, used: { tts: cfg.mode === "audio_driven" ? cfg.tts.endpointId : null, clips: state.clipModels, seed: cfg.mode === "native_fal" ? videoSeed : undefined, klingVoiceId: cfg.mode === "native_voice" ? (lockedVoice() ?? undefined) : undefined } } });
        c.status = "completed";
        c.videoUrl = r.url;
        c.costMicros = r.costMicros;
        await d.store.updateClip(c.id, { status: "completed", videoUrl: r.url, costMicros: r.costMicros, completed: true });
      } catch (e) {
        await d.store.updateClip(c.id, { status: "failed", errorMessage: e instanceof Error ? e.message.slice(0, 500) : String(e) });
        throw e;
      }
    };
    if (cfg.mode === "native_fal" || (cfg.mode === "native_voice" && !nv.voiceClone.enabled)) {
      // Takes are independent (voice is pinned by seed + prompt, not by the previous clip): run
      // them all at once. Finished takes are kept, so a retry only redoes the failed ones.
      const settled = await Promise.allSettled(clips.map((c) => genClip(c)));
      const bad = settled.find((x): x is PromiseRejectedResult => x.status === "rejected");
      if (bad) throw bad.reason;
    } else {
      for (const c of clips) await genClip(c);
    }

    // 4. Stitch + iPhone finish
    await d.store.updateVideo(id, { status: "stitching", currentClip: clips.length });
    const inputs = [];
    for (const c of clips) {
      const f = path.join(work, `clip-${c.clipIndex}.mp4`);
      await d.media.download(req(c.videoUrl), f, d.signal);
      const full = await d.media.probe(f, d.signal);
      // Native takes run to a whole-second length: cut the dead air after the last word.
      const tail = cfg.mode === "native_fal" ? cfg.nativeFal.tailSeconds : cfg.mode === "native_voice" ? cfg.nativeVoice.tailSeconds : null;
      const dur = tail !== null ? Math.min(full, (await d.media.speechEnd(f, d.signal)) + tail) : full;
      inputs.push({ path: f, duration: dur });
    }
    const out = path.join(work, "final.mp4");
    const sp = state.audio?.speechDuration;
    if (cfg.mode === "native_voice") {
      // Hard cuts between takes (natural for phone UGC), per-take loudness normalization, no fake room tone.
      await d.media.finish({ inputs, output: out, crossfade: 0, seed: seedOf(id), normalizeEach: true, lufs: -16, ...cfg.nativeVoice.finish }, d.signal);
    } else {
      await d.media.finish({ inputs, output: out, crossfade: cfg.crossfadeSeconds, seed: seedOf(id), ...cfg.finish, ...(sp !== undefined ? { trimTo: sp + PAD_TAIL_SECONDS } : {}) }, d.signal);
    }
    const actualDuration = await d.media.probe(out, d.signal);
    const finalVideoUrl = await d.media.upload(out, "video/mp4", d.signal);
    const costMicros = (state.preCostMicros ?? 0) + clips.reduce((a, c) => a + c.costMicros, 0);
    await d.store.complete(id, { finalVideoUrl, actualDuration, costMicros, minutes: minutesForDuration(actualDuration) });
    return { status: "completed", finalVideoUrl };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

function req(u: string | null): string {
  if (!u) throw new Error("missing media URL");
  return u;
}

function seedOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Runner handler. */
export async function testimonialJob(ctx: JobContext): Promise<unknown> {
  const p = TestimonialJobPayloadSchema.safeParse(ctx.job.payload);
  if (!p.success) throw new PermanentJobError(`bad testimonial payload: ${p.error.message}`);
  const config = loadPipelineConfig();
  return runTestimonial(
    { store: prismaStore(ctx.db), adapters: createAdapters(config), media: realMedia(), provider: ctx.provider, config, scratchDir: ctx.config.scratchDir, usage: ctx.usage, signal: ctx.signal },
    p.data,
  );
}

/** Terminal failure (job dead): mark the video failed and release reserved minutes. */
export async function onTestimonialDead(store: TestimonialStore, payload: Record<string, unknown>, msg: string): Promise<void> {
  const id = typeof payload.compositeVideoId === "string" ? payload.compositeVideoId : null;
  if (id) await store.fail(id, msg);
}
/** Jobs killed by stale-lock recovery skip onDead; release their videos' minutes here. */
export async function sweepDeadTestimonials(db: Db): Promise<number> {
  const dead = await db.adJob.findMany({ where: { type: TESTIMONIAL_JOB_TYPE, status: "dead", finishedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, select: { id: true } });
  if (dead.length === 0) return 0;
  const vids = await db.falCompositeVideo.findMany({ where: { jobId: { in: dead.map((j) => j.id) }, minutesState: "reserved" }, select: { id: true } });
  const store = prismaStore(db);
  for (const v of vids) await store.fail(v.id, "generation job died");
  return vids.length;
}
export const onTestimonialDeadDb = (db: Db, payload: Record<string, unknown>, msg: string) => onTestimonialDead(prismaStore(db), payload, msg);

/** Runner handler: Codex actor recommendation; result is stored in AdJob.result. */
export async function recommendActorsJob(ctx: JobContext): Promise<unknown> {
  const p = RecommendActorsPayloadSchema.safeParse(ctx.job.payload);
  if (!p.success) throw new PermanentJobError(`bad payload: ${p.error.message}`);
  const review = await ctx.db.review.findFirst({ where: { id: p.data.reviewId, userId: p.data.userId } });
  if (!review) throw new PermanentJobError("review not found");
  const actors = await ctx.db.falActor.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const cards = actors.map((a) => ({ id: a.id, name: a.name, gender: a.gender, style: a.style, ageRange: a.ageRange, persona: a.persona, occupation: a.occupation, setting: a.setting, tags: a.tags, industries: a.industries }));
  const r = await recommendActors(ctx.provider, review, cards, p.data.limit, ctx.signal);
  if (r.usage) ctx.usage.push(r.usage);
  return { source: r.source, picks: r.picks };
}

export type { ClipRow };
