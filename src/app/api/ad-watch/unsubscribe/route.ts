import { NextRequest } from "next/server";
import { verifyAdWatchToken } from "@/lib/growth/ad-watch";
import { unsubscribeAdWatch } from "@/lib/growth/ad-watch-server";
import { adWatchButton, adWatchPage } from "@/lib/growth/ad-watch-page";

export const dynamic = "force-dynamic";

function subIdFrom(request: NextRequest): string | null {
  const t = verifyAdWatchToken(request.nextUrl.searchParams.get("t") ?? "", process.env.LIFECYCLE_EMAIL_SECRET ?? "");
  return t?.a === "unsub" ? t.s : null;
}

const invalid = () => adWatchPage("Link not valid", "<h1>That link didn't work</h1><p>Reply to the email and we'll take you off the list.</p>", 400);

/** GET: unsubscribe button (link scanners must not unsubscribe people). POST: unsubscribe, also RFC 8058 List-Unsubscribe-Post one-click. */
export async function GET(request: NextRequest) {
  if (!subIdFrom(request)) return invalid();
  return adWatchPage("Unsubscribe", `<h1>Stop the Competitor ad watch?</h1><p>You'll stop getting the weekly email about your competitors' new ads.</p>${adWatchButton(request.nextUrl.pathname + request.nextUrl.search, "Unsubscribe")}`);
}

export async function POST(request: NextRequest) {
  const subId = subIdFrom(request);
  if (!subId) return invalid();
  const oneClick = (await request.text().catch(() => "")).includes("List-Unsubscribe=One-Click");
  if (!(await unsubscribeAdWatch(subId, oneClick ? "one_click" : "link"))) return invalid();
  return adWatchPage("Unsubscribed", "<h1>You're unsubscribed</h1><p>No more Competitor ad watch emails from Komendly.</p>");
}
