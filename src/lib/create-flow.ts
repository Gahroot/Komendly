// State of one /dashboard/create-fal run (review -> actor -> generate), kept in sessionStorage per tab.
// Progress shown to the user is derived only from real status fields (see `stageFromStatus`).

import type { DraftLength, PresenterGender } from "@/lib/testimonial-draft";

export const FLOW_KEY = "kmd_create_flow";

export interface CreateFlow {
  reviewId: string;
  reviewText: string;
  businessName: string;
  reviewerName: string;
  rating: number;
  gender: PresenterGender;
  length: DraftLength;
  actorId?: string;
  actorName?: string;
  compositeVideoId?: string;
}

function s(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Validate untrusted JSON from storage. */
export function parseFlow(raw: string | null): CreateFlow | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const reviewId = s(o.reviewId, 100);
  const reviewText = s(o.reviewText, 2000);
  if (!reviewId || !reviewText) return null;
  return {
    reviewId,
    reviewText,
    businessName: s(o.businessName, 200) || "My business",
    reviewerName: s(o.reviewerName, 100) || "A happy customer",
    rating: typeof o.rating === "number" && o.rating >= 1 && o.rating <= 5 ? Math.round(o.rating) : 5,
    gender: o.gender === "female" || o.gender === "male" ? o.gender : "any",
    length: o.length === "60" ? "60" : "30",
    actorId: s(o.actorId, 100) || undefined,
    actorName: s(o.actorName, 100) || undefined,
    compositeVideoId: s(o.compositeVideoId, 100) || undefined,
  };
}

export function loadFlow(): CreateFlow | null {
  try {
    return parseFlow(window.sessionStorage.getItem(FLOW_KEY));
  } catch {
    return null;
  }
}

export function saveFlow(flow: CreateFlow): void {
  try {
    window.sessionStorage.setItem(FLOW_KEY, JSON.stringify(flow));
  } catch {
    // storage blocked: the step still works within this page
  }
}

export function clearFlow(): void {
  try {
    window.sessionStorage.removeItem(FLOW_KEY);
  } catch {
    // ignore
  }
}

/** Set a once-per-tab flag; returns false when it was already set (e.g. a refresh after auto-start). */
export function claimOnce(key: string): boolean {
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

export type GenStage = "pending" | "script" | "voicing" | "animating" | "finishing" | "ready" | "failed";

export const STAGES: { id: Exclude<GenStage, "failed">; label: string }[] = [
  { id: "pending", label: "In the queue" },
  { id: "script", label: "Writing the script" },
  { id: "voicing", label: "Recording the voice" },
  { id: "animating", label: "Filming the presenter" },
  { id: "finishing", label: "Stitching and finishing" },
  { id: "ready", label: "Ready" },
];

export interface StatusLike {
  status: string;
  clips?: { status: string }[];
  finalVideoUrl?: string;
}

/** Map the real status response to a stage. No timers, no guesses. */
export function stageFromStatus(s: StatusLike): GenStage {
  const clips = s.clips ?? [];
  switch (s.status) {
    case "completed":
      return s.finalVideoUrl ? "ready" : "finishing";
    case "failed":
      return "failed";
    case "stitching":
      return "finishing";
    case "generating_clips":
      if (clips.some((c) => c.status === "generating_video")) return "animating";
      if (clips.some((c) => c.status === "generating_audio")) return "voicing";
      if (clips.some((c) => c.status === "completed")) return "animating";
      return "script";
    default:
      return "pending";
  }
}

export function clipCounts(s: StatusLike): { done: number; total: number } {
  const clips = s.clips ?? [];
  return { done: clips.filter((c) => c.status === "completed").length, total: clips.length };
}
