// Ozzy Ad Department bonuses: shared contract between the web app and the engine (bonus_generate job).
// Pure TypeScript + zod only (the engine imports this file directly): no Next, Prisma or Node imports.
import { z } from "zod";

export const BONUS_JOB_TYPE = "bonus_generate" as const;
/** Kill switch for the engine loop and member re-runs: ADS_BONUSES=0 turns all generation off. */
export function bonusesEnabled(env: Record<string, string | undefined>): boolean {
  return env.ADS_BONUSES !== "0";
}

export const BONUS_KINDS = ["website_checkup", "ad_plan", "hook_library"] as const;
export type AdsBonusKind = (typeof BONUS_KINDS)[number];
export const BonusKindSchema = z.enum(BONUS_KINDS);
export const BonusPayloadSchema = z.object({ kind: BonusKindSchema, reason: z.string().max(40).optional() });

export const BONUS_META: Record<AdsBonusKind, { title: string; valueUsd: number; blurb: string }> = {
  website_checkup: { title: "Website check-up", valueUsd: 300, blurb: "Ozzy reviews your site and hands you the 7 fixes that turn more ad clicks into sales." },
  ad_plan: { title: "30-day ad plan", valueUsd: 250, blurb: "Which of your ads to run each week, what to spend, what to write, and when to judge it." },
  hook_library: { title: "Hook & caption library", valueUsd: 150, blurb: "40 hooks and 20 captions for your business. One click turns any hook into an ad." },
};

// ---- Website check-up ---------------------------------------------------------
export const CHECKUP_AREAS = ["headline", "offer", "proof", "cta", "speed_mobile", "trust", "form_friction"] as const;
export const CheckupFixSchema = z.object({
  area: z.enum(CHECKUP_AREAS),
  title: z.string().min(3).max(120),
  whatsWrong: z.string().min(10).max(600),
  whyItMatters: z.string().min(10).max(600),
  /** Exact replacement copy when the fix is about words; null otherwise. */
  rewrite: z.string().max(600).nullable(),
});
export const CheckupSchema = z
  .object({
    summary: z.string().min(10).max(600),
    fixes: z.array(CheckupFixSchema).length(7),
  })
  .refine((c) => new Set(c.fixes.map((f) => f.area)).size === CHECKUP_AREAS.length, { message: "each of the 7 areas must appear exactly once" });
export type WebsiteCheckup = z.infer<typeof CheckupSchema>;

// ---- 30-day ad plan -------------------------------------------------------------
export const PlanWeekSchema = z.object({
  week: z.number().int().min(1).max(4),
  adId: z.string().min(1).max(64),
  adHeadline: z.string().max(200),
  why: z.string().min(10).max(500),
  dailyBudgetUsd: z.number().int().min(10).max(20),
  primaryText: z.string().min(10).max(1200),
  headline: z.string().min(2).max(120),
  judgeWhen: z.string().min(10).max(400),
});
export const AdPlanSchema = z
  .object({
    summary: z.string().min(10).max(600),
    weeks: z.array(PlanWeekSchema).length(4),
    rules: z.array(z.string().min(5).max(240)).min(2).max(5),
  })
  .refine((p) => p.weeks.every((w, i) => w.week === i + 1), { message: "weeks must be numbered 1, 2, 3, 4 in order" });
export type AdPlan = z.infer<typeof AdPlanSchema>;

/** Plan ad ids must be the member's real ads. Returns the bad ids (empty = ok). */
export function unknownPlanAds(plan: AdPlan, adIds: readonly string[]): string[] {
  const ok = new Set(adIds);
  return plan.weeks.map((w) => w.adId).filter((id) => !ok.has(id));
}

// ---- Hook & caption library -----------------------------------------------------
export const HOOK_LEVELS = ["problem_aware", "solution_aware", "offer"] as const;
export type HookLevel = (typeof HOOK_LEVELS)[number];
export const HOOK_LEVEL_LABELS: Record<HookLevel, string> = {
  problem_aware: "They feel the problem",
  solution_aware: "They're comparing fixes",
  offer: "Ready for your offer",
};
const LineSchema = z.object({ level: z.enum(HOOK_LEVELS), text: z.string().min(5).max(600) });
export const HookLibrarySchema = z
  .object({
    industry: z.string().min(2).max(120),
    offer: z.string().min(2).max(300),
    hooks: z.array(LineSchema.extend({ text: z.string().min(5).max(200) })).length(40),
    captions: z.array(LineSchema).length(20),
  })
  .refine((l) => HOOK_LEVELS.every((lv) => l.hooks.filter((h) => h.level === lv).length >= 8 && l.captions.filter((c) => c.level === lv).length >= 4), {
    message: "every awareness level needs at least 8 hooks and 4 captions",
  })
  .refine((l) => new Set(l.hooks.map((h) => h.text.trim().toLowerCase())).size === l.hooks.length, { message: "hooks must all be different" });
export type HookLibrary = z.infer<typeof HookLibrarySchema>;

export const BONUS_SCHEMAS = { website_checkup: CheckupSchema, ad_plan: AdPlanSchema, hook_library: HookLibrarySchema } as const;

/** Parse stored bonus data for display; null when missing/invalid. */
export function parseBonusData<K extends AdsBonusKind>(kind: K, data: unknown): z.infer<(typeof BONUS_SCHEMAS)[K]> | null {
  const r = BONUS_SCHEMAS[kind].safeParse(data);
  return r.success ? (r.data as z.infer<(typeof BONUS_SCHEMAS)[K]>) : null;
}

// ---- Due / refresh decision (pure) ----------------------------------------------
const DAY = 86_400_000;
export const BONUS_TIMING = {
  checkupRerunMs: 7 * DAY,
  monthlyMs: 30 * DAY,
  failedRetryMs: 6 * 3_600_000,
  stuckMs: 2 * 3_600_000,
  /** New ads must be this old before the plan is rebuilt (let a Weekly Drop finish). */
  newAdsSettleMs: 2 * 3_600_000,
} as const;

export type BonusStatus = "pending" | "generating" | "ready" | "failed";

export interface BonusRowState {
  status: BonusStatus | string;
  generatedAt: Date | null;
  updatedAt: Date;
}

export interface BonusDueContext {
  now: Date;
  /** Ready, non-locked ads in the workspace. */
  readyAdCount: number;
  latestReadyAdAt: Date | null;
  hasBrand: boolean;
}

export type BonusDueReason = "initial" | "monthly" | "new_ads" | "retry" | "stuck";

/** Should the engine loop (re)generate this bonus now? Member re-runs of the check-up go through canRerunCheckup. */
export function bonusDue(kind: AdsBonusKind, row: BonusRowState | null, ctx: BonusDueContext): BonusDueReason | null {
  if (!ctx.hasBrand) return null;
  if (kind === "ad_plan" && ctx.readyAdCount === 0) return null;
  const now = ctx.now.getTime();
  if (!row) return "initial";
  if (row.status === "pending" || row.status === "generating") return now - row.updatedAt.getTime() > BONUS_TIMING.stuckMs ? "stuck" : null;
  if (row.status === "failed") return now - row.updatedAt.getTime() > BONUS_TIMING.failedRetryMs ? "retry" : null;
  if (!row.generatedAt) return "initial";
  const age = now - row.generatedAt.getTime();
  if (kind === "website_checkup") return null; // generated once; the member re-runs it weekly
  if (age > BONUS_TIMING.monthlyMs) return "monthly";
  if (kind === "ad_plan" && ctx.latestReadyAdAt && ctx.latestReadyAdAt > row.generatedAt && now - ctx.latestReadyAdAt.getTime() > BONUS_TIMING.newAdsSettleMs) return "new_ads";
  return null;
}

/** Member re-run of the check-up: once a week. Returns when it opens again (null = allowed now). */
export function checkupRerunOpensAt(row: BonusRowState | null, now: Date): Date | null {
  if (!row) return null;
  if (row.status === "pending" || row.status === "generating") return new Date(now.getTime() + BONUS_TIMING.checkupRerunMs);
  if (!row.generatedAt) return null;
  const opens = row.generatedAt.getTime() + BONUS_TIMING.checkupRerunMs;
  return opens > now.getTime() ? new Date(opens) : null;
}

/** JSON schema for the provider (built with the web app's zod; the engine's zod major differs). */
export function bonusJsonSchema(kind: AdsBonusKind): Record<string, unknown> {
  return z.toJSONSchema(BONUS_SCHEMAS[kind], { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
}

/** Validate model output for a bonus kind: data or a short error to send back for one repair. */
export function checkBonusOutput<K extends AdsBonusKind>(kind: K, json: unknown): { ok: true; data: z.infer<(typeof BONUS_SCHEMAS)[K]> } | { ok: false; error: string } {
  const r = BONUS_SCHEMAS[kind].safeParse(json);
  return r.success ? { ok: true, data: r.data as z.infer<(typeof BONUS_SCHEMAS)[K]> } : { ok: false, error: r.error.message.slice(0, 1500) };
}
