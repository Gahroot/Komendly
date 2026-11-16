import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check, ExternalLink, Quote, ShieldCheck } from "lucide-react";
import { DeviceCookie } from "@/components/ads/device-cookie";
import { FreeAdsDemo } from "@/components/ads/free-ads-demo";
import { FreeAdsUrlForm } from "@/components/ads/free-ads-url-form";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

// Cold-traffic landing page for the Free Ad Pack (Meta ads). Static on purpose: no session read, so it is
// publicly cacheable (next.config.ts headers) and fast. UTM/fbclid first touch is stored by the middleware;
// the CTA sends everyone to signup, which forwards signed-in users straight to /ads/start.
// Buyers are mostly owners aged 35-64 on phones in the Facebook app: big type, real proof up top, one field.
export const metadata: Metadata = {
  title: "Free Ad Pack: 10 Facebook & Instagram ads from your website",
  description: "Paste your website. Get 10 ready-to-run Facebook & Instagram ads plus an animated video ad, free, in minutes. No card, no designer, no prompts.",
  alternates: { canonical: "/free-ads" },
  openGraph: { title: "Free Ad Pack: 10 ads from your website", description: "10 ready-to-run Facebook & Instagram ads + 1 animated ad, free. No card.", url: "/free-ads" },
};

// Verbatim from Trustpilot (shared with Max's OK).
const MAX = {
  quote: "The service Nolan provided helped me save a ton of time making 300 versions of content for my meta ads. His delivery was fast and straight forward!",
  name: "Max",
  business: "Maxteriors Exterior Lighting",
  photo: "/testimonials/max-maxteriors.jpg" as string | null,
  source: "https://www.trustpilot.com/review/prestyj.com",
};

const STACK = [
  { what: "10 ready-to-post ads (Facebook & Instagram feed size)", worth: "Freelancers charge $15-60 per ad" },
  { what: "1 animated video ad", worth: "Video ads usually cost the most to make" },
  { what: "The words for every ad, written for your customers", worth: "Headlines and text pulled from your own website" },
  { what: "Your logo and colours, taken from your site", worth: "Every ad looks like your business, not a template" },
];

// Local and service businesses only: that's who clicks our ads. Only ads showing Max's real lighting jobs (ad-4's stock house photo was dropped).
const SAMPLES = [
  { src: "/ads/samples/maxteriors-ad-0.jpg", alt: "Maxteriors ad: I want the lights, not another trip up the ladder", w: 900, h: 900 },
  { src: "/ads/samples/maxteriors-ad-8.jpg", alt: "Maxteriors ad: Your Govee lights are finally out of the box", w: 900, h: 900 },
];

const STEPS = [
  { n: "1", t: "Paste your website", d: "Just the address. Nothing to fill in, no design files." },
  { n: "2", t: "Check what we found", d: "Your customers, your offer and what they care about, taken from your site. Fix anything in one click." },
  { n: "3", t: "Download your ads", d: "Your first ad shows up in about 2 minutes. We also email you when they're all ready." },
];

const FAQ = [
  { q: "Is it really free?", a: "Yes. The Free Ad Pack needs no card. You only pay if you choose a plan afterwards." },
  { q: "Do I need to be good with computers?", a: "No. If you can type your website address, you can do this. We do the design and the writing." },
  { q: "Why only one per business?", a: "Each pack runs real image and video generation, so it's one free pack per business, per device and per email." },
  { q: "Can I run the ads on Facebook and Instagram?", a: "Yes. They're made in the feed size Meta recommends, and they're yours to use." },
  { q: "What if I upgrade and don't like it?", a: "Paid plans come with a 30-day money-back guarantee on your first payment. Ask and we refund it." },
];

const TRUST = ["No card needed", "Ready in minutes", "One free pack per business"];

function Cta({ id }: { id: string }) {
  return (
    <div className="w-full max-w-2xl">
      <FreeAdsUrlForm id={id} />
      <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-base text-foreground/90">
        {TRUST.map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5"><Check aria-hidden className="size-4 text-[var(--studio-gold)]" />{t}</li>
        ))}
      </ul>
    </div>
  );
}

function MaxQuote() {
  return (
    <figure className="flex w-full max-w-2xl flex-col-reverse rounded-2xl border border-border bg-white/[0.04] p-4 text-left sm:p-6">
      <blockquote className="mt-3 text-[17px] leading-snug text-foreground sm:text-xl sm:leading-relaxed">
        <Quote aria-hidden className="mr-1 inline size-5 -translate-y-0.5 text-[var(--studio-gold)]" />{MAX.quote}
      </blockquote>
      <figcaption className="flex items-center gap-3">
        {MAX.photo ? (
          <Image src={MAX.photo} alt={`${MAX.name}, ${MAX.business}`} width={48} height={48} priority className="size-12 rounded-full object-cover" />
        ) : (
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--studio-gold)] font-display text-2xl font-semibold text-[#2a0f10]">{MAX.name[0]}</span>
        )}
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">{MAX.name}, owner of {MAX.business}</p>
          <a href={MAX.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-base text-[var(--studio-gold)] underline-offset-4 hover:underline">
            Read his review on Trustpilot <ExternalLink aria-hidden className="size-4" />
          </a>
        </div>
      </figcaption>
    </figure>
  );
}

export default function FreeAdsPage() {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <DeviceCookie />
      <TrackOnMount event="landing_view" params={{ page: "free_ads" }} />
      <StudioNav signedIn={false} />
      <main>
        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-16 pt-3 text-center sm:px-6 sm:pt-14" aria-labelledby="offer-title">
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.1em] text-[var(--studio-gold)]">
            Free Ad Pack · no card needed
          </p>
          <h1 id="offer-title" className="font-display mt-3 text-balance text-[2.4rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-6xl">
            Paste your website. Get 10 ready-to-run Facebook &amp; Instagram ads, free.
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-lg text-foreground/90 sm:text-xl">
            Plus a video ad. Made from your own website in minutes. No designer needed.
          </p>
          <div id="start" className="mt-5 flex w-full justify-center"><Cta id="hero" /></div>
          <div className="mt-4 flex w-full justify-center sm:mt-8"><MaxQuote /></div>
          <FreeAdsDemo />
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="examples-title">
          <h2 id="examples-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Max&apos;s ads, made from his website</h2>
          <p className="mt-2 text-lg text-foreground/90">{MAX.business} installs outdoor lighting. These came straight out of Komendly, untouched.</p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            {SAMPLES.map((s) => (
              <div key={s.src} className="studio-frame rounded-xl p-1.5 sm:p-2">
                <Image src={s.src} alt={s.alt} width={s.w} height={s.h} sizes="(min-width: 640px) 360px, 100vw" loading="lazy" className="h-auto w-full rounded-md" />
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="stack-title">
          <h2 id="stack-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">What&apos;s in your free pack</h2>
          <ul className="mt-6 divide-y divide-border rounded-xl border border-border">
            {STACK.map((s) => (
              <li key={s.what} className="flex items-start gap-3 p-4">
                <Check aria-hidden className="mt-1 size-5 shrink-0 text-[var(--studio-gold)]" />
                <div><p className="text-lg font-medium">{s.what}</p><p className="text-base text-foreground/80">{s.worth}</p></div>
              </li>
            ))}
            <li className="flex items-center justify-between p-4 text-lg font-semibold"><span>Your price</span><span className="text-[var(--studio-gold)]">$0</span></li>
          </ul>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6" aria-labelledby="how-title">
          <h2 id="how-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">How it works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-xl border border-border p-5">
                <p className="grid size-9 place-items-center rounded-full bg-[var(--studio-gold)] text-lg font-bold text-[#2a0f10]">{s.n}</p>
                <p className="mt-3 text-lg font-semibold">{s.t}</p>
                <p className="mt-1 text-base text-foreground/80">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Questions</h2>
          <dl className="mt-6 space-y-6">
            {FAQ.map((f) => (
              <div key={f.q}><dt className="text-lg font-semibold">{f.q}</dt><dd className="mt-1 text-base text-foreground/80">{f.a}</dd></div>
            ))}
          </dl>
          <p className="mt-8 flex items-center gap-2 text-base text-foreground/90"><ShieldCheck className="size-5 shrink-0 text-[var(--studio-gold)]" aria-hidden />Free means free: no card, nothing to cancel.</p>
        </section>

        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-24 text-center sm:px-6" aria-labelledby="close-title">
          <h2 id="close-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">See your ads before you spend a cent</h2>
          <div id="start-bottom" className="mt-6 flex w-full justify-center"><Cta id="bottom" /></div>
          <p className="mt-6 text-base text-foreground/80">Questions? See <Link href="/ad-examples" className="text-[var(--studio-gold)] underline-offset-4 hover:underline">more ad examples</Link> or our <Link href="/pricing" className="text-[var(--studio-gold)] underline-offset-4 hover:underline">plans</Link>.</p>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
