import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getVariant } from "@/lib/analytics/server-experiments";
import { DeviceCookie } from "@/components/ads/device-cookie";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { fraunces } from "@/components/studio/fonts";
import { StudioClosing } from "@/components/studio/studio-closing";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioGallery } from "@/components/studio/studio-gallery";
import { StudioHero } from "@/components/studio/studio-hero";
import { StudioJourney } from "@/components/studio/studio-journey";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";
import { graph, jsonLdString, softwareApplicationJsonLd } from "@/lib/seo/jsonld";

export const metadata: Metadata = {
  title: { absolute: "Komendly — Your website in, ready-to-run ads out" },
  description: "Paste your website. Ozzy builds 10 on-brand, export-ready ads and an animated ad in minutes. Free, no card required.",
  alternates: { canonical: "/" },
};

const jsonLd = graph(softwareApplicationJsonLd());

export default async function HomePage() {
  const [user, heroVariant] = await Promise.all([getCurrentUser(), getVariant("home_hero")]);
  const signedIn = Boolean(user);
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <DeviceCookie />
      <TrackOnMount event="landing_view" params={{ signed_in: signedIn }} />
      <div className="absolute inset-x-0 top-0 z-20"><StudioNav signedIn={signedIn} /></div>
      <main>
        <StudioHero signedIn={signedIn} variant={heroVariant} />
        <div className="relative bg-[linear-gradient(180deg,#140818,#0c0820_30%)]">
          <StudioJourney />
          <StudioGallery />
          <StudioClosing />
          <StudioFooter />
        </div>
      </main>
    </StudioRoot>
  );
}
