// Client-safe view types for /ads/coach (no server imports).
import type { CoachAccess } from "./access";
import type { CoachStatus, CoachVerdict } from "./contracts";

export interface CoachReviewView {
  id: string;
  status: CoachStatus;
  kind: "table" | "screenshots";
  note: string | null;
  fileCount: number;
  verdict: CoachVerdict | null;
  error: string | null;
  moreRunId: string | null;
  createdAt: string;
}

export interface CoachHome {
  access: CoachAccess;
  reviews: CoachReviewView[];
  /** Website used for "Make 5 more" when the winner isn't one of their Komendly ads; null = ask. */
  defaultUrl: string | null;
}
