// Persistence boundary for the testimonial job (FalCompositeVideo / FalClip / User minutes).
// The job talks only to this interface so the flow is unit-testable with an in-memory store.
import type { Prisma } from "@prisma/client";
import type { Db } from "../db";

export interface PipelineState {
  scriptDone?: boolean;
  clipsPlanned?: boolean;
  /** duration = the (possibly padded) track; speechDuration set when short speech was padded. */
  audio?: { url: string; duration: number; speechDuration?: number };
  /** FAL requests submitted but not yet finished (clipIndex -> request); resumed on retry, never resubmitted. */
  pendingFal?: Record<string, { model: string; requestId: string; statusUrl?: string; responseUrl?: string }>;
  /** Script segments with delivery direction, kept until the clip plan is written. */
  segments?: Array<{ text: string; direction: string }>;
  /** Spend before the clip stage (TTS, Codex equivalents) in micros. */
  preCostMicros?: number;
  /** native_voice: Kling voice locked during this video (also written to the actor). */
  klingVoiceId?: string;
  /** native_voice: finished sub-takes of a clip when a fallback model needed shorter takes. */
  takeParts?: Record<string, { model: string; urls: Array<string | null>; costs: number[] }>;
  /** Model endpoint that produced each clip (clipIndex -> endpoint id). */
  clipModels?: Record<string, string>;
}

export interface ActorRow {
  id: string;
  gender: string;
  referenceImageUrl: string;
  voiceId: string | null;
  voiceProvider: string | null;
  voiceSettings: unknown;
  voicePrompt: string | null;
}

export interface VideoRow {
  id: string;
  status: string;
  targetDuration: number;
  voiceId: string;
  reviewText: string;
  reviewerName: string | null;
  businessName: string | null;
  actor: ActorRow;
  pipelineState: PipelineState;
  minutesState: string;
}

export interface ClipRow {
  id: string;
  clipIndex: number;
  clipType: string;
  scriptContent: string;
  deliveryDirection: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  duration: number | null;
  startMs: number | null;
  endMs: number | null;
  status: string;
  costMicros: number;
}

export type NewClip = Pick<ClipRow, "clipIndex" | "clipType" | "scriptContent" | "deliveryDirection" | "audioUrl" | "startMs" | "endMs">;

export interface TestimonialStore {
  load(id: string): Promise<{ video: VideoRow; clips: ClipRow[] } | null>;
  saveScript(id: string, s: { fullScript: string; hook: string; testimonial: string; cta: string; scriptSource: string; state: PipelineState }): Promise<void>;
  /** Atomically replace all clips (only before any clip completed) and mark the plan in state. */
  replaceClips(id: string, clips: NewClip[], state: PipelineState): Promise<void>;
  updateVideo(id: string, d: { status?: "generating_clips" | "stitching"; currentClip?: number; pipelineState?: PipelineState; pipeline?: string; modelConfig?: unknown; costMicros?: number }): Promise<void>;
  updateClip(id: string, d: Partial<Pick<ClipRow, "status" | "videoUrl" | "duration" | "costMicros">> & { errorMessage?: string | null; falRequestId?: string; completed?: boolean }): Promise<void>;
  /**
   * Lock the actor's Kling voice only if it has none yet (conditional update, race-safe).
   * Returns the voice id now stored on the actor (the winner's when another job locked first).
   */
  lockActorVoice(actorId: string, voiceId: string): Promise<string>;
  /** Mark completed and settle minutes once: charge `minutes` (<= reserved), release the rest. */
  complete(id: string, r: { finalVideoUrl: string; actualDuration: number; costMicros: number; minutes: number }): Promise<void>;
  /** Mark failed and release reserved minutes once. Returns true if minutes were released. */
  fail(id: string, message: string): Promise<boolean>;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

export function prismaStore(db: Db): TestimonialStore {
  return {
    async load(id) {
      const v = await db.falCompositeVideo.findUnique({ where: { id }, include: { actor: true, review: true, clips: { orderBy: { clipIndex: "asc" } } } });
      if (!v) return null;
      return {
        video: {
          id: v.id,
          status: v.status,
          targetDuration: v.targetDuration,
          voiceId: v.voiceId,
          reviewText: v.review.reviewText,
          reviewerName: v.review.reviewerName,
          businessName: v.review.businessName,
          actor: v.actor,
          pipelineState: (v.pipelineState ?? {}) as PipelineState,
          minutesState: v.minutesState,
        },
        clips: v.clips.map((c) => ({ ...c, costMicros: Number(c.costMicros) })),
      };
    },
    async saveScript(id, s) {
      await db.falCompositeVideo.update({
        where: { id },
        data: { fullScript: s.fullScript, hookScript: s.hook, testimonialScript: s.testimonial, ctaScript: s.cta, scriptSource: s.scriptSource, pipelineState: json(s.state) },
      });
    },
    async replaceClips(id, clips, state) {
      await db.$transaction(async (tx) => {
        if (await tx.falClip.count({ where: { compositeVideoId: id, status: "completed" } })) throw new Error("clips already completed; refusing to re-plan");
        await tx.falClip.deleteMany({ where: { compositeVideoId: id } });
        await tx.falClip.createMany({ data: clips.map((c) => ({ ...c, compositeVideoId: id, status: "pending" })) });
        await tx.falCompositeVideo.update({ where: { id }, data: { totalClips: clips.length, currentClip: 0, pipelineState: json(state) } });
      });
    },
    async updateVideo(id, d) {
      await db.falCompositeVideo.update({
        where: { id },
        data: {
          status: d.status,
          currentClip: d.currentClip,
          pipeline: d.pipeline,
          pipelineState: d.pipelineState === undefined ? undefined : json(d.pipelineState),
          modelConfig: d.modelConfig === undefined ? undefined : json(d.modelConfig),
          costMicros: d.costMicros === undefined ? undefined : BigInt(Math.round(d.costMicros)),
        },
      });
    },
    async updateClip(id, d) {
      await db.falClip.update({
        where: { id },
        data: {
          status: d.status,
          videoUrl: d.videoUrl,
          duration: d.duration === undefined || d.duration === null ? undefined : Math.round(d.duration),
          costMicros: d.costMicros === undefined ? undefined : BigInt(Math.round(d.costMicros)),
          errorMessage: d.errorMessage,
          falRequestId: d.falRequestId,
          completedAt: d.completed ? new Date() : undefined,
        },
      });
    },
    async lockActorVoice(actorId, voiceId) {
      await db.falActor.updateMany({
        where: { id: actorId, OR: [{ voiceId: null }, { voiceProvider: null }, { voiceProvider: { not: "kling" } }] },
        data: { voiceProvider: "kling", voiceId },
      });
      const a = await db.falActor.findUnique({ where: { id: actorId }, select: { voiceId: true, voiceProvider: true } });
      return a?.voiceProvider === "kling" && a.voiceId ? a.voiceId : voiceId;
    },
    async complete(id, r) {
      await db.$transaction(async (tx) => {
        const v = await tx.falCompositeVideo.findUniqueOrThrow({ where: { id }, select: { userId: true, minutesReserved: true } });
        const charged = Math.min(r.minutes, v.minutesReserved);
        const settled = await tx.falCompositeVideo.updateMany({ where: { id, minutesState: "reserved" }, data: { minutesState: "charged", minutesCharged: charged } });
        const refund = v.minutesReserved - charged;
        if (settled.count === 1 && refund > 0) {
          await tx.$executeRaw`UPDATE "User" SET "minutesUsed" = GREATEST(0, "minutesUsed" - ${refund}) WHERE id = ${v.userId}`;
        }
        await tx.falCompositeVideo.update({
          where: { id },
          data: { status: "completed", finalVideoUrl: r.finalVideoUrl, actualDuration: Math.round(r.actualDuration), costMicros: BigInt(Math.round(r.costMicros)), completedAt: new Date(), errorMessage: null },
        });
      });
    },
    async fail(id, message) {
      return db.$transaction(async (tx) => {
        const v = await tx.falCompositeVideo.findUnique({ where: { id }, select: { userId: true, minutesReserved: true, status: true } });
        if (!v || v.status === "completed") return false;
        const rel = await tx.falCompositeVideo.updateMany({ where: { id, minutesState: "reserved" }, data: { minutesState: "released" } });
        if (rel.count === 1 && v.minutesReserved > 0) {
          await tx.$executeRaw`UPDATE "User" SET "minutesUsed" = GREATEST(0, "minutesUsed" - ${v.minutesReserved}) WHERE id = ${v.userId}`;
        }
        await tx.falCompositeVideo.update({ where: { id }, data: { status: "failed", errorMessage: message.slice(0, 1000) } });
        return rel.count === 1;
      });
    },
  };
}
