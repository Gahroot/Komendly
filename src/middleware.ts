import { NextRequest, NextResponse } from "next/server";
import { FBC_COOKIE, FIRST_TOUCH_COOKIE, FIRST_TOUCH_MAX_AGE, LAST_TOUCH_COOKIE, firstTouchFromUrl, serializeFirstTouch } from "@/lib/analytics/first-touch";
import { ROUTE_HEADER, isRefusedForApiKey, parseBearer } from "@/lib/agent-keys/policy";
import { assistantTouchUrl } from "@/lib/oauth/assistant-touch";
import { ANON_ID_COOKIE, EXP_COOKIE, EXP_COOKIE_MAX_AGE, applyOverride, completeAssignments, parseAssignments, serializeAssignments } from "@/lib/analytics/experiments";

/** Give every page visitor a stable anon id + A/B assignments, visible to this same request's server render. */
function withExperiments(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.next();
  let anonId = request.cookies.get(ANON_ID_COOKIE)?.value;
  const isNew = !anonId;
  anonId ??= crypto.randomUUID();
  const before = request.cookies.get(EXP_COOKIE)?.value;
  const assignments = applyOverride(completeAssignments(anonId, parseAssignments(before)), searchParams.get("exp"));
  const serialized = serializeAssignments(assignments);
  // First-touch attribution (e.g. a blog CTA's UTM params): recorded once, read at ads sign-up.
  // Last touch is overwritten by every attributed visit (UTM, fbclid or external referrer); first touch only once.
  // The OAuth consent page counts as an ai_assistant touch (ChatGPT/Claude opened it), so the sign-up after it is traced.
  const touch = firstTouchFromUrl(assistantTouchUrl(request.nextUrl), new Date(), request.headers.get("referer"));
  const firstTouch = request.cookies.has(FIRST_TOUCH_COOKIE) ? null : touch;
  if (!isNew && serialized === before && !touch) return NextResponse.next();
  request.cookies.set(ANON_ID_COOKIE, anonId);
  request.cookies.set(EXP_COOKIE, serialized);
  const res = NextResponse.next({ request: { headers: request.headers } });
  const opts = { path: "/", maxAge: EXP_COOKIE_MAX_AGE, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
  res.cookies.set(ANON_ID_COOKIE, anonId, { ...opts, httpOnly: true });
  res.cookies.set(EXP_COOKIE, serialized, opts);
  if (firstTouch) res.cookies.set(FIRST_TOUCH_COOKIE, serializeFirstTouch(firstTouch), { ...opts, maxAge: FIRST_TOUCH_MAX_AGE, httpOnly: true });
  if (touch) res.cookies.set(LAST_TOUCH_COOKIE, serializeFirstTouch(touch), { ...opts, maxAge: FIRST_TOUCH_MAX_AGE, httpOnly: true });
  // Meta click cookie: the pixel sets it too, but only after JS loads; set it server-side so CAPI sees it on sign-up.
  if (touch?.fbc && !request.cookies.has(FBC_COOKIE)) res.cookies.set(FBC_COOKIE, touch.fbc, { ...opts, maxAge: FIRST_TOUCH_MAX_AGE });
  return res;
}

// Routes that don't require authentication
const publicRoutes = ["/", "/testimonials", "/login", "/register", "/pricing", "/ads/pricing", "/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt"];

// Routes that start with these prefixes are public
const publicPrefixes = [
  "/blog",                 // Blog pages, hubs and /blog/feed.xml (RSS)
  "/api/auth/",
  "/api/stripe/webhooks",  // Stripe webhooks must be public
  "/api/stripe/checkout",  // Checkout API for unauthenticated users
  "/checkout/",            // Checkout pages
  "/api/ads/auth/",        // Website2ads sign-up / login
  "/api/ads/device",
  "/api/ads/trial-check",  // Pre-sign-up "website already had its free pack?" check (rate-limited)
  "/api/ads/pricing-event", // Pricing page view / plan click beacon (anonymous too, rate-limited)
  "/api/ads/landed",       // Anonymous landing beacon (visit_landed, deduped per visitor per day)       // First-party device cookie (pre-auth abuse fingerprint)
  "/api/ads/email-img/",   // Signed (HMAC, ~30 days) ad thumbnails in lifecycle emails
  "/api/ads/email-unsubscribe", // Signed one-click unsubscribe from lifecycle emails
  "/api/ads/email-click/", // Signed click-tracking redirect in lifecycle emails (app-relative paths only)
  "/api/inbound/",         // Resend inbound email webhook (Svix-signed)
  "/api/outbound/",       // Cold outbound claim-link redirect + one-click unsubscribe (token-checked)
  "/g/",                   // Kly short claim link (same as /api/outbound/c/)
  "/u/",                   // Kly short unsubscribe link (same as /api/outbound/unsubscribe)
  "/api/ads/gift-public/", // Gift pack page beacon + token-checked ad images (public /gift/<token>)
  "/api/reels/",          // Ozzy reels: public video redirect for Meta to pull; queue route checks its own bearer token
  "/api/ad-of-the-week/",  // Public images of consented ads only (Ad of the week, /ad-examples)
  "/api/ads-billing/webhook", // Stripe webhook for ads billing (signature-verified)
  "/api/meta-webhooks/",   // Meta leadgen webhook (X-Hub-Signature-256 verified; GET verify-token handshake)
  "/api/cron/",            // Vercel Cron jobs (Bearer CRON_SECRET checked in each route)
  "/results",              // Public customer results (consented, measured only; noindex while empty)
  "/api/proof/",           // Case-study consent links (signed token, confirm page + POST)
  "/api/winback/go",       // Win-back: signed, expiring links (update card portal, churn reason, come-back checkout)
  "/api/recovery/resume",  // Abandoned-checkout recovery: signed, expiring resume-checkout link (token-bound to user + item)
  "/s/",                   // Ozzy Studio public share pages (/s/<token>)
  "/m/",                   // "Made with Komendly" mark short link (/m/<code>, viral_branding)
  "/api/studio/share/",    // Public share data (token-checked)
  "/api/studio/live/",     // Live preview files for the sandboxed player (per-version capability token; the entry needs a session)
  "/studio/invite/",       // Ozzy Studio invite landing ("2 free videos")
  "/api/studio/invite/",   // Invite accept: sets the invite cookie, redirects to sign-up
  "/api/mcp",              // Hosted Ozzy MCP server: authenticates its own OAuth token or API key
  "/.well-known/oauth-",   // OAuth discovery metadata (RFC 9728 / RFC 8414) for MCP clients
  "/.well-known/openid-configuration",
  "/.well-known/mcp",      // MCP server card (/.well-known/mcp/server-card.json, /.well-known/mcp.json) for directories
  "/.well-known/openai-apps-challenge", // ChatGPT plugin domain verification (token from OPENAI_APPS_CHALLENGE)
  "/api/oauth/",           // OAuth register/token/revoke (client-authenticated) + consent POST (session + signed form)
  "/oauth/",               // Consent page (sends signed-out visitors to /login itself)
  "/embed/",               // Embeddable free tools (iframe-able, public)
  "/compare",              // Komendly vs <competitor> and /alternatives pages, ad copy library and ad inspiration (public SEO pages)
  "/alternatives/",
  "/ad-copy-library",
  "/ad-inspiration",
  "/reports/",             // Public data reports (aggregate, anonymous; ISR daily) + their CSV downloads
  "/api/ad-check",         // Meta Ad Check (no sign-up): queue + poll by unguessable token (rate-limited, daily cap, kill switch sys_ad_check)
  "/api/free-tools",       // Free /tools (no sign-up): AI job queue + poll + usage beacon (rate-limited, daily cap, kill switch sys_free_tools)
  "/shopify",              // Embedded Shopify admin app (App Bridge session token, no cookies; sys_shopify)
  "/api/shopify/",         // Shopify app API (session-token auth), HMAC-verified webhooks, health, signed open link
  "/api/integrations/jobber/", // Jobber app: OAuth authorize/callback (signed state + PKCE), HMAC-verified webhook, link (checks the session itself)
  "/api/ad-watch/",        // Competitor ad watch: public double opt-in sign-up (rate-limited, sys_ad_watch) + signed confirm/unsubscribe links
  "/api/hub/",             // Creative hubs: public forms, votes, challenge, signed opt-out, capability images (flags creative_*; rate-limited)
  "/api/approve/",         // No-login approve / request-changes on an ad pack (signed token)
  "/makeover", "/nominate", "/rescue", "/launch-gifts", "/giveaways", "/nonprofits", "/react", "/reviews-to-ads", "/challenge", "/vote", // Creative hub pages
  "/100-businesses", "/business-of-the-day", "/seasonal", "/approve/", "/showcase", // Public progress, BOTD, seasonal releases, approve links, opt-in showcases
  "/api/testimonials/price-survey", // Van Westendorp survey: anonymous /pricing visitors answer too (rate-limited)
];

// Routes that require active subscription (not just authentication)
const subscriptionRequiredRoutes = ["/dashboard"];
const subscriptionRequiredApiPrefixes = [
  "/api/generate",
  "/api/videos",
  "/api/reviews",
  "/api/mirage",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Personal API keys (agents): `Authorization: Bearer kmd_...` on /api/*. The route handler resolves the key
  // (getCurrentUser); here we refuse forbidden routes early and stamp the trusted route header it relies on.
  if (pathname.startsWith("/api/") && parseBearer(request.headers.get("authorization"))) {
    if (!request.cookies.get("session_token")?.value && isRefusedForApiKey(pathname)) {
      return NextResponse.json({ error: "API keys can't be used for this. Sign in on komendly.com instead.", code: "api_key_refused" }, { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.set(ROUTE_HEADER, `${request.method} ${pathname}`);
    return NextResponse.next({ request: { headers } });
  }

  // Check if the route is public
  const isPublicRoute = publicRoutes.includes(pathname);
  const isPublicPrefix = publicPrefixes.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // Allow public routes and prefixes
  if (isPublicRoute || isPublicPrefix) {
    return withExperiments(request);
  }

  // Check for session token
  const sessionToken = request.cookies.get("session_token")?.value;

  // Signed-out Studio visit: keep the full path + query (e.g. /studio?remix=<ad link>) through sign-in.
  if (!sessionToken && (pathname === "/studio" || pathname.startsWith("/studio/"))) {
    const loginUrl = new URL("/ads/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // If no session token and trying to access protected route, redirect to login
  if (!sessionToken && pathname.startsWith("/dashboard")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If no session token for other protected API routes, return 401
  if (!sessionToken && pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // For routes requiring subscription, validate subscription status
  const requiresSubscription =
    subscriptionRequiredRoutes.some((route) => pathname.startsWith(route)) ||
    subscriptionRequiredApiPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (requiresSubscription && sessionToken) {
    // We need to check subscription status
    // Pass a header to indicate subscription check is needed
    // The actual check happens in the route/page to avoid DB calls in edge middleware
    const response = NextResponse.next();
    response.headers.set("x-subscription-check", "required");
    return response;
  }

  return withExperiments(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|xml)$).*)",
  ],
};
