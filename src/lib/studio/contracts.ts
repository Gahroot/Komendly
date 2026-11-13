// Ozzy Studio: shared contract between the Next.js app and the engine (goal ezmotionkom).
// Pure TypeScript + zod only: no Next, Prisma or Node-specific imports. The engine imports this file.
//
// Flow: web creates StudioMessage(user) + StudioMessage(assistant, status=queued) + AdJob(type=studio_turn)
// -> engine claims the job, restores the session (S3), runs the EZ Motion agent for one turn, appends
// StudioEvent rows while it works (text deltas batched ~150ms), uploads finished videos as StudioRender
// rows, charges the workspace (see studioCharge), writes the final assistant content, sets status done.
// -> web SSE route tails StudioEvent by id (Last-Event-ID) and renders the chat like ChatGPT.
import { z } from "zod";

/** AdJob.type for one conversational turn (AdJob is the shared queue table). */
export const STUDIO_TURN_JOB_TYPE = "studio_turn";
/** AdJob.type that probes an uploaded file (duration/size/poster) with ffprobe. */
export const STUDIO_PROBE_JOB_TYPE = "studio_probe";

/** Default AI: the engine's ChatGPT (Codex) subscription login. */
export const STUDIO_DEFAULT_MODEL = "gpt-6.1-sol";
export const STUDIO_DEFAULT_THINKING = "high";

export const StudioTurnPayloadSchema = z.object({
  sessionId: z.string().min(1),
  /** The user message this turn answers. */
  userMessageId: z.string().min(1),
  /** The assistant message the engine streams into. */
  assistantMessageId: z.string().min(1),
});
export type StudioTurnPayload = z.infer<typeof StudioTurnPayloadSchema>;

export const StudioProbePayloadSchema = z.object({ uploadId: z.string().min(1) });

export const STUDIO_EVENT_TYPES = [
  "status", // { phase: StudioPhase, label: string } — Ozzy's current step, drives his pose
  "text_delta", // { text } — append to the assistant message
  "tool", // { label: string, detail?: string } — friendly step ("Looking at your clip", "Building scene 2")
  "preview", // { key: string, url?: string, caption?: string } — a still (contact sheet / frame) while building
  "question", // { question: string, options: {label, value, hint?, recommended?}[], allowOther?: boolean } — ask_user mapped to a chat card; the turn ends
  "progress", // { pct: number (0-100), label: string, etaSec?: number } — honest render/encode progress (parsed from the renderer)
  "render", // { renderId, version, ratio, seconds, watermarked, free?, posterKey? } — a finished video was delivered
  "charge", // { renderId, credits, free: boolean, balanceAfter?: number, freeVideosLeft?: number }
  "error", // { message, code? }
  "done", // { messageId } — the turn finished (assistant message content is final)
] as const;
export type StudioEventType = (typeof STUDIO_EVENT_TYPES)[number];

export const STUDIO_PHASES = ["thinking", "looking", "building", "rendering", "reviewing", "done", "error"] as const;
export type StudioPhase = (typeof STUDIO_PHASES)[number];

/** Uploads: what the browser may PUT (presigned, <= 10 min). */
export const STUDIO_UPLOAD_LIMITS = {
  maxBytes: 500 * 1024 * 1024,
  maxBytesFree: 200 * 1024 * 1024,
  maxFilesPerMessage: 6,
  mimes: ["video/mp4", "video/quicktime", "video/webm", "image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/wav", "audio/mp4"],
} as const;

/** Length caps the agent is told about (seconds). */
export const STUDIO_MAX_SECONDS = { free: 30, paid: 90 } as const;

/**
 * Pricing (credits; 1 credit = 1 static ad). Cost basis: EZ Motion agent ~$0.35/video at list +
 * multi-turn high thinking + render ≈ $1-2.5 p90 at list (Codex sub: pennies). 70% margin floor holds at
 * the plans' lowest $/credit ($1.96).
 * - A NEW video (the session's first delivered render): 5 credits (<= 30s) or 8 credits (> 30s).
 * - REVISIONS of that video: the first 3 are included; each later delivered revision costs 1 credit.
 * - Free video: the workspace's studioFreeVideos covers the session's first render AND its 3 included
 *   revisions; no watermark (freebies are clean since 2026-11-11); later revisions need credits.
 */
export const STUDIO_PRICE = { newShort: 5, newLong: 8, longOverSeconds: 30, includedRevisions: 3, revision: 1 } as const;

export interface StudioChargeInput {
  /** Delivered renders already in this session (before this one). */
  priorRenders: number;
  seconds: number;
  /** Did this session spend the free video? (StudioSession.freeVideo) */
  sessionFree: boolean;
  /** Workspace has free videos left (only consulted for the first render). */
  freeVideosLeft: number;
  /** Paid plan or credit balance > 0 means paid output (no watermark). */
  isPaidWorkspace: boolean;
  /** Unlimited plan (billing-config isUnlimitedPlan): every render costs 0 credits. */
  unlimited?: boolean;
}

export interface StudioCharge {
  kind: "new" | "revision";
  credits: number;
  /** Spend one of the workspace's free videos (first render only). */
  useFreeVideo: boolean;
  watermark: boolean;
}

/** Pure: what a delivered render costs. The engine applies it in one transaction with the render row. */
export function studioCharge(i: StudioChargeInput): StudioCharge {
  const kind = i.priorRenders === 0 ? "new" : "revision";
  if (i.unlimited) return { kind, credits: 0, useFreeVideo: false, watermark: false };
  if (kind === "new") {
    if (!i.isPaidWorkspace && i.freeVideosLeft > 0) return { kind, credits: 0, useFreeVideo: true, watermark: false };
    return { kind, credits: i.seconds > STUDIO_PRICE.longOverSeconds ? STUDIO_PRICE.newLong : STUDIO_PRICE.newShort, useFreeVideo: false, watermark: false };
  }
  const included = i.priorRenders <= STUDIO_PRICE.includedRevisions;
  return { kind, credits: included ? 0 : STUDIO_PRICE.revision, useFreeVideo: false, watermark: false };
}

/** Pure: can the user send a message that may produce a render? (web gate before enqueueing a turn) */
export function canStartStudioTurn(o: { priorRenders: number; sessionFree: boolean; freeVideosLeft: number; balance: number; isPaidWorkspace: boolean; unlimited?: boolean }):
  | { ok: true }
  | { ok: false; code: "no_credits" | "free_used"; neededCredits: number } {
  if (o.unlimited) return { ok: true };
  if (o.priorRenders === 0) {
    if (!o.isPaidWorkspace && o.freeVideosLeft > 0) return { ok: true };
    return o.balance >= STUDIO_PRICE.newShort ? { ok: true } : { ok: false, code: o.freeVideosLeft > 0 ? "no_credits" : "free_used", neededCredits: STUDIO_PRICE.newShort };
  }
  if (o.priorRenders <= STUDIO_PRICE.includedRevisions) return { ok: true };
  return o.balance >= STUDIO_PRICE.revision ? { ok: true } : { ok: false, code: "no_credits", neededCredits: STUDIO_PRICE.revision };
}

/** Referral: give a friend 2 free Studio videos; sender earns +1 free video when the friend signs up. */
export const STUDIO_INVITE = { friendFreeVideos: 2, senderRewardVideos: 1, maxRewardsPerMonth: 5 } as const;

/** Watermark text, now only burned in when a render couldn't be paid for (short balance race); free videos are clean. */
export const STUDIO_WATERMARK = "Made with Ozzy · komendly.com";

/** S3 key layout (engine + web agree). */
export const studioKeys = {
  upload: (workspaceId: string, uploadId: string, filename: string) => `studio/${workspaceId}/uploads/${uploadId}/${filename.replace(/[^\w.\-]+/g, "_").slice(-80)}`,
  render: (workspaceId: string, sessionId: string, version: number) => `studio/${workspaceId}/${sessionId}/v${version}.mp4`,
  poster: (workspaceId: string, sessionId: string, version: number) => `studio/${workspaceId}/${sessionId}/v${version}.jpg`,
  project: (workspaceId: string, sessionId: string) => `studio/${workspaceId}/${sessionId}/project.tar.gz`,
  agentState: (workspaceId: string, sessionId: string) => `studio/${workspaceId}/${sessionId}/agent.jsonl`,
  preview: (workspaceId: string, sessionId: string, name: string) => `studio/${workspaceId}/${sessionId}/previews/${name}`,
};

/** Conversation starters shown on the empty Studio (also used by emails). */
export const STUDIO_STARTERS = [
  { id: "hype", title: "Hype video ad", prompt: "Make a hype video ad that is super fast cuts and energetic for my website: " },
  { id: "demo", title: "Product demo", prompt: "Make a product demonstration video that shows how it works, step by step. My website: " },
  { id: "promo", title: "A 15-second promo for my business", prompt: "Make a 15-second promo video for my business. Here's my website: " },
  { id: "edit", title: "Edit my footage into an ad", prompt: "I'm uploading some clips. Cut them into a punchy ad with captions and music." },
  { id: "captions", title: "Add captions & polish my video", prompt: "Add bold animated captions to this video and tighten the pauses." },
  { id: "logo", title: "Animate my logo", prompt: "Animate my logo into a 5-second intro. Logo attached." },
  { id: "launch", title: "Launch video for a new product", prompt: "Make a launch video for my new product: " },
  { id: "testimonial", title: "Turn a review into a motion graphic", prompt: "Turn this customer review into a bold motion graphic: " },
] as const;

/**
 * Small "kind of video" chips under a prompt box: they PREFILL the box (never send), so typing stays primary.
 * `{site}` is replaced with the user's website when known.
 */
export const STUDIO_VIDEO_TYPES = [
  { id: "hype", label: "Hype ad", prompt: "Make a hype video ad for {site}: super fast cuts and energetic." },
  { id: "demo", label: "Product demo", prompt: "Make a product demonstration video for {site} that shows how it works, step by step." },
  { id: "testimonial", label: "Customer story", prompt: "Make a video that tells a happy customer's story for {site}." },
  { id: "offer", label: "Offer / sale", prompt: "Make a short video ad announcing my offer for {site}: " },
  { id: "explainer", label: "Explainer", prompt: "Make a 30-second explainer video for {site}: the problem, how we solve it, and why us." },
  { id: "logo", label: "Logo intro", prompt: "Animate my logo into a 5-second intro for {site}." },
] as const;

export function videoTypePrompt(id: string, site: string | null | undefined): string {
  const t = STUDIO_VIDEO_TYPES.find((x) => x.id === id);
  if (!t) return "";
  const s = (site ?? "").trim();
  return s ? t.prompt.replaceAll("{site}", s) : t.prompt.replaceAll(" for {site}", "").replaceAll("{site}", "my business");
}
