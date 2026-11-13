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
/** AdJob.type that downloads a reference ad from a link into a StudioUpload, then queues the remix turn. */
export const STUDIO_INGEST_JOB_TYPE = "studio_ingest";

/** AdJob.type that records real footage of a public website (launch videos), then queues the launch turn. */
export const STUDIO_CAPTURE_JOB_TYPE = "studio_capture";

/** Default AI: the engine's ChatGPT (Codex) subscription login. */
export const STUDIO_DEFAULT_MODEL = "gpt-6.1-sol";
export const STUDIO_DEFAULT_THINKING = "high";

export const StudioTurnPayloadSchema = z.object({
  sessionId: z.string().min(1),
  /** The user message this turn answers. */
  userMessageId: z.string().min(1),
  /** The assistant message the engine streams into. */
  assistantMessageId: z.string().min(1),
  /** Launch video turn: real footage was recorded first (studio_capture) or uploaded by the CLI. */
  launch: z.lazy(() => StudioLaunchInfoSchema).optional(),
});
export type StudioTurnPayload = z.infer<typeof StudioTurnPayloadSchema>;

// ---- Launch videos ("make a launch video for what we just shipped") ----
export const STUDIO_LAUNCH_ASPECTS = ["16:9", "9:16"] as const;
export type StudioLaunchAspect = (typeof STUDIO_LAUNCH_ASPECTS)[number];

/** Launch context the turn adds to the brief (carried on the studio_turn payload as `launch`). */
export const StudioLaunchInfoSchema = z.object({
  url: z.string().max(2048),
  notes: z.string().max(4000).optional(),
  aspect: z.enum(STUDIO_LAUNCH_ASPECTS).default("16:9"),
  /** What each recorded clip / screenshot shows, by upload filename. */
  footage: z.array(z.object({ filename: z.string().max(200), shows: z.string().max(300) })).max(20).default([]),
  /** Brand hints read off the page when the workspace has no brand profile for the site. */
  brand: z.object({ name: z.string().max(120).optional(), colors: z.array(z.string().max(32)).max(6).default([]) }).optional(),
});
export type StudioLaunchInfo = z.infer<typeof StudioLaunchInfoSchema>;

/** studio_capture: record `url` (public), store clips as StudioUploads, then queue the studio_turn for these messages. */
export const StudioCapturePayloadSchema = z.object({
  sessionId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  url: z.string().url().max(2048),
  paths: z.array(z.string().max(300)).max(5).optional(),
  notes: z.string().max(4000).optional(),
  aspect: z.enum(STUDIO_LAUNCH_ASPECTS).default("16:9"),
});
export type StudioCapturePayload = z.infer<typeof StudioCapturePayloadSchema>;

/** Capture caps: pages visited besides the landing page, per-clip seconds, whole capture wall clock. */
export const STUDIO_CAPTURE_LIMITS = { maxPages: 3, maxClipSeconds: 14, totalMs: 4 * 60_000, navTimeoutMs: 25_000, maxClipBytes: 80 * 1024 * 1024 } as const;

/** What the chat shows as the user's message for a launch video. */
export function launchMessage(o: { url: string; notes?: string | null }): string {
  const head = `Make a launch video for what we just shipped: ${o.url}`;
  const notes = (o.notes ?? "").trim();
  return notes ? `${head}\n\nWhat we shipped: ${notes}` : head;
}

/** Session title for a launch video ("Launch video · example.com"). */
export function launchTitle(url: string): string {
  try {
    return `Launch video · ${new URL(url).hostname.replace(/^www\./, "")}`.slice(0, 80);
  } catch {
    return "Launch video";
  }
}

export const StudioProbePayloadSchema = z.object({ uploadId: z.string().min(1) });

/**
 * "Remix any ad": the engine fetches the ad behind `url` into StudioUpload `uploadId` (probed like an upload),
 * then queues the studio_turn for the given messages. On failure the assistant message gets STUDIO_REMIX_LINK_FAILED.
 */
export const StudioIngestPayloadSchema = z.object({
  uploadId: z.string().min(1),
  url: z.string().url().max(2000),
  sessionId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
});
export type StudioIngestPayload = z.infer<typeof StudioIngestPayloadSchema>;

/** Caps for a fetched reference ad (longer videos keep their first maxSeconds). */
export const STUDIO_INGEST_LIMITS = { maxBytes: 200 * 1024 * 1024, maxSeconds: 180, timeoutMs: 3 * 60_000 } as const;

export const STUDIO_REMIX_LINK_FAILED = "I couldn't open that link. Upload a screen recording of the ad instead.";

/** A user message attachment that is the ad to remix (the turn adds the remix brief for it). */
export interface StudioReferenceAttachment { uploadId: string; reference: true; sourceUrl?: string }

export function isReferenceAttachment(a: unknown): a is StudioReferenceAttachment {
  return !!a && typeof a === "object" && (a as { reference?: unknown }).reference === true && typeof (a as { uploadId?: unknown }).uploadId === "string";
}

/** http(s) link the user pasted (bare domains get https://), else null. */
export function normalizeRemixUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 2000 || /\s/.test(t)) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** YouTube blocks server downloads, so a YouTube link can't be remixed: ask for a screen recording instead. */
export const STUDIO_REMIX_YOUTUBE_MESSAGE = "YouTube doesn't let me download its videos. Upload a screen recording of the ad instead, or paste a TikTok, Instagram or Facebook Ad Library link.";
export function isYouTubeUrl(url: string): boolean {
  try {
    return /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** What the chat shows as the user's message for a remix. */
export function remixMessage(o: { url?: string | null; notes?: string | null }): string {
  const head = o.url ? `Remix this ad for my brand: ${o.url}` : "Remix this ad for my brand.";
  const notes = (o.notes ?? "").trim();
  return notes ? `${head}\n\n${notes}` : head;
}

export const STUDIO_EVENT_TYPES = [
  "status", // { phase: StudioPhase, label: string } — Ozzy's current step, drives his pose
  "text_delta", // { text } — append to the assistant message
  "tool", // { label: string, detail?: string } — friendly step ("Looking at your clip", "Building scene 2")
  "preview", // { key: string, url?: string, caption?: string } — a still (contact sheet / frame) while building
  "question", // { question: string, options: {label, value, hint?, recommended?}[], allowOther?: boolean } — ask_user mapped to a chat card; the turn ends
  "progress", // { pct: number (0-100), label: string, etaSec?: number } — honest render/encode progress (parsed from the renderer)
  "render", // { renderId, version, ratio, seconds, watermarked, free?, posterKey? } — a finished video was delivered
  "live", // { version, width, height, ratio } — a playable live preview of the work in progress (files under studioKeys.live*)
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
  /** Live preview: one file of a published version (rel = project-relative posix path). */
  liveFile: (workspaceId: string, sessionId: string, version: string, rel: string) => `studio/${workspaceId}/${sessionId}/live/${version}/${rel}`,
  /** Live preview manifest (LiveManifest JSON): which files a version has, their keys and its access token. */
  liveManifest: (workspaceId: string, sessionId: string, version: string) => `studio/${workspaceId}/${sessionId}/live/${version}.json`,
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

/** Live preview version id: `<assistantMessageId>-<n>` (also a URL path segment). */
export const LIVE_VERSION_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** What the engine stores per live preview version; the web route serves only files listed here. */
export const LiveManifestSchema = z.object({
  /** Random capability token: asset requests from the sandboxed player carry it (no cookies there). */
  token: z.string().min(16),
  /** Project-relative path of the composition's index.html (relative asset paths resolve from it). */
  entry: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  files: z.record(z.string(), z.object({ key: z.string().min(1), type: z.string().min(1), size: z.number().int().nonnegative() })),
});
export type LiveManifest = z.infer<typeof LiveManifestSchema>;

/** Launch video address. Public sites need a dotted host; `local` (the CLI already recorded it) also allows localhost/IPs. */
export function normalizeLaunchUrl(raw: string, opts: { local?: boolean } = {}): string | null {
  const t = raw.trim();
  if (!t || t.length > 2000 || /\s/.test(t)) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `${/^(localhost|127\.|\[?::1)/i.test(t) ? "http" : "https"}://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && !(opts.local && (u.hostname === "localhost" || u.hostname.startsWith("[")))) return null;
    return u.toString();
  } catch {
    return null;
  }
}
