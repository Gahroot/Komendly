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
  /** Trial bonus ad (visualBrief.locked in the engine contract); absent for normal ads. */
  bonusKind?: "story" | "motion" | "fresh";
  /** Bonus ad the workspace hasn't paid for: `assets` is empty and only `lockedPreviewUrl` (blurred poster) is served. */
  locked?: boolean;
  lockedPreviewUrl?: string | null;
}

export interface RunBonusView {
  stories: number;
  videos: number;
  locked: boolean;
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
  /** Ready trial bonus ads; null when there are none (ADS_TRIAL_BONUS off). */
  bonus: RunBonusView | null;
  /** Bonus ads are still expected for this settled run: keep polling. */
  bonusPending: boolean;
  /** Ads -> Ozzy Studio bridge (flag studio_bridge, default off). */
  studio?: { bridge: boolean; freeVideosLeft: number };
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
  /** Free trial statics (20 for referred workspaces, else 10). */
  trialStatic: number;
  /** Referral credits in the balance that expire, soonest first. */
  expiring: { credits: number; expiresAt: string }[];
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
