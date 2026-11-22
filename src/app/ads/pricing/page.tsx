import type { Metadata } from "next";
import { PricingBeacon } from "@/components/analytics/pricing-beacon";
import { AdsNav } from "@/components/ads/ads-nav";
import { OzzyPricing, TestimonialPackLinks } from "@/components/billing/ozzy-pricing";
import { StudioFooter } from "@/components/studio/studio-footer";
import { getCurrentUser } from "@/lib/auth";
import { planCheckoutPath } from "@/lib/ads/plan-checkout";
import { foundingSpotsLeft } from "@/lib/ads/founding-spots";
import { prisma } from "@/lib/prisma";
import { HERO_HEADLINE, HERO_OUTCOME, HERO_PRICE_LINE, PUBLIC_OFFER } from "@/lib/ads/public-offer";

export const metadata: Metadata = {
  title: `Pricing: ${HERO_HEADLINE}`,
  description: `${HERO_HEADLINE}. ${HERO_OUTCOME} ${HERO_PRICE_LINE}. Ad spend is paid to Meta separately. Start free with ${PUBLIC_OFFER.freeAds} ads, no card.`,
  alternates: { canonical: "/pricing" },
};

/** Ozzy pricing (same as /pricing). Buying happens on /ads/billing (signed in); signed-out visitors sign up first. */
export default async function AdsPricingPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const yearly = (await searchParams).billing === "year";
  const [user, spotsLeft] = await Promise.all([getCurrentUser(), foundingSpotsLeft(prisma).catch(() => null)]);
  const signedIn = Boolean(user);
  const billingPath = yearly ? "/ads/billing?billing=year" : "/ads/billing";
  return (
    <div className="min-h-screen">
      <AdsNav signedIn={signedIn} />
      <PricingBeacon page="/ads/pricing" />
      <OzzyPricing
        yearly={yearly}
        basePath="/ads/pricing"
        planHref={(plan, y = yearly) => {
          const path = plan ? planCheckoutPath(plan, y) : billingPath;
          return signedIn ? path : `/ads/signup?next=${encodeURIComponent(path)}`;
        }}
        freeHref={signedIn ? "/studio" : "/ads/signup?next=%2Fstudio"}
        spotsLeft={spotsLeft}
        testimonialActions={<TestimonialPackLinks signedIn={signedIn} />}
      />
      <StudioFooter />
    </div>
  );
}
