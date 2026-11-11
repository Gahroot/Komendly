import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Briefcase, Check, Gift, Palette, PenTool, Wallet } from "lucide-react";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { formatCents } from "@/lib/ads/billing-format";
import { exampleEarnings, PARTNER_TERMS } from "@/lib/ads/partner";
import "@/components/studio/studio.css";

// Partner recruiting page. Static (no session read) so it stays publicly cacheable.
export const metadata: Metadata = {
  title: "Partner program: earn 30% recommending Komendly to your clients",
  description: "For web designers, freelancers and small agencies. Earn 30% of what your clients pay for 12 months, plus free demo ad packs to show them their own ads.",
  alternates: { canonical: "/partners" },
  openGraph: { title: "Komendly Partner Program: 30% for 12 months", description: "Show clients ads made from their own website. Earn 30% of what they pay for a year.", url: "/partners" },
};

const T = PARTNER_TERMS;
const MIN = formatCents(T.minPayoutCents);

const WHO = [
  { icon: Palette, t: "Web designers", d: "You just launched their site. Now they ask how to get people to it. Hand them ads that match the site you built." },
  { icon: PenTool, t: "Freelancers", d: "Marketers, copywriters, social media managers. Give clients fresh creative every month without designing it yourself." },
  { icon: Briefcase, t: "Small agencies", d: "Serve small-business clients whose budgets don't stretch to a designer for every ad. Add a recurring line without adding headcount." },
];

const DEAL = [
  `${T.commissionPct}% of everything your referrals pay, for ${T.commissionMonths} months`,
  `${T.demoGiftsPerMonth} free demo packs every month: 3 ads made from a client's own website, before they spend a cent`,
  "Your own free ad pack, so you know the product inside out",
  "Your clients get a bigger free trial through your link",
  "A dashboard with clicks, sign-ups, paying clients and payouts",
];

const STEPS = [
  { t: "Apply in 2 minutes", d: "Tell us about your clients. We review every application, usually within 2 business days." },
  { t: "Show a client their own ads", d: "Paste their website into a demo pack. Ozzy makes 3 ads from it and you send them the link. It does the selling for you." },
  { t: "Earn every month they pay", d: `They sign up through your link. You get ${T.commissionPct}% of each payment for ${T.commissionMonths} months, paid monthly.` },
];

const SAMPLES = [
  { src: "/ads/samples/tidybooks-ad-0-4x5.jpg", alt: "Ad made from the Tidybooks website", w: 1024, h: 1280 },
  { src: "/ads/samples/maxteriors-ad-0.jpg", alt: "Ad made from the Maxteriors website", w: 900, h: 900 },
  { src: "/ads/samples/plausible-ad-1-4x5.jpg", alt: "Ad made from the Plausible website", w: 1024, h: 1280 },
];

const FAQ = [
  { q: "How and when do I get paid?", a: `Monthly, via PayPal or Wise. A commission becomes payable once the payment is past our ${T.refundWindowDays}-day refund window, and we pay out once your balance reaches ${MIN}. Anything under ${MIN} rolls over to the next month.` },
  { q: "What counts as a referral?", a: `Anyone who signs up within ${T.attributionDays} days of clicking your link. If someone clicked another partner's link first, the first referral wins.` },
  { q: "What do I earn on?", a: `Every subscription payment (including the Launch Quarter) and every credit pack your referral buys, for ${T.commissionMonths} months from their sign-up. Refunded payments don't earn commission.` },
  { q: "Can I refer myself or my own business?", a: "No. Self-referrals and referrals of your own company aren't eligible. Your partner account comes with its own free pack instead." },
  { q: "What are demo packs?", a: `Each month you can make ${T.demoGiftsPerMonth} free packs of 3 ads from any client's website and send them a private link. They see their own brand in real ads before they sign up.` },
  { q: "Do I need to manage my clients' accounts?", a: "No. Clients run their own studio. You can help them if you like, but you're paid either way." },
];

function ApplyCta({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 sm:flex-row ${className}`}>
      <Link href="/partners/apply" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--studio-gold)] px-6 text-base font-semibold text-[#2a0f10] shadow-[0_0_24px_#ffcf4a55] transition hover:brightness-105">
        Apply to the partner program <ArrowRight className="size-4" />
      </Link>
      <p className="text-xs text-muted-foreground">Free to join · reviewed within 2 business days</p>
    </div>
  );
}

export default function PartnersPage() {
  const examples = exampleEarnings();
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <StudioNav signedIn={false} />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 md:grid-cols-[1.3fr_1fr]" aria-labelledby="hero-title">
          <div className="text-center md:text-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Komendly Partner Program</p>
            <h1 id="hero-title" className="font-display mt-5 text-balance text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">
              Your clients need ads. Earn {T.commissionPct}% when they get them from Komendly.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg md:mx-0 mx-auto">
              For web designers, freelancers and small agencies. Show a client ads made from their own website in minutes, and earn {T.commissionPct}% of what they pay for {T.commissionMonths} months.
            </p>
            <ApplyCta className="mt-8 md:items-start" />
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div className="studio-frame rotate-[-3deg] rounded-xl p-2"><Image src={SAMPLES[0]?.src ?? ""} alt={SAMPLES[0]?.alt ?? ""} width={1024} height={1280} priority sizes="(min-width: 768px) 380px, 80vw" className="h-auto w-full rounded-md" /></div>
            <Image src="/brand/ozzy-developer-excited.png" alt="" width={128} height={128} unoptimized className="absolute -bottom-8 -left-6 w-24 [image-rendering:pixelated] sm:w-32" />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-label="The deal at a glance">
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              { k: `${T.commissionPct}%`, v: `of every payment, for ${T.commissionMonths} months` },
              { k: `${T.demoGiftsPerMonth} / month`, v: "free demo packs for your clients" },
              { k: "Monthly", v: "payouts via PayPal or Wise" },
            ].map((s) => (
              <div key={s.k} className="glass rounded-2xl p-5 text-center">
                <dt className="font-display text-3xl font-medium text-[var(--studio-gold)] sm:text-4xl">{s.k}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{s.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-labelledby="who-title">
          <h2 id="who-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Made for people with small-business clients</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {WHO.map((w) => (
              <div key={w.t} className="rounded-xl border border-border p-5">
                <w.icon className="size-5 text-[var(--studio-gold)]" aria-hidden />
                <p className="mt-3 font-medium">{w.t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{w.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 sm:px-6 md:grid-cols-2" aria-labelledby="deal-title">
          <div>
            <h2 id="deal-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">The deal</h2>
            <ul className="mt-6 divide-y divide-border rounded-xl border border-border">
              {DEAL.map((d) => (
                <li key={d} className="flex items-start gap-3 p-4"><Check className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" /><span>{d}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">The pitch writes itself</h2>
            <p className="mt-2 text-sm text-muted-foreground">Demo packs show clients ads built from their own site. Real examples:</p>
            <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
              {SAMPLES.map((s) => (
                <div key={s.src} className="studio-frame rounded-lg p-1"><Image src={s.src} alt={s.alt} width={s.w} height={s.h} sizes="(min-width: 768px) 16vw, 30vw" className="h-auto w-full rounded" /></div>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Gift className="size-4 shrink-0 text-[var(--studio-gold)]" aria-hidden />{T.demoGiftsPerMonth} demo packs a month, free, on us.</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-labelledby="how-title">
          <h2 id="how-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">How it works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.t} className="rounded-xl border border-border p-5">
                <p className="font-mono text-sm text-[var(--studio-gold)]">{i + 1}</p>
                <p className="mt-2 font-medium">{s.t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="earnings" className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="earn-title">
          <h2 id="earn-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">What it can add up to</h2>
          <p className="mt-2 text-sm text-muted-foreground">Examples at our current list prices, not a promise of earnings.</p>
          <ul className="mt-6 divide-y divide-border rounded-xl border border-border">
            {examples.map((e) => (
              <li key={`${e.clients}-${e.plan}`} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                <span>{e.clients} clients on {e.plan} <span className="text-muted-foreground">({formatCents(e.priceCents)}/mo)</span></span>
                <span className="text-right"><span className="font-semibold text-[var(--studio-gold)] tabular-nums">{formatCents(e.monthlyCents)}/month</span> <span className="text-sm text-muted-foreground">· {formatCents(e.yearCents)} over {T.commissionMonths} months</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="size-4 shrink-0 text-[var(--studio-gold)]" aria-hidden />{T.commissionPct}% × plan price × clients. Credit packs your clients buy count too.</p>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Questions</h2>
          <dl className="mt-6 space-y-5">
            {FAQ.map((f) => (
              <div key={f.q}><dt className="font-medium">{f.q}</dt><dd className="mt-1 text-sm text-muted-foreground">{f.a}</dd></div>
            ))}
          </dl>
        </section>

        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-24 text-center sm:px-6" aria-labelledby="close-title">
          <Image src="/brand/ozzy-classic-love.png" alt="" width={96} height={96} unoptimized className="[image-rendering:pixelated]" />
          <h2 id="close-title" className="font-display mt-4 text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Bring your clients. Ozzy brings the ads.</h2>
          <ApplyCta className="mt-6" />
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
