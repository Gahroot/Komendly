// Kly safeguards (KlySettings row "kly"): validation shared by the admin API and the settings drawer. No DB imports.
import { z } from "zod";

export const KLY_SETTINGS_ID = "kly";

export const KlySettingsSchema = z.object({
  enabled: z.boolean(),
  autoScale: z.boolean(),
  autoReply: z.boolean(),
  voiceEnabled: z.boolean(),
  dailyCallCap: z.number().int().min(0).max(10000),
  hourlyCallCap: z.number().int().min(0).max(1000),
  dailySendCeiling: z.number().int().min(0).max(1000),
  dailyGiftCap: z.number().int().min(0).max(500),
  monthlyBudgetCents: z.number().int().min(0).max(1_000_000),
  maxCodexWeeklyPct: z.number().int().min(0).max(100),
  minLeadScore: z.number().int().min(0).max(100),
  minQualityScore: z.number().int().min(0).max(10),
  followUpDays: z.number().int().min(1).max(30),
  maxSteps: z.number().int().min(1).max(3),
  explorationPct: z.number().int().min(0).max(50),
  targetCountries: z.array(z.string().trim().regex(/^[A-Z]{2}$/, "Use 2-letter country codes")).min(1).max(20),
  notes: z.string().trim().max(500).nullable(),
});
export type KlySettingsInput = z.infer<typeof KlySettingsSchema>;

/** Mirrors the schema defaults, used when the row doesn't exist yet. */
export const KLY_SETTINGS_DEFAULTS: KlySettingsInput = {
  enabled: true,
  autoScale: true,
  autoReply: true,
  voiceEnabled: false,
  dailyCallCap: 1000,
  hourlyCallCap: 100,
  dailySendCeiling: 80,
  dailyGiftCap: 40,
  monthlyBudgetCents: 30000,
  maxCodexWeeklyPct: 60,
  minLeadScore: 55,
  minQualityScore: 7,
  followUpDays: 4,
  maxSteps: 2,
  explorationPct: 20,
  targetCountries: ["US"],
  notes: null,
};
