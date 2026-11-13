import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/ads/abuse";
import { trackAdsEvent } from "@/lib/ads/events";
import { clientIpFromHeaders, coarseIpNet, isMetaIp } from "@/lib/ads/meta-ip";
import { BOT_UA, pricingPageOf } from "@/lib/ads/pricing-funnel";
import { ANON_ID_COOKIE } from "@/lib/analytics/experiments";
import { FIRST_TOUCH_COOKIE, parseFirstTouch } from "@/lib/analytics/first-touch";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const short = (v: unknown, n = 40) => (typeof v === "string" && v.length > 0 ? v.slice(0, n) : undefined);

/**
 * Public beacon from the pricing pages: `{ kind: "view" | "click", path, plan?, interval? }` records `pricing_viewed`
 * (one per page view) or `pricing_plan_clicked`. Works signed out (anonId cookie). Crawler UAs are dropped, Meta-owned
 * IPs flagged `props.bot` (same rule as visit_landed). Rate-limited per browser. Always answers 204.
 */
export async function POST(request: NextRequest) {
  const ok = new NextResponse(null, { status: 204 });
  try {
    const body = (await request.json().catch(() => ({}))) as { kind?: unknown; path?: unknown; plan?: unknown; interval?: unknown };
    const page = pricingPageOf(body.path);
    const anonId = request.cookies.get(ANON_ID_COOKIE)?.value;
    if (!page || (body.kind !== "view" && body.kind !== "click") || BOT_UA.test(request.headers.get("user-agent") ?? "")) return ok;
    const ip = clientIpFromHeaders(request.headers);
    const user = await getCurrentUser();
    if (!user && !anonId) return ok;
    if (!(await rateLimit(`pricing_event:${user?.id ?? anonId}`, 120, 3600))) return ok;
    const ws = user ? await prisma.adsWorkspace.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, adsPlan: true, subscriptionStatus: true, trialUsedAt: true } }) : null;
    const common = {
      page,
      signedIn: Boolean(user),
      anonId,
      ...(ws ? { plan: ws.adsPlan, subscriptionStatus: ws.subscriptionStatus, freePackUsed: Boolean(ws.trialUsedAt) } : {}),
      ...(isMetaIp(ip) ? { bot: "meta_review" } : {}),
    };
    if (body.kind === "view") {
      await trackAdsEvent("pricing_viewed", { userId: user?.id, workspaceId: ws?.id, props: { ...common, firstTouch: parseFirstTouch(request.cookies.get(FIRST_TOUCH_COOKIE)?.value), ipNet: coarseIpNet(ip) } });
    } else {
      await trackAdsEvent("pricing_plan_clicked", { userId: user?.id, workspaceId: ws?.id, props: { ...common, clickedPlan: short(body.plan), interval: short(body.interval, 10) } });
    }
  } catch {
    // analytics must never break the product
  }
  return ok;
}
