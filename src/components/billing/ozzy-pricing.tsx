// The ONE Ozzy pricing section (goal ezmotionkom): Ad Packs + Ozzy Studio + Testimonials on one credit wallet.
// Server component (no hooks): used by /pricing and /ads/pricing. Order (2026-11-11 founding offer): Starter fallback,
// Ozzy Ad Department recommended (first on mobile), Agency. Growth and Scale are hidden from new buyers. Copy only states what we deliver (DESIGN.md: no gradient text).
import Image from "next/image";
import Link from "next/link";
import { Check, Clapperboard, Clock, Gem, Megaphone, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { AD_DEPARTMENT_STACK, ADS_GUARANTEE, ADS_TOPUPS, FOUNDING_FAIR_USE, FOUNDING_PRICE_LOCK, FOUNDING_TERMS, PLANS_FOR_SALE, stackTotalUsd, ANNUAL_MONTHS, ANNUAL_MONTHS_PAID, annualCredits, annualPriceCents, type AdsPlanKey, type AdsPlanTier, unlimitedLine } from "@/lib/ads/billing-config";
import { formatCents } from "@/lib/ads/billing-format";
import { FIRST_VIDEO_OFFER, perVideoUsd, VIDEO_PACK_OFFER } from "@/lib/first-video-offer";
import { ATTRACTION, planAppsSummary, TESTIMONIALS_PER_MONTH } from "@/lib/hub/money-model";
import { STUDIO_INVITE, STUDIO_PRICE } from "@/lib/studio/contracts";
import { cn } from "@/lib/utils";

/** Display order for new buyers: Starter (fallback), Ozzy Ad Department (hero), Scale, Agency; hidden plans are skipped. */
export const PRICING_ORDER: readonly AdsPlanKey[] = ["starter", "ad_department", "scale", "agency"];

export interface OzzyPricingProps {
  yearly: boolean;
  /** Page path for the interval toggle links. */
  basePath: string;
  /** Where "Choose <plan>" goes (signed in: /ads/billing; else sign-up/login with next). */
  planHref: string;
  /** Start-free link (Studio / free ad pack). */
  freeHref: string;
  /** Testimonial packs actions (Launch Kit claim / 5-pack), page-specific. */
  testimonialActions: ReactNode;
  /** Optional banner above the plans (e.g. grandfathered plan notice). */
  notice?: ReactNode;
}

const APPS = [
  { icon: Megaphone, name: "Ad Packs", line: "Paste your website, get on-brand Facebook and Instagram ads." },
  { icon: Wand2, name: "Ozzy Studio", line: "Chat with Ozzy to make video ads and motion graphics, or edit your own clips." },
  { icon: Clapperboard, name: "Testimonials", line: "Your real reviews, spoken on camera by AI presenters. Agency plan only." },
] as const;

const STACK = [
  { icon: Sparkles, title: "What you get", body: "Ads, videos and testimonials that look like your brand made them, ready to post." },
  { icon: ShieldCheck, title: "Why it works", body: "Everything starts from your own website, clips and reviews. You see a free result before you pay a cent." },
  { icon: Clock, title: "How fast", body: "An ad pack in a few minutes. A Studio video in one conversation. No briefs, no back-and-forth." },
  { icon: Wand2, title: "How much effort", body: "Type what you want, like a message to a friend. Ozzy plans, builds, renders and fixes." },
] as const;

const FAQ = [
  { q: "What does Founding Unlimited mean?", a: `${FOUNDING_FAIR_USE} ${FOUNDING_TERMS} ${FOUNDING_PRICE_LOCK}` },
  { q: "What is an Ozzy credit?", a: `One wallet for Ad Packs and Ozzy Studio. A static ad costs 1 credit, an animated ad 5. A new Studio video costs ${STUDIO_PRICE.newShort} credits (${STUDIO_PRICE.newLong} if longer than ${STUDIO_PRICE.longOverSeconds}s), with ${STUDIO_PRICE.includedRevisions} revisions included and ${STUDIO_PRICE.revision} credit per revision after that.` },
  { q: "Why are testimonial videos only on Agency?", a: "Each AI testimonial video takes real presenter rendering time and costs us far more than an ad, so we keep them scarce: 3 a month on Agency, plus one-off packs. Unused plan testimonials don't roll over." },
  { q: "Is there really a free video?", a: `Yes. Everyone gets ${ATTRACTION.studio}. Invite a friend and they get ${STUDIO_INVITE.friendFreeVideos} free videos; you get ${STUDIO_INVITE.senderRewardVideos} more when they join.` },
  { q: "Do credits expire?", a: "Plan credits reset each billing period (yearly plans get all 12 months up front, valid for the year). Top-up credits never expire." },
  { q: "I'm on an old testimonials plan. What happens?", a: "Nothing changes unless you want it to: your plan and price stay as they are. You can switch to an Ozzy plan in one click from Billing." },
  { q: "Can I cancel?", a: `Any time, from Manage subscription. ${ADS_GUARANTEE}` },
] as const;

function priceOf(p: AdsPlanTier, yearly: boolean) {
  if (p.unlimited) return yearly ? { price: formatCents(annualPriceCents(p)), note: "/ year", sub: `${p.key === "agency" ? "Unlimited for up to 10 brands" : "Unlimited ads + Studio"} · save ${formatCents(p.priceCents * (ANNUAL_MONTHS - ANNUAL_MONTHS_PAID))}` } : { price: formatCents(p.priceCents), note: "/ month", sub: p.key === "agency" ? `${unlimitedLine(p)} · 3 testimonials / month` : `Founding Unlimited · stacked value $${stackTotalUsd().toLocaleString("en-US")}/month` };
  return yearly ? { price: formatCents(annualPriceCents(p)), note: "/ year", sub: `${annualCredits(p)} credits up front · save ${formatCents(p.priceCents * (ANNUAL_MONTHS - ANNUAL_MONTHS_PAID))}` } : { price: formatCents(p.priceCents), note: "/ month", sub: `${formatCents(Math.round(p.priceCents / p.monthlyCredits))} per credit` };
}

export function OzzyPricing({ yearly, basePath, planHref, freeHref, testimonialActions, notice }: OzzyPricingProps) {
  const plans = PRICING_ORDER.map((k) => PLANS_FOR_SALE.find((p) => p.key === k)).filter((p): p is AdsPlanTier => Boolean(p));
  const hero = plans.find((p) => p.recommended);
  const toggle = "rounded-lg px-4 py-2 text-sm font-medium transition-colors";
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto max-w-2xl text-center">
        <Image src="/brand/ozzy-adventurer-cool.png" alt="" width={104} height={104} unoptimized className="mx-auto [image-rendering:pixelated]" />
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Pricing</p>
        <h1 className="font-display mt-3 text-balance text-4xl font-medium tracking-[-0.02em] sm:text-6xl">Your AI <em className="text-[var(--studio-gold)]">ad department.</em></h1>
        <p className="mt-4 text-muted-foreground">Fresh ads every Monday, a coach that tells you what&apos;s working, 30-day no-questions refund. Start free: {ATTRACTION.adPack}, plus {ATTRACTION.studio.charAt(0).toLowerCase()}{ATTRACTION.studio.slice(1)}.</p>
        <Link href={freeHref} data-pricing-plan="free" className="spellbar__cta mt-6 inline-flex h-11 items-center justify-center rounded-xl px-6 font-semibold">Start free, no card</Link>
      </div>

      <ul className="mt-12 grid gap-4 sm:grid-cols-3" aria-label="The three apps">
        {APPS.map((a) => (
          <li key={a.name} className="glass rounded-2xl p-5">
            <a.icon aria-hidden className="size-5 text-[var(--studio-gold)]" />
            <p className="font-display mt-2 text-lg font-medium">{a.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{a.line}</p>
          </li>
        ))}
      </ul>

      {notice ? <div className="mt-10">{notice}</div> : null}

      <div className="mt-12 flex justify-center">
        <div className="inline-flex rounded-xl border border-border bg-card/60 p-1" role="group" aria-label="Billing interval">
          <Link href={basePath} scroll={false} aria-pressed={!yearly} className={cn(toggle, !yearly ? "bg-[var(--studio-gold)] text-[#2a0f10]" : "text-muted-foreground hover:text-foreground")}>Monthly</Link>
          <Link href={`${basePath}?billing=year`} scroll={false} aria-pressed={yearly} className={cn(toggle, yearly ? "bg-[var(--studio-gold)] text-[#2a0f10]" : "text-muted-foreground hover:text-foreground")}>Yearly · 2 months free</Link>
        </div>
      </div>

      <div className={cn("mt-8 grid gap-5 md:grid-cols-2", plans.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        {plans.map((p) => {
          const featured = Boolean(p.recommended);
          const pr = priceOf(p, yearly);
          return (
            <section key={p.key} aria-label={p.name} className={cn("glass relative flex flex-col rounded-2xl p-6", featured && "order-first ring-2 ring-[var(--studio-gold)] lg:order-none")}>
              {featured && <span className="absolute -top-3 left-6 rounded-full bg-[var(--studio-gold)] px-2.5 py-0.5 text-xs font-semibold text-[#2a0f10]">{p.unlimited ? "Founding · Unlimited" : "Recommended"}</span>}
              {TESTIMONIALS_PER_MONTH[p.key] > 0 && !featured && <span className="absolute -top-3 left-6 rounded-full border border-[var(--studio-gold)] bg-background px-2.5 py-0.5 text-xs font-semibold text-[var(--studio-gold)]">Includes testimonials</span>}
              <h2 className="font-display text-xl font-medium">{p.name}</h2>
              <p className="mt-3 flex items-baseline gap-1"><span className="text-4xl font-semibold tabular-nums">{pr.price}</span><span className="text-sm text-muted-foreground">{pr.note}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">{pr.sub}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {[...planAppsSummary(p.key), ...p.highlights.slice(-1)].map((i) => <li key={i} className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" />{i}</li>)}
              </ul>
              <Link href={planHref} data-pricing-plan={p.key} data-pricing-interval={yearly ? "year" : "month"} className={cn("mt-6 inline-flex h-11 items-center justify-center rounded-xl font-semibold", featured ? "spellbar__cta" : "border border-border text-foreground transition-colors hover:bg-accent")}>Choose {p.name}{yearly ? " yearly" : ""}</Link>
            </section>
          );
        })}
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground"><ShieldCheck aria-hidden className="size-4 shrink-0 text-[var(--studio-gold)]" />{ADS_GUARANTEE}</p>

      {hero && (
        <section aria-labelledby="hero-stack-h" className="glass mx-auto mt-12 max-w-3xl rounded-2xl p-6">
          <h2 id="hero-stack-h" className="font-display text-2xl font-medium">Everything in {hero.name}</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {AD_DEPARTMENT_STACK.map((i) => (
              <li key={i.label} className="flex items-start justify-between gap-4">
                <span className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" /><span><span className="font-medium">{i.bonus ? "Bonus: " : ""}{i.label}</span> · <span className="text-muted-foreground">{i.detail}</span></span></span>
                <span className="shrink-0 tabular-nums text-muted-foreground">${i.valueUsd}/mo</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-border pt-4 text-sm"><span className="font-semibold">Total value ${stackTotalUsd().toLocaleString("en-US")}/month.</span> Yours for {formatCents(hero.priceCents)}/month.</p>
          {hero.unlimited && <p className="mt-2 text-xs text-muted-foreground">{FOUNDING_FAIR_USE} {FOUNDING_TERMS} {FOUNDING_PRICE_LOCK}</p>}
        </section>
      )}

      <section aria-labelledby="stack-h" className="mt-20">
        <h2 id="stack-h" className="font-display text-center text-3xl font-medium tracking-[-0.01em]">What a plan really buys you</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STACK.map((s) => (
            <div key={s.title} className="glass rounded-2xl p-5">
              <s.icon aria-hidden className="size-5 text-[var(--studio-gold)]" />
              <h3 className="mt-2 font-medium">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="topups-h" className="mt-16 grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="glass rounded-2xl p-6">
          <h2 id="topups-h" className="font-display text-2xl font-medium">Just need a few more credits?</h2>
          <p className="mt-1 text-sm text-muted-foreground">One-time top-ups for Ad Packs and Studio, no subscription, never expire: {ADS_TOPUPS.map((t) => `${t.name} for ${formatCents(t.priceCents)}`).join(" · ")}.</p>
        </div>
        <Link href={planHref} data-pricing-plan="topup" className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 font-semibold transition-colors hover:bg-accent">Buy credits</Link>
      </section>

      <section id="testimonial-packs" aria-labelledby="packs-h" className="pixel-frame mt-16 rounded-2xl border border-[var(--studio-gold)]/40 bg-card/60 p-6 sm:p-8">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]"><Gem aria-hidden className="size-4" />Premium add-on</p>
        <h2 id="packs-h" className="font-display mt-2 text-3xl font-medium">AI testimonial videos</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Your real customer reviews, spoken on camera by a realistic AI presenter. They take serious rendering, so they never cost credits: they come with Agency (3 a month), or as one-off packs.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="glass rounded-2xl p-5">
            <p className="font-medium">{FIRST_VIDEO_OFFER.name}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCents(FIRST_VIDEO_OFFER.priceCents)} <span className="text-sm font-normal text-muted-foreground">once · {FIRST_VIDEO_OFFER.minutes} videos · {perVideoUsd(FIRST_VIDEO_OFFER.priceCents, FIRST_VIDEO_OFFER.minutes)} each</span></p>
            <p className="mt-1 text-xs text-muted-foreground">First purchase only. {FIRST_VIDEO_OFFER.bonuses.join(" · ")}.</p>
          </div>
          <div className="glass rounded-2xl p-5">
            <p className="font-medium">{VIDEO_PACK_OFFER.name}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCents(VIDEO_PACK_OFFER.priceCents)} <span className="text-sm font-normal text-muted-foreground">once · {VIDEO_PACK_OFFER.minutes} videos · {perVideoUsd(VIDEO_PACK_OFFER.priceCents, VIDEO_PACK_OFFER.minutes)} each</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Pack videos never expire. Up to 60s each.</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">{testimonialActions}</div>
      </section>

      <section aria-labelledby="faq-h" className="mx-auto mt-20 max-w-3xl">
        <h2 id="faq-h" className="font-display text-center text-3xl font-medium">Questions</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="glass rounded-2xl p-5">
              <summary className="cursor-pointer font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}

/** Default testimonial-pack actions: signed in -> testimonials billing (packs); signed out -> Launch Kit sign-up flow. */
export function TestimonialPackLinks({ signedIn }: { signedIn: boolean }) {
  return signedIn ? (
    <Link href="/dashboard/billing" className="spellbar__cta inline-flex h-11 items-center justify-center rounded-xl px-6 font-semibold">Get testimonial videos</Link>
  ) : (
    <Link href="/register?flow=first_video" className="spellbar__cta inline-flex h-11 items-center justify-center rounded-xl px-6 font-semibold">Claim the {FIRST_VIDEO_OFFER.name}</Link>
  );
}
