import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    // Optimize image delivery
    formats: ["image/avif", "image/webp"],
    // Responsive image sizes
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Compression and performance
  compress: true,
  // Optimize for production builds
  productionBrowserSourceMaps: false,
  // Enable SWR cache for API routes
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  // OG images read the vendored Fraunces font and Ozzy PNGs from disk at render time.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./src/lib/og/fonts/**", "./public/brand/**"],
    "/twitter-image": ["./src/lib/og/fonts/**", "./public/brand/**"],
    "/blog/[slug]/opengraph-image": ["./src/lib/og/fonts/**", "./public/brand/**"],
    "/gift/[token]/opengraph-image": ["./src/lib/og/fonts/**", "./public/brand/**"],
    "/api/ads/gift-public/[token]/preview": ["./src/lib/og/fonts/**", "./public/brand/**"],
    "/s/[token]/opengraph-image": ["./src/lib/og/fonts/**", "./public/brand/**"],
    "/ozzy-studio/opengraph-image": ["./src/lib/og/fonts/**", "./public/brand/**"],
  },
  // The Ads studio is the homepage; /ads (exact) is kept as a permanent alias. /ads/* routes and assets are untouched.
  async redirects() {
    return [{ source: "/ads", destination: "/", permanent: true }];
  },
  // Headers for performance and security
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
      {
        // Public marketing pages only: never cache API, account or admin responses
        source: "/((?!api|ads|admin|dashboard|checkout|oauth|\\.well-known|login|register|ozzy-lab|verify-email|test-video|r/|g/|u/|gift/|partners/apply|studio|s/|_next).+)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // The Ads home is personalised (session + A/B variant): never shared-cache it
        source: "/",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/:area(api|ads|admin|dashboard|checkout|studio|oauth|.well-known)/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store",
          },
        ],
      },
      {
        // Signed ad thumbnails in emails: long-lived and public (must come after the /api no-store rule to override it)
        source: "/api/ads/email-img/:token",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000, immutable" }],
      },
      {
        // Gift pack ad images (token-checked, immutable once ready)
        source: "/api/ads/gift-public/:token/img/:asset",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, immutable" }],
      },
      {
        // Ad of the week images (featured ads only): public, a day fresh
        source: "/api/ad-of-the-week/:adId",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
      {
        // Referral share links set the kmd_ref cookie: never cache
        source: "/r/:code",
        headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Public gift pages: per-token, short shared cache (status changes while Ozzy is still drawing)
        source: "/gift/:token*",
        headers: [{ key: "Cache-Control", value: "public, max-age=30, s-maxage=60, stale-while-revalidate=300" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Public Ozzy Studio share pages: briefly cacheable (the presigned media URLs inside live ~10 min).
        source: "/s/:token*",
        headers: [{ key: "Cache-Control", value: "public, max-age=30, s-maxage=120, stale-while-revalidate=240" }, { key: "X-Robots-Tag", value: "noindex, follow" }],
      },
      {
        // Private/transactional pages: never indexed, even if linked (robots.txt also disallows the private ones)
        source: "/:area(admin|dashboard|checkout|studio|test-video|ozzy-lab|verify-email|login|register)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/:area(admin|dashboard|checkout|studio|test-video|ozzy-lab|verify-email|login|register)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/ads/:area(app|billing|brands|runs|start|login|signup|refer|gifts|partner|coach)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/ads/:area(app|billing|brands|runs|start|login|signup|refer|gifts|partner|coach)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*.{js,css,woff2}",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
