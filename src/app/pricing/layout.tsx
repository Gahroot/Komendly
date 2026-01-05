import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing - Plans for Every Team | Komendly",
  description:
    "Choose the perfect plan for your team. Start free with 1 video per month, or upgrade to Pro/Business for unlimited video generation. Transparent pricing, no hidden fees.",
  openGraph: {
    title: "Pricing - Plans for Every Team | Komendly",
    description:
      "Choose the perfect plan for your team. Start free with 1 video per month, or upgrade to Pro/Business for unlimited video generation.",
    type: "website",
    url: "https://komendly.com/pricing",
  },
  twitter: {
    title: "Pricing - Plans for Every Team | Komendly",
    description:
      "Choose the perfect plan for your team. Start free with 1 video per month, or upgrade to Pro/Business.",
    card: "summary_large_image",
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
