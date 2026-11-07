import type { AdSpec, Ratio } from "../../../../src/lib/ads/contracts";
import type { AIProvider, UsageMeter } from "../../providers/types";
import type { BrandKit } from "../../render/static/types";

export interface MotionRenderInput {
  spec: AdSpec; // kind === "motion"
  brand: BrandKit;
  siteUrl: string;
  ratios: Ratio[]; // trial: ["9:16"] by default; paid: any
  workDir: string;
  provider: AIProvider;
  maxSeconds: number; // default 15
  signal?: AbortSignal;
  /** Additive (engine-core): QC feedback from a failed previous render. */
  qcFeedback?: string;
}

export interface MotionRenderResult {
  files: Array<{ ratio: Ratio; path: string; mime: "video/mp4"; width: number; height: number; bytes: number; durationSec: number }>;
  posterPath?: string;
  usage: UsageMeter[];
}

/** Module entry: engine/src/modules/ezmotion/index.ts must export `renderMotionAd` and `isMotionAvailable`. */
export type RenderMotionAd = (input: MotionRenderInput) => Promise<MotionRenderResult>;
