import type { Metadata } from "next";
import { TestiStudio } from "@/components/testimonials/testi-studio";
import { HERO_HEADLINE, HERO_OUTCOME, HERO_PRICE_LINE, PUBLIC_OFFER } from "@/lib/ads/public-offer";

const DESC = `${HERO_OUTCOME} ${HERO_PRICE_LINE}. Ad spend is paid to Meta separately. Start free with ${PUBLIC_OFFER.freeAds} ads, no card.`;

export const metadata: Metadata = {
  title: `Pricing: ${HERO_HEADLINE}`,
  description: DESC,
  openGraph: { title: `${HERO_HEADLINE} | Komendly`, description: DESC, type: "website", url: "https://www.komendly.com/pricing" },
  alternates: { canonical: "/pricing" },
  twitter: { title: `${HERO_HEADLINE} | Komendly`, description: DESC, card: "summary_large_image" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <TestiStudio>{children}</TestiStudio>;
}
