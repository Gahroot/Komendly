// The ONE Ozzy pricing page (Ad Packs + Ozzy Studio + Testimonials). Public and CDN-cached: no session reads on the
// server; per-user parts (grandfathered plan notice, Launch Kit claim after registration) are client components.
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { PricingBeacon } from "@/components/analytics/pricing-beacon";
import { OzzyPricing } from "@/components/billing/ozzy-pricing";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PriceSurvey } from "@/components/testimonials/price-survey";
import { LaunchKitActions, LegacyPlanNotice } from "./_components/pricing-client";

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const yearly = (await searchParams).billing === "year";
  const billingPath = yearly ? "/ads/billing?billing=year" : "/ads/billing";
  return (
    <div className="min-h-screen text-foreground">
      <SiteHeader />
      <PricingBeacon page="/pricing" />
      <OzzyPricing
        yearly={yearly}
        basePath="/pricing"
        planHref={billingPath}
        freeHref="/ads/signup?next=%2Fstudio"
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
