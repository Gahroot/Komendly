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
        source: "/((?!api|ads|admin|dashboard|checkout|login|register|ozzy-lab|_next).+)",
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
        source: "/:area(api|ads|admin|dashboard|checkout)/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store",
          },
        ],
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
