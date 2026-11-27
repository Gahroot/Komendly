// The ONE Ozzy pricing page: leads with "Hire Ozzy's AI Marketing Team" (Growth Autopilot), then Ad Department (DIY), Starter/Agency, Studio and Testimonials. Public and CDN-cached: no session reads on the
// server; per-user parts (grandfathered plan notice, Launch Kit claim after registration) are client components.
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { BfcmBanner } from "@/components/ads/bfcm-offer";
import { BFCM_ENDS_AT, bfcmPricingLine, isBfcmActive } from "@/lib/ads/bfcm";
import { PricingBeacon } from "@/components/analytics/pricing-beacon";
import { OzzyPricing } from "@/components/billing/ozzy-pricing";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PriceSurvey } from "@/components/testimonials/price-survey";
import { planCheckoutPath } from "@/lib/ads/plan-checkout";
import { foundingSpotsLeft } from "@/lib/ads/founding-spots";
import { prisma } from "@/lib/prisma";
import { LaunchKitActions, LegacyPlanNotice } from "./_components/pricing-client";

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const yearly = (await searchParams).billing === "year";
  // Founding spots (not per user): a DB count; checkout enforces the real limit if a cached page is stale.
  const spotsLeft = await foundingSpotsLeft(prisma).catch(() => null);
  const billingPath = yearly ? "/ads/billing?billing=year" : "/ads/billing";
  return (
    <div className="min-h-screen text-foreground">
      <SiteHeader />
      <PricingBeacon page="/pricing" />
      {/* CDN-cached page: the strip hides itself at the deadline; the checkout enforces it. */}
      {isBfcmActive() && <div className="px-4"><BfcmBanner endsAt={BFCM_ENDS_AT.toISOString()} serverNow={new Date().toISOString()} text={bfcmPricingLine()} href="/ads/bfcm" cta="See the Black Friday prices" /></div>}
      <OzzyPricing
        yearly={yearly}
        basePath="/pricing"
        planHref={(plan, y = yearly) => (plan ? planCheckoutPath(plan, y) : billingPath)}
        freeHref="/ads/signup?next=%2Fstudio"
        spotsLeft={spotsLeft}
        notice={<Suspense fallback={null}><LegacyPlanNotice /></Suspense>}
        testimonialActions={<Suspense fallback={null}><LaunchKitActions /></Suspense>}
      />
      <p className="-mt-16 mb-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck aria-hidden className="size-4" /> Secure payment by Stripe. We never store your card.
      </p>
      <SiteFooter />
      <PriceSurvey placement="pricing" trigger="visitor" />
    </div>
  );
}
