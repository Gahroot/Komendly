// JSON shapes returned by /api/ads/* (pure types; safe for client components).
import type { AdGoalValue, Awareness, Corrections, Extraction, Ratio } from "./contracts";

export type RunStatus = "extracting" | "awaiting_confirm" | "queued" | "generating" | "completed" | "partial" | "failed" | "canceled";
export type AdStatusValue = "planned" | "rendering" | "qc" | "ready" | "failed_qc" | "failed";

export interface AdAssetView {
  id: string;
  ratio: Ratio;
  mime: string;
  width: number;
  height: number;
  previewUrl: string;
  downloadUrl: string;
}

export interface AdView {
  id: string;
  index: number;
  kind: "static" | "motion";
  awareness: Awareness;
  angle: string;
  headline: string;
  body: string | null;
  cta: string | null;
  status: AdStatusValue;
  assets: AdAssetView[];
}

export interface RunView {
  id: string;
  url: string;
  status: RunStatus;
  isTrial: boolean;
  goal: AdGoalValue;
  resolvedGoal: AdGoalValue | null;
  ratios: Ratio[];
  staticCount: number;
  motionCount: number;
  extraction: Extraction | null;
  corrections: Corrections | null;
  logoUrl: string | null;
  brandProfileId: string | null;
  confirmDeadline: string | null;
  confirmedAt: string | null;
  firstAdAt: string | null;
  completedAt: string | null;
  createdAt: string;
  error: string | null;
  retriesLeft: number;
  creditsReserved: number;
  ads: AdView[];
  serverNow: string;
}

export interface RunSummary {
  id: string;
  url: string;
  status: RunStatus;
  isTrial: boolean;
  createdAt: string;
  readyCount: number;
  totalCount: number;
}

export interface WorkspaceView {
  id: string;
  name: string;
  plan: string;
  isPaid: boolean;
  trialAvailable: boolean;
  balance: number;
  emailVerified: boolean;
  email: string;
}

export interface BrandSummary {
  id: string;
  domain: string;
  name: string | null;
  url: string;
  colors: { hex: string; role: string }[];
  updatedAt: string;
  logoUrl: string | null;
}
