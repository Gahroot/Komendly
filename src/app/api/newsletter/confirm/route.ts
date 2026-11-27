import { NextRequest } from "next/server";
import { verifyNewsletterToken } from "@/lib/growth/newsletter";
import { confirmNewsletter } from "@/lib/growth/newsletter-server";
import { adWatchButton, adWatchPage } from "@/lib/growth/ad-watch-page";

export const dynamic = "force-dynamic";

function subIdFrom(request: NextRequest): string | null {
  const t = verifyNewsletterToken(request.nextUrl.searchParams.get("t") ?? "", process.env.LIFECYCLE_EMAIL_SECRET ?? "");
  return t?.a === "confirm" ? t.s : null;
}
const invalid = () => adWatchPage("Link not valid", "<h1>That link didn't work</h1><p>It may have expired (links last 7 days). Sign up again on komendly.com/tools/ozzys-ad-report.</p>", 400);

/** GET shows a confirm button (mail scanners open links; only a human click confirms). POST confirms. */
export async function GET(request: NextRequest) {
  if (!subIdFrom(request)) return invalid();
  return adWatchPage("Confirm Ozzy's Ad Report", `<h1>Get Ozzy's Ad Report every Thursday?</h1><p>One real number, one ad idea and one tip. One-click unsubscribe in every issue.</p>${adWatchButton(request.nextUrl.pathname + request.nextUrl.search, "Yes, send it")}`);
}

export async function POST(request: NextRequest) {
  const subId = subIdFrom(request);
  if (!subId) return invalid();
  const r = await confirmNewsletter(subId);
  if (r === "invalid") return invalid();
  if (r === "opted_out") return adWatchPage("Unsubscribed", "<h1>You unsubscribed after this request</h1><p>We won't email you. To start again, sign up on komendly.com/tools/ozzys-ad-report.</p>");
  return adWatchPage("Confirmed", "<h1>You're in</h1><p>Your first Ad Report arrives on Thursday.</p>");
}
