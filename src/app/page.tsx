import type { Metadata } from "next";
import Link from "next/link";
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
          <StudioTeaser />
          <StudioJourney />
          <StudioGallery />
          <StudioClosing />
          <StudioFooter />
        </div>
      </main>
    </StudioRoot>
  );
}

/** "New: Ozzy Studio" banner: one real example render, links to the public Studio page. */
function StudioTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6" aria-labelledby="studio-teaser-title">
      <div className="grid items-center gap-8 rounded-3xl border border-border bg-[oklch(0.18_0.06_295/0.7)] p-6 sm:p-10 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">New · Ozzy Studio</p>
          <h2 id="studio-teaser-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Now Ozzy makes videos too. Just tell him what you want.</h2>
          <p className="max-w-xl text-muted-foreground">Chat with Ozzy to make video ads, motion graphics and logo animations, or send him your footage to cut into an ad with captions. Your first video is free.</p>
          <Link href="/ozzy-studio" className="spellbar__cta inline-flex h-12 items-center justify-center rounded-2xl px-6 font-semibold">Meet Ozzy Studio</Link>
        </div>
        <video className="mx-auto aspect-[9/16] w-40 rounded-2xl border border-border bg-[#0c0820] object-cover sm:w-48" src="/studio-examples/ad43.mp4" poster="/studio-examples/ad43.jpg" muted autoPlay loop playsInline preload="metadata" aria-label="Example hype ad made with Ozzy's motion engine" />
      </div>
    </section>
  );
}
