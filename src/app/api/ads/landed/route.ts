import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { BOT_UA } from "@/lib/ads/pricing-funnel";
import { clientIpFromHeaders, coarseIpNet, isMetaIp } from "@/lib/ads/meta-ip";
import { ANON_ID_COOKIE, EXP_COOKIE, parseAssignments } from "@/lib/analytics/experiments";
import { FBC_COOKIE, FIRST_TOUCH_COOKIE, LAST_TOUCH_COOKIE, parseFirstTouch } from "@/lib/analytics/first-touch";

const LANDED_COOKIE = "kmd_ld";
const ENGAGED_COOKIE = "kmd_eg";

/**
 * Funnel step 0: one `visit_landed` AdsEvent per anonymous visitor per UTC day, with its attribution.
 * Body `{ kind: "engaged" }` (sent after the visitor interacts or stays 5 s) records one `visit_engaged` per visitor per day.
 * Meta-owned IPs (ad review loads every ad link with a browser UA) are stored with `props.bot = "meta_review"`;
 * `props.ipNet` keeps only the /24 (IPv4) or /48 (IPv6), never the full IP.
 * Public beacon; deduped by a day cookie first, then the DB.
 */
export async function POST(request: NextRequest) {
  const ok = NextResponse.json({ ok: true });
  try {
    const anonId = request.cookies.get(ANON_ID_COOKIE)?.value;
    const day = new Date().toISOString().slice(0, 10);
    const body = (await request.json().catch(() => ({}))) as { path?: unknown; kind?: unknown };
    const engaged = body.kind === "engaged";
    const cookie = engaged ? ENGAGED_COOKIE : LANDED_COOKIE;
    const name = engaged ? "visit_engaged" : "visit_landed";
    if (!anonId || request.cookies.get(cookie)?.value === day || BOT_UA.test(request.headers.get("user-agent") ?? "")) return ok;
    ok.cookies.set(cookie, day, { path: "/", maxAge: 60 * 60 * 24, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
    const seen = await prisma.adsEvent.findFirst({
      where: { name, createdAt: { gte: new Date(`${day}T00:00:00Z`) }, props: { path: ["anonId"], equals: anonId } },
      select: { id: true },
    });
    if (seen) return ok;
    const ip = clientIpFromHeaders(request.headers);
    await trackAdsEvent(name, {
      props: {
        anonId,
        path: typeof body.path === "string" ? body.path.slice(0, 200) : undefined,
        firstTouch: parseFirstTouch(request.cookies.get(FIRST_TOUCH_COOKIE)?.value),
        lastTouch: parseFirstTouch(request.cookies.get(LAST_TOUCH_COOKIE)?.value),
        hasFbc: request.cookies.has(FBC_COOKIE),
        exp: parseAssignments(request.cookies.get(EXP_COOKIE)?.value),
        ipNet: coarseIpNet(ip),
        ...(isMetaIp(ip) ? { bot: "meta_review" } : {}),
      },
    });
  } catch {
    // analytics must never break the product
  }
  return ok;
}
