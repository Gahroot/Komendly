import Link from "next/link";
import { Clock3, Download, MessageSquareQuote, ShieldCheck, UserRound, Video } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionHeading } from "@/components/section-heading";
import { ExampleShowcase, HeroExample } from "@/components/testimonials/example-showcase";
import { HERO_EXAMPLE } from "@/components/testimonials/example-videos";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { StudioPose } from "@/components/studio/studio-pose";
import { ReviewDraftForm } from "@/components/testimonials/review-draft-form";
import { StickyMobileCta } from "@/components/testimonials/sticky-mobile-cta";
import { OfferSectionCta } from "@/components/testimonials/offer-section-cta";
import { PlansUpsell } from "@/components/testimonials/plans-upsell";
import { TESTIMONIAL_FAQ } from "@/components/testimonials/faq-data";
import { FIRST_VIDEO_OFFER, formatUsd, GUARANTEE, perVideoUsd, UGC_CREATOR_RATE_USD, videosLabel } from "@/lib/first-video-offer";

// Real videos made with Komendly (Vimeo).

const STEPS = [
  { icon: MessageSquareQuote, title: "Paste a review", text: "Any review a real customer wrote. No new asks, no awkward emails." },
  { icon: UserRound, title: "Pick who says it", text: "Choose an AI presenter and a length: 30 or 60 seconds." },
  { icon: Download, title: "Download and post", text: "A vertical MP4 for Reels, TikTok, Shorts or your site." },
];

const PROOF = [
  { icon: Video, title: "Real examples above", text: "Every video on this page was made with Komendly from a written review." },
  { icon: Clock3, title: "Minutes, not weeks", text: `Typical creator rates are $${UGC_CREATOR_RATE_USD.low}–${UGC_CREATOR_RATE_USD.high} per testimonial video and a week or two of back-and-forth. No filming day, no editor here.` },
  { icon: ShieldCheck, title: "Looks real or it's free", text: GUARANTEE },
];

export default function TestimonialsPage() {
  return (
    <div className="min-h-screen pb-24 text-foreground sm:pb-0">
      <TrackOnMount event="landing_view" params={{ product: "testimonials" }} />
      <SiteHeader />

      {/* Hero: real example video + the review form (starts without signup) */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:pt-12">
        <div className="studio-rise space-y-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--studio-gold)]">AI video testimonials</p>
          <h1 className="font-display text-4xl font-medium leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-6xl">
            Turn 5-star reviews into videos that <em className="text-[var(--studio-gold)]">sell</em>.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Paste a review a customer already wrote. A realistic presenter says it on camera, ready for Reels, TikTok and your site. No creators to brief, no filming day.
          </p>
          <div className="flex items-start gap-4 lg:hidden">
            <HeroVideo className="w-40 shrink-0" />
            <ul className="space-y-2 pt-2 text-sm text-muted-foreground">
              <li>Made from a real review</li>
              <li>9:16, ready for Reels</li>
              <li>Tap the video for sound</li>
            </ul>
          </div>
          <div id="start" className="scroll-mt-24 pt-24">
            <ReviewDraftForm />
          </div>
        </div>
        <div className="relative hidden justify-center lg:flex">
          <div className="absolute -top-[86px] left-1/2 -translate-x-1/2"><StudioPose form="classic" expression="happy" motion="idle" size={96} /></div>
          <HeroVideo className="w-[320px]" />
        </div>
      </section>

      {/* Examples */}
      <section id="examples" className="scroll-mt-20 py-14" aria-labelledby="examples-title">
        <SectionHeading id="examples-title" eyebrow="Examples" title="Made from reviews like yours" description="Tap any video for sound." className="px-4" />
        <div className="mt-8"><ExampleShowcase /></div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="how-title">
        <SectionHeading id="how-title" eyebrow="How it works" title="Three steps, a few minutes" />
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="pixel-frame bg-[oklch(0.2_0.07_295/0.62)] p-6">
              <p className="font-mono text-xs text-[var(--studio-gold)]">0{i + 1}</p>
              <s.icon aria-hidden className="mt-3 size-6 text-[var(--studio-gold)]" />
              <h3 className="font-display mt-3 text-xl font-medium">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Offer + value */}
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6" aria-labelledby="offer-title">
        <SectionHeading id="offer-title" eyebrow={`The ${FIRST_VIDEO_OFFER.name}`} title={`${videosLabel(FIRST_VIDEO_OFFER.minutes)}. ${formatUsd(FIRST_VIDEO_OFFER.priceCents)}, once.`} description={`That's ${perVideoUsd(FIRST_VIDEO_OFFER.priceCents, FIRST_VIDEO_OFFER.minutes)} a video, against typical creator rates of $${UGC_CREATOR_RATE_USD.low}–${UGC_CREATOR_RATE_USD.high}. No subscription, no auto-renew.`} />
        <div className="mt-10"><OfferSectionCta /></div>
        <TrackOnMount event="offer_view" params={{ product: "testimonials", placement: "landing" }} onceKey="testi_offer_view_landing" />
      </section>

      {/* Why it's safe to try */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="proof-title">
        <SectionHeading id="proof-title" eyebrow="Why try it" title="Proof, speed, and a promise" />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PROOF.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.5)] p-6">
              <p.icon aria-hidden className="size-6 text-[var(--studio-gold)]" />
              <h3 className="font-display mt-3 text-lg font-medium">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Plans upsell */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="plans-title">
        <SectionHeading id="plans-title" eyebrow="Making lots?" title="Monthly plans" description="For a steady stream of videos. Cancel any time." />
        <div className="mt-8"><PlansUpsell /></div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6" aria-labelledby="faq-title">
        <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.5)]">
          {TESTIMONIAL_FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="text-[var(--studio-gold)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing */}
      <section className="mx-auto max-w-6xl px-4 pb-6 pt-8 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-[linear-gradient(160deg,#24124a,#160b2c_60%,#2a1020)] p-8 sm:p-12">
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl space-y-3">
              <h2 className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Your reviews are already written.</h2>
              <p className="text-muted-foreground">Give the best one a face and a voice today.</p>
            </div>
            <div className="flex items-end gap-3">
              <div className="-mb-2 hidden md:block"><StudioPose form="ascended" expression="happy" size={104} /></div>
              <Link href="#start" className="spellbar__cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-2xl px-6 font-semibold">Turn my review into a video</Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyMobileCta targetId="start" />
    </div>
  );
}

function HeroVideo({ className = "" }: { className?: string }) {
  return (
    <figure className={`pixel-frame studio-frame p-2 ${className}`}>
      <div className="pixel-frame aspect-[9/16] overflow-hidden bg-[var(--studio-ink)]">
        <HeroExample slug={HERO_EXAMPLE.slug} title="Example: a customer review turned into an AI video testimonial" />
      </div>
      <figcaption className="sr-only">An example video made with Komendly from a written customer review.</figcaption>
    </figure>
  );
}
