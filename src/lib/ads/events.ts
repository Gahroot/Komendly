import { prisma } from "@/lib/prisma";

export type AdsEventName =
  | "trial_started"
  | "extraction_shown"
  | "extraction_retried"
  | "run_confirmed"
  | "first_ad_ready"
  | "run_completed"
  | "export_downloaded"
  | "checkout_started"
  | "paid_converted"
  | "churned"
  | "pricing_survey";

/** Fire-and-forget funnel event. Never throws. */
export async function trackAdsEvent(
  name: AdsEventName,
  data: { workspaceId?: string; userId?: string; runId?: string; props?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await prisma.adsEvent.create({
      data: { name, workspaceId: data.workspaceId, userId: data.userId, runId: data.runId, props: (data.props ?? {}) as object },
    });
  } catch {
    // analytics must never break the product
  }
}
