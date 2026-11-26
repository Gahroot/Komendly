import type { Metadata } from "next";
import { TestiStudio } from "@/components/testimonials/testi-studio";
import { HERO_PRICE_LINE, PUBLIC_OFFER } from "@/lib/ads/public-offer";
import { DREAM_HEADLINE } from "@/lib/ads/dream-copy";

const DESC = `Facebook and Instagram ads that run for you, with leads emailed to you within minutes. ${HERO_PRICE_LINE}. Ad spend is paid to Meta separately. Start free with ${PUBLIC_OFFER.freeAds} ads, no card.`;

export const metadata: Metadata = {
  title: `Pricing: ${DREAM_HEADLINE}`,
  description: DESC,
  openGraph: { title: DREAM_HEADLINE, description: DESC, type: "website", url: "https://www.komendly.com/pricing" },
  alternates: { canonical: "/pricing" },
  twitter: { title: DREAM_HEADLINE, description: DESC, card: "summary_large_image" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <TestiStudio>{children}</TestiStudio>;
}
