// AI-written (Codex) lifecycle copy with strict validation; any failure -> fixed fallback copy.
import { z } from "zod";
import { isVerifyKind } from "../../../src/lib/ads/lifecycle/select";
import { buildCopyPrompt, checkCopy, COPY_SYSTEM, fallbackCopy, MAX_SUBJECT, type CopyContext, type EmailCopy } from "../../../src/lib/ads/lifecycle/copy";
import { structured } from "../providers/structured";
import type { AIProvider, UsageMeter } from "../providers/types";

export const CopySchema = z.object({
  subject: z.string().min(3).max(MAX_SUBJECT),
  preheader: z.string().max(90),
  paragraphs: z.array(z.string().min(1).max(600)).min(2).max(4),
  ctaLabel: z.string().min(2).max(28),
});

export async function writeCopy(
  provider: AIProvider | null,
  ctx: CopyContext,
  now: Date,
  signal?: AbortSignal,
): Promise<{ copy: EmailCopy; source: "ai" | "fallback"; reason?: string }> {
  const fallback = fallbackCopy(ctx, now);
  // The verification nudge carries a code: keep its subject/copy fixed and predictable.
  if (!provider || isVerifyKind(ctx.kind)) return { copy: fallback, source: "fallback", reason: provider ? "fixed kind" : "no provider" };
  try {
    const usage: UsageMeter[] = [];
    const out = await structured(provider, CopySchema, { system: COPY_SYSTEM, prompt: buildCopyPrompt(ctx, now), reasoning: "low", signal }, usage);
    const bad = checkCopy(out, ctx);
    if (bad) return { copy: fallback, source: "fallback", reason: bad };
    return { copy: out, source: "ai" };
  } catch (e) {
    return { copy: fallback, source: "fallback", reason: e instanceof Error ? e.message.slice(0, 200) : "error" };
  }
}
