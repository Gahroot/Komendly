// Input schemas for outbound admin actions / CLI (no DB imports).
import { z } from "zod";

export const OutboundRunSchema = z.object({
  niche: z.string().trim().min(2).max(40),
  cities: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  count: z.number().int().min(1).max(100),
});

export const OutboundActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause"), mailboxId: z.string().min(1) }),
  z.object({ action: z.literal("resume"), mailboxId: z.string().min(1) }),
  z.object({ action: z.literal("run"), niche: OutboundRunSchema.shape.niche, cities: OutboundRunSchema.shape.cities, count: OutboundRunSchema.shape.count }),
  z.object({ action: z.literal("kill_switch"), enabled: z.boolean() }),
  z.object({ action: z.literal("suppress"), value: z.string().trim().min(3).max(200) }),
]);
export type OutboundAction = z.infer<typeof OutboundActionSchema>;

