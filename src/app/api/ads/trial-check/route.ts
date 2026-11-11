import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/ads/abuse";
import { trackAdsEvent } from "@/lib/ads/events";
import { isDomainTrialUsed, trialDomainFor } from "@/lib/ads/trial-domain";

/**
 * Public, pre-sign-up: has this website already used its free ad pack? Returns { used, domain }.
 * Rate-limited per IP; fails open ({ used: false }) so it never blocks a real visitor.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const domain = typeof body.url === "string" ? trialDomainFor(body.url) : null;
  if (!domain) return NextResponse.json({ used: false, domain: null });
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    if (!(await rateLimit(`trial_check:${ip}`, 30, 3600))) return NextResponse.json({ used: false, domain });
    const used = await isDomainTrialUsed(domain);
    if (used) await trackAdsEvent("trial_domain_blocked", { props: { stage: "pre_signup" } }).catch(() => undefined);
    return NextResponse.json({ used, domain });
  } catch {
    return NextResponse.json({ used: false, domain });
  }
}
