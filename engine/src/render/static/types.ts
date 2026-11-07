import type { AdSpec, Extraction, Ratio } from "../../../../src/lib/ads/contracts";
import type { AIProvider, UsageMeter } from "../../providers/types";

export interface BrandKit {
  brandName: string;
  colors: Extraction["colors"];
  fonts: Extraction["fonts"];
  logoPath: string | null; // local file path (downloaded from storage)
  assets: Array<Extraction["assets"][number] & { path: string }>; // local files
  /** Additive (engine-core): downloaded brand font files, when the site served them. */
  fontFiles?: Array<{ family: string; role: string; path: string }>;
}

export interface StaticRenderInput {
  spec: AdSpec;
  brand: BrandKit;
  ratios: Ratio[];
  workDir: string;
  provider: AIProvider;
  signal?: AbortSignal;
  /** Additive (engine-core): QC feedback from a failed previous render, to fix on this attempt. */
  qcFeedback?: string;
  /** Templates already used by earlier ads in the same set; a template is used at most twice per set. */
  usedTemplates?: string[];
  /** Background field families (accent/dark/page) of earlier ads in the set; at most 3 share one. */
  usedFields?: string[];
}

export interface RenderedFile {
  ratio: Ratio;
  path: string;
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
  bytes: number;
}

export interface StaticRenderResult {
  files: RenderedFile[];
  usage: UsageMeter[];
}

export type RenderStaticAd = (input: StaticRenderInput) => Promise<StaticRenderResult>;
