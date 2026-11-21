import { NextRequest } from "next/server";
import { verifyAdWatchToken } from "@/lib/growth/ad-watch";
import { confirmAdWatch } from "@/lib/growth/ad-watch-server";
import { adWatchButton, adWatchPage } from "@/lib/growth/ad-watch-page";

export const dynamic = "force-dynamic";

function subIdFrom(request: NextRequest): string | null {
  const t = verifyAdWatchToken(request.nextUrl.searchParams.get("t") ?? "", process.env.LIFECYCLE_EMAIL_SECRET ?? "");
  return t?.a === "confirm" ? t.s : null;
}

const invalid = () => adWatchPage("Link not valid", "<h1>That link didn't work</h1><p>It may have expired (links last 7 days). Sign up again on komendly.com/tools/competitor-ad-watch.</p>", 400);

/** GET shows a confirm button (mail scanners open links; only a human click confirms). POST confirms. */
export async function GET(request: NextRequest) {
  if (!subIdFrom(request)) return invalid();
  return adWatchPage("Confirm Competitor ad watch", `<h1>Get your weekly Competitor ad watch?</h1><p>Every Monday Komendly emails you the new Facebook and Instagram ads your competitors launched. Weeks with nothing new are skipped. Unsubscribe in one click anytime.</p>${adWatchButton(request.nextUrl.pathname + request.nextUrl.search, "Yes, confirm")}`);
}

export async function POST(request: NextRequest) {
  const subId = subIdFrom(request);
  if (!subId) return invalid();
  const r = await confirmAdWatch(subId);
  if (r === "invalid") return invalid();
  if (r === "opted_out") return adWatchPage("Unsubscribed", "<h1>You unsubscribed after this request</h1><p>We won't email you. To start again, sign up on komendly.com/tools/competitor-ad-watch.</p>");
  return adWatchPage("Confirmed", "<h1>You're in</h1><p>Your first Competitor ad watch arrives on Monday, if your competitors launched anything new. Every email has a one-click unsubscribe.</p>");
}
