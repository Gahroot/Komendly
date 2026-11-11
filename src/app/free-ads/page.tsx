import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { DeviceCookie } from "@/components/ads/device-cookie";
import { FreeAdsDemo } from "@/components/ads/free-ads-demo";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { StudioUrlForm } from "@/components/studio/studio-url-form";
import "@/components/studio/studio.css";

// Cold-traffic landing page for the Free Ad Pack (Meta ads). Static on purpose: no session read, so it is
// publicly cacheable (next.config.ts headers) and fast. UTM/fbclid first touch is stored by the middleware;
// the CTA sends everyone to signup, which forwards signed-in users straight to /ads/start.
export const metadata: Metadata = {
  title: "Free Ad Pack: 10 Facebook & Instagram ads from your website",
  description: "Paste your website. Get 10 ready-to-run Facebook & Instagram ads plus an animated video ad, free, in minutes. No card, no designer, no prompts.",
  alternates: { canonical: "/free-ads" },
  openGraph: { title: "Free Ad Pack: 10 ads from your website", description: "10 ready-to-run Facebook & Instagram ads + 1 animated ad, free. No card.", url: "/free-ads" },
};

const STACK = [
  { what: "10 on-brand static ads (4:5 feed size)", worth: "Freelancers charge $15-60 per ad" },
  { what: "1 animated video ad", worth: "Motion ads usually cost the most to make" },
  { what: "Copy for every stage of buyer awareness", worth: "Headlines written from your customers' own words" },
  { what: "Your brand kit, pulled from your site", worth: "Logo, colours and fonts, ready for every ad" },
];

const SAMPLES = [
  { src: "/ads/samples/tidybooks-ad-0-4x5.jpg", alt: "Tidybooks ad in 4:5 feed size", w: 1024, h: 1280 },
  { src: "/ads/samples/plausible-ad-1-4x5.jpg", alt: "Plausible ad in 4:5 feed size", w: 1024, h: 1280 },
  { src: "/ads/samples/nightshift-ad-1-4x5.jpg", alt: "Nightshift ad in 4:5 feed size", w: 1024, h: 1280 },
  { src: "/ads/samples/maxteriors-ad-0.jpg", alt: "Maxteriors ad: I want the lights, not another trip up the ladder", w: 900, h: 900 },
  { src: "/ads/samples/yaatuber-ad-6.jpg", alt: "Yaatuber ad: One tiny click. More editing.", w: 900, h: 900 },
  { src: "/ads/samples/maxteriors-ad-8.jpg", alt: "Maxteriors ad: Your Govee lights are finally out of the box.", w: 900, h: 900 },
];

const STEPS = [
  { n: "1", t: "Paste your website", d: "Just the link. No brief, no prompts, no design files." },
  { n: "2", t: "Check what we found", d: "Your audience, offer and customer pains, pulled from your site. Fix anything in one click." },
  { n: "3", t: "Download your ads", d: "Your first ad shows up in about 2 minutes, the rest land while you watch. PNG + MP4." },
];

const FAQ = [
  { q: "Is it really free?", a: "Yes. The Free Ad Pack needs no card. You only pay if you choose a plan afterwards." },
  { q: "Why only one per business?", a: "Each pack runs real image and video generation, so it's one free pack per business, per device and per email." },
  { q: "Can I run the ads on Facebook and Instagram?", a: "Yes. They're made in the 4:5 feed size Meta recommends, and they're yours to use." },
  { q: "What if I upgrade and don't like it?", a: "Paid plans come with a 30-day money-back guarantee on your first payment. Ask and we refund it." },
];

function Cta({ id }: { id: string }) {
  return (
    <div id={id} className="w-full max-w-2xl pt-24 sm:pt-20">
      <StudioUrlForm signedIn={false} cta="Get my free ads" />
      <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {["No card needed", "Ready in minutes", "One free pack per business"].map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-[var(--studio-gold)]" />{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default function FreeAdsPage() {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <DeviceCookie />
      <TrackOnMount event="landing_view" params={{ page: "free_ads" }} />
      <StudioNav signedIn={false} />
      <main>
        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-16 pt-10 text-center sm:px-6 sm:pt-16" aria-labelledby="offer-title">
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">
            The Free Ad Pack · no card
          </p>
          <h1 id="offer-title" className="font-display mt-5 text-balance text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">
            Paste your website. Get 10 ready-to-run Facebook &amp; Instagram ads, free.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Plus an animated video ad. Built from your own site in minutes. No designer, no prompts.
          </p>
          <div className="mt-8 w-full flex justify-center"><Cta id="start" /></div>
          <FreeAdsDemo />
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-labelledby="examples-title">
          <h2 id="examples-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Real ads, made from real websites</h2>
          <p className="mt-2 text-sm text-muted-foreground">Not mockups. Each one came out of a real run, untouched. <Link href="/ad-examples" className="text-[var(--studio-gold)] underline-offset-4 hover:underline">See real ad examples by industry</Link></p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
            {SAMPLES.map((s, i) => (
              <div key={s.src} className="studio-frame rounded-xl p-1.5 sm:p-2">
                <Image src={s.src} alt={s.alt} width={s.w} height={s.h} sizes="(min-width: 768px) 33vw, 50vw" loading={i < 2 ? "eager" : "lazy"} className="h-auto w-full rounded-md" />
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="stack-title">
          <h2 id="stack-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">What&apos;s in your free pack</h2>
          <ul className="mt-6 divide-y divide-border rounded-xl border border-border">
            {STACK.map((s) => (
              <li key={s.what} className="flex items-start gap-3 p-4">
                <Check className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" />
                <div><p className="font-medium">{s.what}</p><p className="text-sm text-muted-foreground">{s.worth}</p></div>
              </li>
            ))}
            <li className="flex items-center justify-between p-4 font-medium"><span>Your price</span><span className="text-[var(--studio-gold)]">$0</span></li>
          </ul>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6" aria-labelledby="how-title">
          <h2 id="how-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">How it works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-xl border border-border p-5">
                <p className="font-mono text-sm text-[var(--studio-gold)]">{s.n}</p>
                <p className="mt-2 font-medium">{s.t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Questions</h2>
          <dl className="mt-6 space-y-5">
            {FAQ.map((f) => (
              <div key={f.q}><dt className="font-medium">{f.q}</dt><dd className="mt-1 text-sm text-muted-foreground">{f.a}</dd></div>
            ))}
          </dl>
          <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-[var(--studio-gold)]" aria-hidden />Free means free: no card, nothing to cancel.</p>
        </section>

        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-24 text-center sm:px-6" aria-labelledby="close-title">
          <h2 id="close-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">See your ads before you spend a cent</h2>
          <div className="mt-6 w-full flex justify-center"><Cta id="start-bottom" /></div>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
