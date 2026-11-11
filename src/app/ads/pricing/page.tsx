import type { Metadata } from "next";
import { AdsNav } from "@/components/ads/ads-nav";
import { OzzyPricing, TestimonialPackLinks } from "@/components/billing/ozzy-pricing";
import { StudioFooter } from "@/components/studio/studio-footer";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Pricing",
  description: "One Ozzy plan for Ad Packs, Ozzy Studio and AI testimonials. Start free, plans from $49/month, yearly billing with 2 months free.",
  alternates: { canonical: "/pricing" },
};

/** Ozzy pricing (same as /pricing). Buying happens on /ads/billing (signed in); signed-out visitors sign up first. */
export default async function AdsPricingPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const yearly = (await searchParams).billing === "year";
  const signedIn = Boolean(await getCurrentUser());
  const billingPath = yearly ? "/ads/billing?billing=year" : "/ads/billing";
  return (
    <div className="min-h-screen">
      <AdsNav signedIn={signedIn} />
      <OzzyPricing
        yearly={yearly}
        basePath="/ads/pricing"
        planHref={signedIn ? billingPath : `/ads/signup?next=${encodeURIComponent(billingPath)}`}
        freeHref={signedIn ? "/studio" : "/ads/signup?next=%2Fstudio"}
        testimonialActions={<TestimonialPackLinks signedIn={signedIn} />}
      />
      <StudioFooter />
    </div>
  );
}
