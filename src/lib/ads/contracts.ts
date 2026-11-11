// Shared contract between the Next.js app and the generation engine (engine/).
// Pure TypeScript + zod only: no Next, Prisma or Node-specific imports.
import { z } from "zod";

export const RATIOS = ["4:5", "1:1", "9:16"] as const;
export type Ratio = (typeof RATIOS)[number];
export const RATIO_PIXELS: Record<Ratio, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};
export const TRIAL_RATIOS: Ratio[] = ["4:5"];

export const AWARENESS_LEVELS = [
  "unaware",
  "problem_aware",
  "solution_aware",
  "product_aware",
  "most_aware",
] as const;
export type Awareness = (typeof AWARENESS_LEVELS)[number];
export const TRIAL_AWARENESS_MIX: Partial<Record<Awareness, number>> = {
  problem_aware: 7,
  solution_aware: 3,
};

export const AD_GOALS = ["leads", "sales", "awareness", "traffic", "app_installs", "auto"] as const;
export type AdGoalValue = (typeof AD_GOALS)[number];

/** Seconds the user has to review the extraction before generation auto-starts. */
export const CONFIRM_WINDOW_SECONDS = 30;
/** Max agent re-extractions the user can request per run. */
export const MAX_EXTRACT_RETRIES = 3;

/** Credit prices (1 credit = 1 static ad in one ratio). Checked against the 2026-11-06 benchmark; see billing-config.ts. */
export const CREDIT_COST = {
  staticPerRatio: 1,
  motion: 5,
} as const;

export const TRIAL_GRANT = { static: 10, motion: 1 } as const;

const Sourced = z.object({ text: z.string(), sourceUrl: z.string(), quote: z.string().optional() });

/** What the engine extracts from a site; shown on the confirm screen and editable. */
export const ExtractionSchema = z.object({
  url: z.string(),
  domain: z.string(),
  brandName: z.string(),
  audience: z.string(),
  mainOffer: z.string(),
  pains: z.array(Sourced).max(8),
  proof: z.array(Sourced.extend({ kind: z.enum(["testimonial", "stat", "logo", "award", "other"]), attribution: z.string().optional() })),
  facts: z.array(z.object({ claim: z.string(), sourceUrl: z.string(), quote: z.string() })),
  landingPage: z.string(),
  suggestedGoal: z.enum(AD_GOALS),
  voice: z.string().optional(),
  colors: z.array(z.object({ hex: z.string(), role: z.string() })),
  fonts: z.array(z.object({ family: z.string(), role: z.string(), sourceUrl: z.string().optional() })),
  logoKey: z.string().nullable(),
  assets: z.array(
    z.object({
      key: z.string(),
      sourceUrl: z.string(),
      kind: z.enum(["product", "screenshot", "photo", "illustration", "icon", "other"]),
      width: z.number(),
      height: z.number(),
      hasFace: z.boolean(),
    }),
  ),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** User corrections from the confirm screen (only the editable strategy fields). */
export const CorrectionsSchema = z.object({
  audience: z.string().max(500).optional(),
  mainOffer: z.string().max(500).optional(),
  pains: z.array(z.string().max(300)).max(8).optional(),
  landingPage: z.string().url().optional(),
  goal: z.enum(AD_GOALS).optional(),
  note: z.string().max(1000).optional(), // free-text guidance for an agent retry
});
export type Corrections = z.infer<typeof CorrectionsSchema>;

/** One planned ad from the strategist. */
export const AdSpecSchema = z.object({
  index: z.number().int(),
  kind: z.enum(["static", "motion"]),
  awareness: z.enum(AWARENESS_LEVELS),
  angle: z.string(),
  hook: z.string(),
  headline: z.string().max(90),
  body: z.string().max(220).optional(),
  cta: z.string().max(30).optional(),
  claims: z.array(z.object({ claim: z.string(), sourceUrl: z.string() })),
  visual: z.object({
    concept: z.string(),
    assetKeys: z.array(z.string()),
    layout: z.string(),
    generateImagery: z.boolean(),
    imageryPrompt: z.string().optional(),
  }),
});
export type AdSpec = z.infer<typeof AdSpecSchema>;

export const JOB_TYPES = [
  "extract",
  "plan",
  "render_static",
  "render_motion",
  "qc",
  "publish_meta",
  "cleanup",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** Header the web app uses to call the engine's internal HTTP API (HMAC of body with ENGINE_SHARED_SECRET). */
export const ENGINE_SIGNATURE_HEADER = "x-komendly-signature";
