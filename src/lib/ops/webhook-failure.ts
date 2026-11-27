// Producer for the `webhook_failed` AdsEvent the incident engine reads (incident-io.ts gatherSignals). Never throws and never
// changes the caller's response. Written directly (not via trackAdsEvent) so it is not forwarded to Meta CAPI.
import { prisma } from "@/lib/prisma";

export async function recordWebhookFailure(provider: "stripe" | "stripe_ads" | "resend" | "fal" | "video_status", eventType: string, error: unknown): Promise<void> {
  try {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    await prisma.adsEvent.create({ data: { name: "webhook_failed", props: { provider, eventType: eventType.slice(0, 80), message } } });
  } catch { /* the failure ledger must never break a webhook response */ }
}
