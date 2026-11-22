import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Komendly — Website to ads",
    short_name: "Komendly",
    description:
      "Paste your website and get ready-to-run static and animated ads. Start with 10 free ads, no card needed.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#0c0820",
    background_color: "#0c0820",
    categories: ["business", "productivity"],
    screenshots: [{ src: "/opengraph-image", sizes: "1200x630", type: "image/png", form_factor: "wide" }],
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Make ads",
        short_name: "Ads",
        description: "Turn your website into ready-to-run ads",
        url: "/ads/app",
        icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
