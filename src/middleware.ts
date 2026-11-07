import { NextRequest, NextResponse } from "next/server";
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
  if (!isNew && serialized === before) return NextResponse.next();
  request.cookies.set(ANON_ID_COOKIE, anonId);
  request.cookies.set(EXP_COOKIE, serialized);
  const res = NextResponse.next({ request: { headers: request.headers } });
  const opts = { path: "/", maxAge: EXP_COOKIE_MAX_AGE, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
  res.cookies.set(ANON_ID_COOKIE, anonId, { ...opts, httpOnly: true });
  res.cookies.set(EXP_COOKIE, serialized, opts);
  return res;
}

// Routes that don't require authentication
const publicRoutes = ["/", "/testimonials", "/login", "/register", "/pricing"];

// Routes that start with these prefixes are public
const publicPrefixes = [
  "/api/auth/",
  "/api/stripe/webhooks",  // Stripe webhooks must be public
  "/api/stripe/checkout",  // Checkout API for unauthenticated users
  "/checkout/",            // Checkout pages
  "/api/ads/auth/",        // Website2ads sign-up / login
  "/api/ads/device",       // First-party device cookie (pre-auth abuse fingerprint)
  "/api/ads-billing/webhook", // Stripe webhook for ads billing (signature-verified)
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
