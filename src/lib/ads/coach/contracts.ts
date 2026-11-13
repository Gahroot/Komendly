// Ozzy Ad Coach: shared contract between the web app and the engine (coach_review job).
// Pure TypeScript + zod only (the engine imports this file directly): no Next, Prisma or Node imports.
import { z } from "zod";

export const COACH_JOB_TYPE = "coach_review" as const;

export const COACH_LIMITS = {
  maxScreenshots: 5,
  screenshotMimes: ["image/png", "image/jpeg", "image/webp"],
  maxScreenshotBytes: 8 * 1024 * 1024,
  tableMimes: ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  maxTableBytes: 5 * 1024 * 1024,
  noteMax: 160,
  /** Ad Department: reviews per rolling 24 h. */
  perDay: 10,
} as const;

/** Under these per-ad numbers there isn't enough data to judge an ad yet. */
export const DATA_FLOOR = { impressions: 1000, spend: 20 } as const;

export const CoachFileSchema = z.object({
  key: z.string().min(1).max(400),
  mime: z.string().max(100),
  bytes: z.number().int().nonnegative(),
  name: z.string().max(200),
});
export type CoachFile = z.infer<typeof CoachFileSchema>;

export const CoachPayloadSchema = z.object({ reviewId: z.string().min(1) });

export const CoachVerdictAdSchema = z.object({
  name: z.string().max(200),
  verdict: z.enum(["keep", "kill", "watch"]),
  reason: z.string().max(240),
  keyNumber: z.string().max(80),
});

export const CoachActionSchema = z.object({
  kind: z.enum(["budget", "audience", "creative", "pause", "wait", "other"]),
  text: z.string().max(240),
});

export const CoachWinnerSchema = z.object({
  name: z.string().max(200),
  angle: z.string().max(240),
  hook: z.string().max(240),
  headline: z.string().max(200),
  style: z.string().max(240),
  /** The user's own Komendly ad this winner matches (by headline), or null. */
  matchedAdId: z.string().max(64).nullable(),
});
export type CoachWinner = z.infer<typeof CoachWinnerSchema>;

/** The stored verdict (AdCoachReview.verdict). */
export const CoachVerdictSchema = z.object({
  summary: z.string().min(1).max(300),
  confidence: z.enum(["low", "medium", "high"]),
  enoughData: z.boolean(),
  /** When enoughData is false: how many more days to let the ads run. */
  waitDays: z.number().int().min(0).max(30).nullable(),
  ads: z.array(CoachVerdictAdSchema).max(40),
  actions: z.array(CoachActionSchema).max(3),
  winner: CoachWinnerSchema.nullable(),
  source: z.enum(["table", "screenshots"]),
});
export type CoachVerdict = z.infer<typeof CoachVerdictSchema>;

/** Seed for "Make 5 more like the winner" (passed to planning; every field optional except angle). */
export const RunSeedSchema = z.object({
  angle: z.string().min(1).max(240),
  hook: z.string().max(240).optional(),
  headline: z.string().max(200).optional(),
  style: z.string().max(240).optional(),
  /** Visual brief of the user's matched Komendly ad (layout/concept), when the winner was one of theirs. */
  visual: z.object({ concept: z.string().max(1000).optional(), layout: z.string().max(120).optional() }).optional(),
  sourceAdId: z.string().max(64).optional(),
  coachReviewId: z.string().max(64).optional(),
  /** Where the seed came from (optional; absent = Ad Coach winner). hook_library = a hook the member picked from their Ad Department library. */
  origin: z.enum(["coach", "hook_library"]).optional(),
});
export type RunSeed = z.infer<typeof RunSeedSchema>;

export const COACH_STATUSES = ["uploading", "queued", "working", "ready", "failed"] as const;
export type CoachStatus = (typeof COACH_STATUSES)[number];

export function coachUploadKey(workspaceId: string, reviewId: string, index: number, filename: string): string {
  const safe = filename.replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  return `coach/${workspaceId}/${reviewId}/${index}-${safe}`;
}

/** "table" for one CSV/XLSX, "screenshots" for 1..5 images; null when the mix isn't allowed. */
export function uploadKind(files: Array<{ mime: string; bytes: number }>): { ok: true; kind: "table" | "screenshots" } | { ok: false; message: string } {
  if (files.length === 0) return { ok: false, message: "Add a screenshot or your ads report first." };
  const images = files.filter((f) => (COACH_LIMITS.screenshotMimes as readonly string[]).includes(f.mime));
  const tables = files.filter((f) => (COACH_LIMITS.tableMimes as readonly string[]).includes(f.mime));
  if (images.length + tables.length !== files.length) return { ok: false, message: "Ozzy reads PNG, JPG or WebP screenshots, or a CSV/Excel export." };
  if (tables.length && images.length) return { ok: false, message: "Send either screenshots or one report file, not both." };
  if (tables.length > 1) return { ok: false, message: "Send one report file at a time." };
  if (images.length > COACH_LIMITS.maxScreenshots) return { ok: false, message: `Up to ${COACH_LIMITS.maxScreenshots} screenshots at a time.` };
  if (images.some((f) => f.bytes > COACH_LIMITS.maxScreenshotBytes)) return { ok: false, message: "Each screenshot can be up to 8 MB." };
  if (tables.some((f) => f.bytes > COACH_LIMITS.maxTableBytes)) return { ok: false, message: "The report file can be up to 5 MB." };
  return { ok: true, kind: tables.length ? "table" : "screenshots" };
}

/** Browsers often send CSV as "" or application/vnd.ms-excel: normalize by extension. */
export function normalizeMime(name: string, mime: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return "text/csv";
  if (ext === "xlsx") return COACH_LIMITS.tableMimes[1];
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return mime;
}
