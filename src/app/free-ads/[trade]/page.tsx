import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { TemplateAdCard } from "@/components/ad-examples/playbook-parts";
import { DeviceCookie } from "@/components/ads/device-cookie";
import { FreeAdsUrlForm } from "@/components/ads/free-ads-url-form";
import { TradeCookie } from "@/components/ads/trade-cookie";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";
import { UNLOCK_PACK } from "@/lib/ads/billing-config";
import { FREE_TRIAL_ADS } from "@/lib/ads/bonus-access";
import { GENERATED_TRADE_SLUGS } from "@/lib/growth/free-ads-trades";
import { tradeHero } from "@/lib/growth/free-ads-trade-hero";
import { tradePage } from "@/lib/growth/trade-playbooks";

// Generated trade landing pages for the Free Ad Pack (/free-ads/plumbers, /hvac, ...). Same pack, form and no-card terms
// as /free-ads; only the words and examples change. /free-ads/roofers keeps its own hand-written page (static segments
// win over this dynamic one). Static: only the listed trades exist, anything else is a 404.
export const dynamicParams = false;
export function generateStaticParams() {
  return GENERATED_TRADE_SLUGS.map((trade) => ({ trade }));
}

export async function generateMetadata({ params }: { params: Promise<{ trade: string }> }): Promise<Metadata> {
  const hero = tradeHero((await params).trade);
  if (!hero) return {};
  const path = `/free-ads/${hero.trade.slug}`;
  return {
    title: `Free Facebook ads for ${hero.trade.who}: ${FREE_TRIAL_ADS} ads from your website`,
    description: `Paste your website and get ${FREE_TRIAL_ADS} Facebook ads made for your business in a few minutes. For ${hero.trade.who}. Free, no card.`,
    alternates: { canonical: path },
    openGraph: { title: hero.trade.headline, description: `${FREE_TRIAL_ADS} Facebook ads made from your website. Free, no card.`, url: path },
  };
}

const STEPS = [
  { n: "1", t: "Paste your website", d: "Just the address. Nothing to fill in, no design files." },
  { n: "2", t: "Check what we found", d: "Your services, your area and what customers care about, taken from your site. Fix anything in one click." },
  { n: "3", t: "Download your ads", d: "Your first ad shows up in about 2 minutes. We also email you when they're all ready." },
];
const TRUST = ["No card needed", "Ready in minutes", "One free pack per business"];

export default async function FreeAdsTradePage({ params }: { params: Promise<{ trade: string }> }) {
  const slug = (await params).trade;
  const hero = tradeHero(slug);
  if (!hero || !GENERATED_TRADE_SLUGS.includes(slug)) notFound();
  const { trade } = hero;
  const examples = tradePage(slug)?.examples ?? [];
  const cta = `Get my ${FREE_TRIAL_ADS} free ads`;
  const faq = [
    { q: "Is it really free?", a: `Yes. Your ${FREE_TRIAL_ADS} free ads need no card. You only pay if you want the rest of the pack ($${UNLOCK_PACK.priceCents / 100} once) or a plan.` },
    { q: "I'm not good with computers. Can I do this?", a: "If you can type your website address, you can do this. We do the design and the writing." },
    { q: "Where can I run the ads?", a: "On Facebook and Instagram, or anywhere you advertise. They're made in the feed size, and they're yours to use." },
  ];
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <DeviceCookie />
      <TradeCookie trade={slug} />
      <TrackOnMount event="landing_view" params={{ page: "free_ads_trade", trade: slug }} />
      <StudioNav signedIn={false} minimal />
      <main>
        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-14 pt-3 text-center sm:px-6 sm:pt-14" aria-labelledby="offer-title">
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.1em] text-[var(--studio-gold)]">For {trade.who}</p>
          <h1 id="offer-title" className="font-display mt-3 text-balance text-[2.4rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-6xl">{trade.headline}</h1>
          <p className="mt-3 max-w-xl text-pretty text-lg text-foreground/90 sm:text-xl">
            Paste your website. Get {FREE_TRIAL_ADS} ready-to-run ads for {hero.services.join(", ")} and more, in a few minutes. Free, no card.
          </p>
          <div id="start" className="mt-5 flex w-full justify-center">
            <div className="w-full max-w-2xl">
              <FreeAdsUrlForm id="hero" cta={cta} trade={slug} />
              <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-base text-foreground/90">
                {TRUST.map((t) => (<li key={t} className="inline-flex items-center gap-1.5"><Check aria-hidden className="size-4 text-[var(--studio-gold)]" />{t}</li>))}
              </ul>
            </div>
          </div>
        </section>
        {examples.length > 0 && (
          <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6" aria-labelledby="examples-title">
            <h2 id="examples-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">The kind of ads Ozzy writes for {trade.who}</h2>
            <p className="mt-2 text-lg text-foreground/90">These are templates, not real companies. Yours are made from your own website: your name, your services, your town.</p>
            <ul className="mt-6 grid gap-4 md:grid-cols-3">{examples.map((a) => <TemplateAdCard key={a.business} ad={a} />)}</ul>
          </section>
        )}
        <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6" aria-labelledby="how-title">
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
        <section className="mx-auto max-w-3xl px-4 pb-14 sm:px-6" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Questions</h2>
          <dl className="mt-6 space-y-6">{faq.map((f) => (<div key={f.q}><dt className="text-lg font-semibold">{f.q}</dt><dd className="mt-1 text-base text-foreground/80">{f.a}</dd></div>))}</dl>
        </section>
        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-24 text-center sm:px-6" aria-labelledby="close-title">
          <h2 id="close-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">See your ads before you spend a cent</h2>
          <div id="start-bottom" className="mt-6 w-full max-w-2xl"><FreeAdsUrlForm id="bottom" cta={cta} trade={slug} /></div>
          <p className="mt-4 text-base text-foreground/80">See more <Link href={`/ad-examples/${slug}`} className="text-[var(--studio-gold)] underline-offset-4 hover:underline">ad examples</Link> or our <Link href="/pricing" className="text-[var(--studio-gold)] underline-offset-4 hover:underline">plans</Link>.</p>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
