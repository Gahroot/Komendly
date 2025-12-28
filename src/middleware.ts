import { NextRequest, NextResponse } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/", "/login", "/register", "/pricing"];

// Routes that start with these prefixes are public
const publicPrefixes = [
  "/api/auth/",
  "/api/stripe/webhooks",  // Stripe webhooks must be public
  "/api/stripe/checkout",  // Checkout API for unauthenticated users
  "/checkout/",            // Checkout pages
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
    return NextResponse.next();
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

  return NextResponse.next();
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
