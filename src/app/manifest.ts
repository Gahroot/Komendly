import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Komendly - AI Video Testimonials",
    short_name: "Komendly",
    description:
      "Turn your 5-star Google reviews into professional video testimonials with AI avatars. No filming, no begging customers, no actors needed.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#000000",
    background_color: "#000000",
    categories: ["business", "productivity"],
    screenshots: [
      {
        src: "/og-image.png",
        sizes: "1200x630",
        type: "image/png",
        form_factor: "wide",
      },
    ],
    icons: [
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Create Video",
        short_name: "Create",
        description: "Create a new video testimonial",
        url: "/dashboard/create",
        icons: [{ src: "/logo.svg", sizes: "192x192", type: "image/svg+xml" }],
      },
      {
        name: "View Videos",
        short_name: "Videos",
        description: "View your video testimonials",
        url: "/dashboard/videos",
        icons: [{ src: "/logo.svg", sizes: "192x192", type: "image/svg+xml" }],
      },
    ],
  };
}
