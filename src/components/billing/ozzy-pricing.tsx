// The ONE Ozzy pricing section: leads with the flagship offer, "Hire Ozzy's AI Marketing Team" (prd.md §1-§4; the
// ad_department plan), then the other plans (Starter ads-only, Agency) and the self-serve apps on one credit wallet.
// Server component (no hooks): used by /pricing and /ads/pricing. Growth and Scale are hidden from new buyers.
// Next to every checkout button: price, renewal, cancel path, ad spend (checkoutTerms). Copy only states what we deliver.
import Link from "next/link";
import { Check, Clapperboard, Clock, Gem, Megaphone, ShieldCheck, Sparkles, Wallet, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { AD_DEPARTMENT_STACK, ADS_GUARANTEE, ADS_TOPUPS, PLAN_USAGE_NOTE, FOUNDING_PRICE_LOCK, FOUNDING_TERMS, PLANS_FOR_SALE, stackTotalUsd, ANNUAL_MONTHS, ANNUAL_MONTHS_PAID, annualCredits, annualPriceCents, type AdsPlanKey, type AdsPlanTier, planDisplayName, planUsageLine } from "@/lib/ads/billing-config";
import { formatCents } from "@/lib/ads/billing-format";
import { FIRST_VIDEO_OFFER, perVideoUsd, VIDEO_PACK_OFFER } from "@/lib/first-video-offer";
import { ATTRACTION, planAppsSummary, TESTIMONIALS_PER_MONTH } from "@/lib/hub/money-model";
import { STUDIO_INVITE, STUDIO_PRICE } from "@/lib/studio/contracts";
import { AD_SPEND_LINE, checkoutTerms, HERO_PLAN, LAUNCH_PRICE_NOTE, NO_GUARANTEE_LINE, PUBLIC_OFFER } from "@/lib/ads/public-offer";
import { TeamOffer } from "./team-offer";
import { cn } from "@/lib/utils";

/** Display order for new buyers: Starter (ads only), Ozzy's AI Marketing Team (hero), Scale, Agency; hidden plans are skipped. */
export const PRICING_ORDER: readonly AdsPlanKey[] = ["starter", "ad_department", "scale", "agency"];

export interface OzzyPricingProps {
  yearly: boolean;
  /** Page path for the interval toggle links. */
  basePath: string;
  /** Where "Choose <plan>" goes (plan key) and "Buy credits" goes (no key). `yearly` overrides the page interval. */
  planHref: (plan?: AdsPlanKey, yearly?: boolean) => string;
  /** Start-free link (Studio / free ad pack). */
  freeHref: string;
  /** Testimonial packs actions (Launch Kit claim / 5-pack), page-specific. */
  testimonialActions: ReactNode;
  /** Optional banner above the plans (e.g. grandfathered plan notice). */
  notice?: ReactNode;
}

const APPS = [
  { icon: Megaphone, name: "Ad Packs", line: "Paste your website, get on-brand Facebook and Instagram ads to run yourself." },
  { icon: Wand2, name: "Ozzy Studio", line: "Chat with Ozzy to make video ads and motion graphics, or edit your own clips." },
  { icon: Clapperboard, name: "Testimonials", line: "Your real reviews, spoken on camera by AI presenters. Agency plan only." },
] as const;

const STACK = [
  { icon: Sparkles, title: "What you get", body: "A team that makes your ads, runs them in your own Meta account, checks them every day and sends you every lead." },
  { icon: ShieldCheck, title: "Why you can trust it", body: "You see 10 free ads from your website before you pay. Spend never goes over your monthly limit, and you can pause any time." },
  { icon: Clock, title: "How fast", body: "Free ads in a few minutes. Once you connect Meta and set your limit, the team launches your ads without more clicks from you." },
  { icon: Wand2, title: "How much effort", body: "Connect Meta once, set a monthly limit, read the weekly report, call your leads. No ad jargon to learn." },
] as const;

const FAQ = [
  { q: "What does Ozzy's team actually do?", a: "Every week it makes fresh ads from your website, launches them as Facebook and Instagram lead ads in your own Meta account, checks results every day, pauses ads that waste money, emails you each new lead within minutes and sends you a plain-English report. Everything it did shows up in your dashboard." },
  { q: "Who pays for the ads?", a: `${AD_SPEND_LINE} The ${PUBLIC_OFFER.heroPrice}/month is only for the team. You can lower your limit or pause your ads any time.` },
  { q: "How many leads will I get?", a: `${NO_GUARANTEE_LINE} You see every lead and every dollar spent, so you can judge it yourself.` },
  { q: "What do I need to do?", a: "Connect your Facebook and Instagram account once, set a monthly ad budget limit, read the weekly report and call your leads." },
  { q: "Who is it not for (yet)?", a: "Businesses whose ads Meta treats as a special category (housing, loans and credit, jobs, politics). You can still get free ads and make your own, but the team won't run those campaigns." },
  { q: "What does 20x Starter mean?", a: `${PLAN_USAGE_NOTE} ${FOUNDING_TERMS} ${FOUNDING_PRICE_LOCK}` },
  { q: "What is an Ozzy credit?", a: `One wallet for Ad Packs and Ozzy Studio. A static ad costs 1 credit, an animated ad 5. A new Studio video costs ${STUDIO_PRICE.newShort} credits (${STUDIO_PRICE.newLong} if longer than ${STUDIO_PRICE.longOverSeconds}s), with ${STUDIO_PRICE.includedRevisions} revisions included and ${STUDIO_PRICE.revision} credit per revision after that.` },
  { q: "Why are testimonial videos only on Agency?", a: "Each AI testimonial video takes real presenter rendering time and costs us far more than an ad, so we keep them scarce: 3 a month on Agency, plus one-off packs. Unused plan testimonials don't roll over." },
  { q: "Is there really a free video?", a: `Yes. Everyone gets ${ATTRACTION.studio}. Invite a friend and they get ${STUDIO_INVITE.friendFreeVideos} free videos; you get ${STUDIO_INVITE.senderRewardVideos} more when they join.` },
  { q: "Do credits expire?", a: "Plan credits reset each billing period (yearly plans get all 12 months up front, valid for the year). Top-up credits never expire." },
  { q: "I'm on an old testimonials plan. What happens?", a: "Nothing changes unless you want it to: your plan and price stay as they are. You can switch to an Ozzy plan in one click from Billing." },
  { q: "Can I cancel?", a: `Any time, online, from Manage subscription on your billing page. Your plan runs to the end of the period you paid for, then the team pauses your ads. ${ADS_GUARANTEE}` },
] as const;

function priceOf(p: AdsPlanTier, yearly: boolean) {
  if (p.usageMultiple) return yearly ? { price: formatCents(annualPriceCents(p)), note: "/ year", sub: `${planUsageLine(p)} · save ${formatCents(p.priceCents * (ANNUAL_MONTHS - ANNUAL_MONTHS_PAID))}` } : { price: formatCents(p.priceCents), note: "/ month", sub: p.key === "agency" ? `${planUsageLine(p)} · 3 testimonials / month` : `${p.usageMultiple}x Starter usage · stacked value $${stackTotalUsd().toLocaleString("en-US")}/month` };
  return yearly ? { price: formatCents(annualPriceCents(p)), note: "/ year", sub: `${annualCredits(p)} credits up front · save ${formatCents(p.priceCents * (ANNUAL_MONTHS - ANNUAL_MONTHS_PAID))}` } : { price: formatCents(p.priceCents), note: "/ month", sub: `${formatCents(Math.round(p.priceCents / p.monthlyCredits))} per credit` };
}

export function OzzyPricing({ yearly, basePath, planHref, freeHref, testimonialActions, notice }: OzzyPricingProps) {
  const plans = PRICING_ORDER.map((k) => PLANS_FOR_SALE.find((p) => p.key === k)).filter((p): p is AdsPlanTier => Boolean(p));
  const hero = plans.find((p) => p.recommended);
  const toggle = "rounded-lg px-4 py-2 text-sm font-medium transition-colors";
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-20">
      <TeamOffer as="h1" hireHref={planHref(HERO_PLAN.key, false)} freeHref={freeHref} />

      {notice ? <div className="mt-10">{notice}</div> : null}

      <div className="mx-auto mt-20 max-w-2xl text-center">
        <h2 className="font-display text-3xl font-medium tracking-[-0.01em]">All plans</h2>
        <p className="mt-2 text-sm text-muted-foreground">Want to run ads yourself? Starter gives you the ads without the team. Agency is for marketers with client brands.</p>
      </div>

      <div className="mt-6 flex justify-center">
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
              {featured && <span className="absolute -top-3 left-6 rounded-full bg-[var(--studio-gold)] px-2.5 py-0.5 text-xs font-semibold text-[#2a0f10]">Done for you</span>}
              {TESTIMONIALS_PER_MONTH[p.key] > 0 && !featured && <span className="absolute -top-3 left-6 rounded-full border border-[var(--studio-gold)] bg-background px-2.5 py-0.5 text-xs font-semibold text-[var(--studio-gold)]">Includes testimonials</span>}
              <h3 className="font-display text-xl font-medium">{planDisplayName(p)}</h3>
              <p className="mt-3 flex items-baseline gap-1"><span className="text-4xl font-semibold tabular-nums">{pr.price}</span><span className="text-sm text-muted-foreground">{pr.note}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">{pr.sub}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {(featured ? p.highlights.slice(0, -1) : [...planAppsSummary(p.key), ...p.highlights.slice(-1)]).map((i) => <li key={i} className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" />{i}</li>)}
              </ul>
              <Link href={planHref(p.key)} data-pricing-plan={p.key} data-pricing-interval={yearly ? "year" : "month"} className={cn("mt-6 inline-flex h-11 items-center justify-center rounded-xl font-semibold", featured ? "spellbar__cta" : "border border-border text-foreground transition-colors hover:bg-accent")}>{featured ? "Hire the team" : `Choose ${p.name}`}{yearly ? " yearly" : ""}</Link>
              <p className="mt-2 text-center text-xs text-muted-foreground">{checkoutTerms(p, { yearly })}</p>
              {featured && !yearly ? <p className="mt-1 text-center text-xs text-[var(--studio-gold)]">{LAUNCH_PRICE_NOTE}</p> : null}
            </section>
          );
        })}
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground"><ShieldCheck aria-hidden className="size-4 shrink-0 text-[var(--studio-gold)]" />{ADS_GUARANTEE}</p>

      {hero && (
        <section aria-labelledby="hero-stack-h" className="glass mx-auto mt-12 max-w-3xl rounded-2xl p-6">
          <h2 id="hero-stack-h" className="font-display text-2xl font-medium">Everything {planDisplayName(hero)} does for you</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {AD_DEPARTMENT_STACK.map((i) => (
              <li key={i.label} className="flex items-start justify-between gap-4">
                <span className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" /><span><span className="font-medium">{i.bonus ? "Bonus: " : ""}{i.label}</span> · <span className="text-muted-foreground">{i.detail}</span></span></span>
                <span className="shrink-0 tabular-nums text-muted-foreground">${i.valueUsd}/mo</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-border pt-4 text-sm"><span className="font-semibold">Total value ${stackTotalUsd().toLocaleString("en-US")}/month.</span> Yours for {formatCents(hero.priceCents)}/month ({PUBLIC_OFFER.heroFirstMonth} the first month with the launch offer).</p>
          <p className="mt-2 flex gap-2 text-xs text-muted-foreground"><Wallet aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[var(--studio-gold)]" />{AD_SPEND_LINE} {NO_GUARANTEE_LINE}</p>
          {hero.usageMultiple && <p className="mt-2 text-xs text-muted-foreground">{PLAN_USAGE_NOTE} {FOUNDING_TERMS} {FOUNDING_PRICE_LOCK}</p>}
        </section>
      )}

      <section aria-labelledby="stack-h" className="mt-20">
        <h2 id="stack-h" className="font-display text-center text-3xl font-medium tracking-[-0.01em]">What hiring the team really buys you</h2>
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

      <section aria-labelledby="apps-h" className="mt-16">
        <h2 id="apps-h" className="font-display text-center text-3xl font-medium tracking-[-0.01em]">Make your own, too</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">Every plan shares one credit wallet for these. Everyone also gets {ATTRACTION.studio}.</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="The three apps">
          {APPS.map((a) => (
            <li key={a.name} className="glass rounded-2xl p-5">
              <a.icon aria-hidden className="size-5 text-[var(--studio-gold)]" />
              <p className="font-display mt-2 text-lg font-medium">{a.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{a.line}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="topups-h" className="mt-16 grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="glass rounded-2xl p-6">
          <h2 id="topups-h" className="font-display text-2xl font-medium">Just need a few more credits?</h2>
          <p className="mt-1 text-sm text-muted-foreground">One-time top-ups for Ad Packs and Studio, no subscription, never expire: {ADS_TOPUPS.map((t) => `${t.name} for ${formatCents(t.priceCents)}`).join(" · ")}.</p>
        </div>
        <Link href={planHref()} data-pricing-plan="topup" className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 font-semibold transition-colors hover:bg-accent">Buy credits</Link>
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
