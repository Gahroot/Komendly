// Ozzy Studio funnel events (AdsEvent via trackAdsEvent: Meta CAPI + founder alerts + admin funnel). Never throws.
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { forwardAdsEventToMeta } from "@/lib/ads/meta-forward";
import { clientIpFromHeaders, coarseIpNet, isMetaIp } from "@/lib/ads/meta-ip";

const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit/i;

/** Pure: bot label for a public view (crawler UA or Meta-owned IP, like visit_landed), else null. */
export function studioViewBot(userAgent: string | null | undefined, metaIp: boolean): string | null {
  if (BOT_UA.test(userAgent ?? "")) return "crawler";
  return metaIp ? "meta_review" : null;
}

/** Public /s/<token> view. Bots are stored with props.bot (the funnel ignores them). */
export async function trackStudioShareView(token: string): Promise<void> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const ip = clientIpFromHeaders(h);
    const bot = studioViewBot(h.get("user-agent"), isMetaIp(ip));
    const r = await prisma.studioRender.findUnique({ where: { shareToken: token }, select: { workspaceId: true } });
    await trackAdsEvent("studio_share_viewed", { workspaceId: r?.workspaceId, props: { token, ipNet: coarseIpNet(ip), ...(bot ? { bot } : {}) } });
  } catch {
    // analytics must never break the product
  }
}

/**
 * The engine writes studio_first_render straight to the DB (no CAPI there). Forward it to Meta once, from the
 * next web request of that workspace (props.meta marks it sent; event_id is per workspace so Meta dedupes).
 */
export async function forwardStudioFirstRender(workspaceId: string, userId: string): Promise<void> {
  try {
    const ev = await prisma.adsEvent.findFirst({ where: { name: "studio_first_render", workspaceId }, select: { id: true, props: true } });
    const props = (ev?.props ?? {}) as Record<string, unknown>;
    if (!ev || props.meta) return;
    const meta = await forwardAdsEventToMeta("studio_first_render", { workspaceId, userId, props });
    await prisma.adsEvent.update({ where: { id: ev.id }, data: { props: { ...props, meta: (meta ?? { sent: false }) as object } } });
  } catch {
    // analytics must never break the product
  }
}
