import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check, ExternalLink, Quote, ShieldCheck } from "lucide-react";
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
import { AUTOPILOT_FIRST_MONTH_LINE, AUTOPILOT_GUARANTEE_LINE, AUTOPILOT_LAUNCH_NOTE } from "@/lib/ads/public-offer";
import { FREE_TRIAL_ADS } from "@/lib/ads/bonus-access";
import { autopilotOfferCopy } from "@/lib/ads/roofer-offer";
import { ROOFERS } from "@/lib/ads/trade";
import { ADLIB_REPORT_PATH, type AdlibReport } from "@/lib/growth/adlib-report";
import adlibSnapshot from "@/lib/growth/adlib-report-data.json";
import { tradePage } from "@/lib/growth/trade-playbooks";

// Roofer landing page for the Free Ad Pack (Meta ads aimed at roofing company owners). Same pack, same form and the
// same no-card terms as /free-ads; only the words and examples change. Static on purpose (publicly cacheable via the
// next.config.ts marketing-pages rule). TradeCookie tags the visitor so sign-up records trade=roofers on the workspace.
export const metadata: Metadata = {
  title: `Free Facebook ads for roofing companies: ${FREE_TRIAL_ADS} ads from your website`,
  description: `For roofing company owners: paste your website and get ${FREE_TRIAL_ADS} Facebook ads made for your roofing company in a few minutes. Free, no card.`,
  alternates: { canonical: "/free-ads/roofers" },
  openGraph: { title: "A steady flow of homeowners asking for roof quotes, without you running Facebook ads", description: `${FREE_TRIAL_ADS} Facebook ads made from your roofing company's website. Free, no card.`, url: "/free-ads/roofers" },
};

// Verbatim from Trustpilot (shared with Max's OK). Max runs an exterior lighting company, not a roofing company.
const MAX = {
  quote: "The service Nolan provided helped me save a ton of time making 300 versions of content for my meta ads. His delivery was fast and straight forward!",
  name: "Max",
  business: "Maxteriors Exterior Lighting",
  photo: "/testimonials/max-maxteriors.jpg",
  source: "https://www.trustpilot.com/review/prestyj.com",
};

// Ad Library data line, only from the committed snapshot (scripts/build-adlib-report.ts): one-ad share = 100 - multi-ad share.
const REPORT = adlibSnapshot as unknown as AdlibReport;
const ROOFER_ROW = REPORT.byTrade.find((t) => t.slug === ROOFERS) ?? null;
const ONE_AD_SHARE = ROOFER_ROW ? Math.round(100 - ROOFER_ROW.multiAdShare) : null;

const EXAMPLES = tradePage(ROOFERS)?.examples ?? [];

const STEPS = [
  { n: "1", t: "Paste your website", d: "Just the address. Nothing to fill in, no design files." },
  { n: "2", t: "Check what we found", d: "Your services, your area and what homeowners care about, taken from your site. Fix anything in seconds." },
  { n: "3", t: "Download your ads", d: "Your first ad shows up in about 2 minutes. We also email you when they're all ready." },
];

const FAQ = [
  { q: "Is it really free?", a: `Yes. Your ${FREE_TRIAL_ADS} free ads need no card. You only pay if you want the rest of the pack ($${UNLOCK_PACK.priceCents / 100} once) or a plan.` },
  { q: "I'm not good with computers. Can I do this?", a: "If you can type your website address, you can do this. We do the design and the writing." },
  { q: "Where can I run the ads?", a: "On Facebook and Instagram, or anywhere you advertise. They're made in the feed size, and they're yours to use." },
  { q: "Do I have to sign up for anything after?", a: "No. The free ads are yours either way. If you want Ozzy's team to run them for you, that's a separate monthly plan you can pick later." },
];

const TRUST = ["No card needed", "Ready in minutes", "One free pack per business"];
const CTA = `Get my ${FREE_TRIAL_ADS} free roofing ads`;

function Cta({ id }: { id: string }) {
  return (
    <div className="w-full max-w-2xl">
      <FreeAdsUrlForm id={id} cta={CTA} trade={ROOFERS} />
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
        <Image src={MAX.photo} alt={`${MAX.name}, ${MAX.business}`} width={48} height={48} className="size-12 rounded-full object-cover" />
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

export default function FreeAdsRoofersPage() {
  const offer = autopilotOfferCopy();
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <DeviceCookie />
      <TradeCookie trade={ROOFERS} />
      <TrackOnMount event="landing_view" params={{ page: "free_ads_roofers", trade: ROOFERS }} />
      <StudioNav signedIn={false} minimal />
      <main>
        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-14 pt-3 text-center sm:px-6 sm:pt-14" aria-labelledby="offer-title">
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.1em] text-[var(--studio-gold)]">
            For roofing company owners
          </p>
          <h1 id="offer-title" className="font-display mt-3 text-balance text-[2.4rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-6xl">
            A steady flow of homeowners asking for roof quotes, without you running Facebook ads.
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-lg text-foreground/90 sm:text-xl">
            Paste your website and see {FREE_TRIAL_ADS} ads made from your own logo and colors in minutes. Free, no card. Like them? We run them for you and email you the leads. You set one budget and read one email a week.
          </p>
          <div id="start" className="mt-5 flex w-full justify-center"><Cta id="hero" /></div>
          <p className="mt-6 max-w-2xl text-pretty text-left text-lg leading-relaxed text-foreground/90 sm:text-center">
            After a storm the phone doesn&apos;t stop. Six weeks later it&apos;s quiet and you&apos;re back to waiting on referrals. You&apos;ve boosted a post, maybe paid an agency, and still couldn&apos;t tell what it did.
          </p>
          <div className="mt-6 flex w-full justify-center"><MaxQuote /></div>
        </section>

        {EXAMPLES.length > 0 && (
          <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6" aria-labelledby="examples-title">
            <h2 id="examples-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Roofing ads, the kind Ozzy writes</h2>
            <p className="mt-2 text-lg text-foreground/90">These are templates, not real companies. Yours are made from your own website: your name, your services, your town.</p>
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {EXAMPLES.map((a) => <TemplateAdCard key={a.business} ad={a} />)}
            </ul>
            {ROOFER_ROW && ONE_AD_SHARE !== null && (
              <p className="mt-6 rounded-xl border border-border p-4 text-lg">
                We checked {ROOFER_ROW.advertisers} roofing companies in Meta&apos;s public Ad Library. {ONE_AD_SHARE}% were running just one ad.{" "}
                <Link href={ADLIB_REPORT_PATH} className="text-[var(--studio-gold)] underline-offset-4 hover:underline">See the report</Link>
              </p>
            )}
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

        <section className="mx-auto max-w-3xl px-4 pb-14 sm:px-6" aria-labelledby="next-title">
          <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--studio-gold)]">After your free ads</p>
          <h2 id="next-title" className="font-display mt-2 text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Want us to put these live and send you the leads?</h2>
          <p className="mt-2 text-lg text-foreground/90">We run them on Facebook and Instagram, connected with you step by step, and pause the ones that waste money. A founding offer for roofing companies, shown once your ads are ready. Nothing to decide today.</p>
          <div className="mt-6 rounded-2xl border border-[var(--studio-gold)]/50 bg-white/[0.04] p-5 sm:p-6">
            <ul className="space-y-3">
              {offer.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-base sm:text-lg"><Check aria-hidden className="mt-1 size-5 shrink-0 text-[var(--studio-gold)]" />{f}</li>
              ))}
            </ul>
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-2xl font-semibold"><span className="text-[var(--studio-gold)]">{offer.price}</span> founding price</p>
              <p className="mt-1 text-base text-foreground/80">{offer.priceNote} {offer.scarcity}</p>
              <p className="mt-1 text-base text-foreground/80">Once your free ads are made: {AUTOPILOT_FIRST_MONTH_LINE}. {AUTOPILOT_LAUNCH_NOTE}</p>
              <p className="mt-3 flex items-start gap-2 text-base text-foreground/90"><ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--studio-gold)]" />{AUTOPILOT_GUARANTEE_LINE} You set a hard monthly limit and see what you spent every week.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-14 sm:px-6" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Questions</h2>
          <dl className="mt-6 space-y-6">
            {FAQ.map((f) => (
              <div key={f.q}><dt className="text-lg font-semibold">{f.q}</dt><dd className="mt-1 text-base text-foreground/80">{f.a}</dd></div>
            ))}
          </dl>
        </section>

        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-24 text-center sm:px-6" aria-labelledby="close-title">
          <h2 id="close-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">See your roofing ads before you spend a cent</h2>
          <div id="start-bottom" className="mt-6 flex w-full justify-center"><Cta id="bottom" /></div>
          <p className="mt-6 text-lg text-foreground/90">Want Ozzy to run them for you? The founding offer for roofing companies opens right after your ads are ready.</p>
          <p className="mt-4 text-base text-foreground/80">See more <Link href="/ad-examples/roofers" className="text-[var(--studio-gold)] underline-offset-4 hover:underline">roofing ad examples</Link> or our <Link href="/pricing" className="text-[var(--studio-gold)] underline-offset-4 hover:underline">plans</Link>.</p>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
