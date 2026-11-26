// The flagship offer block (prd.md §1-§4): "Hire Ozzy's AI Marketing Team" = Growth Autopilot (founding price, 10
// founding spots; a waitlist line replaces the button when they're gone). Server component, used on the homepage
// and the pricing pages. Ozzy Ad Department is mentioned as the do-it-yourself option. Every line is real work the product does; next to the checkout button: price, renewal,
// cancel path and ad spend (auto-renewal disclosure). Never promises leads, sales or ROI (DESIGN.md: no gradient text).
import Image from "next/image";
import Link from "next/link";
import { Check, ShieldCheck, Wallet } from "lucide-react";
import { AUTOPILOT_FULL_MESSAGE, AUTOPILOT_PRICE_LOCK } from "@/lib/ads/billing-config";
import { AD_SPEND_LINE, checkoutTerms, DIY_INCLUDES, FOUNDING_SPOTS_LINE, HERO_PLAN, AUTOPILOT_FIRST_MONTH_LINE, AUTOPILOT_GUARANTEE_LINE, AUTOPILOT_LAUNCH_NOTE, HERO_TEAM, LAUNCH_PRICE_NOTE, NO_GUARANTEE_LINE, OWNER_STEPS, PUBLIC_OFFER } from "@/lib/ads/public-offer";
import { DREAM_HEADLINE, DREAM_HEADLINE_EM, DREAM_PROCESS, DREAM_SUB, OBJECTION_STACK } from "@/lib/ads/dream-copy";
import { cn } from "@/lib/utils";

export interface TeamOfferProps {
  /** Checkout path for the hero plan (signed-out visitors should get a sign-up link that keeps it). */
  hireHref: string;
  /** Free ads path (the lead magnet). */
  freeHref: string;
  /** Growth Autopilot founding spots left (0 = waitlist line instead of the button; null = unknown, show the button). */
  spotsLeft: number | null;
  /** Where the do-it-yourself plan (Ozzy Ad Department) is shown. */
  diyHref?: string;
  /** h1 on the pricing pages, h2 on the homepage. */
  as?: "h1" | "h2";
  className?: string;
}

export function TeamOffer({ hireHref, freeHref, spotsLeft, diyHref = "/pricing#all-plans", as: Heading = "h2", className }: TeamOfferProps) {
  const full = spotsLeft !== null && spotsLeft <= 0;
  return (
    <section aria-labelledby="team-offer-title" className={cn("grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-start", className)}>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Done for you · founding offer</p>
        <Heading id="team-offer-title" className="font-display mt-3 text-balance text-4xl font-medium tracking-[-0.02em] sm:text-5xl">
          {DREAM_HEADLINE.split(DREAM_HEADLINE_EM)[0]}<em className="text-[var(--studio-gold)]">{DREAM_HEADLINE_EM}</em>{DREAM_HEADLINE.split(DREAM_HEADLINE_EM)[1]}
        </Heading>
        <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">{DREAM_SUB}</p>
        <p className="mt-3 max-w-xl text-pretty text-sm text-muted-foreground">{DREAM_PROCESS}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="What you get">
          {OBJECTION_STACK.map((o) => (
            <li key={o.worry} className="glass rounded-2xl p-4">
              <p className="flex items-center gap-2 font-medium"><Check aria-hidden className="size-4 shrink-0 text-[var(--studio-gold)]" />{o.worry}</p>
              <p className="mt-1 text-sm text-muted-foreground">{o.answer}</p>
            </li>
          ))}
        </ul>
        <details className="mt-6 text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Who does the work</summary>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Who does what">
            {HERO_TEAM.map((t) => (
              <li key={t.role} className="rounded-xl border border-border p-3"><p className="font-medium text-foreground">{t.role}</p><p className="mt-1">{t.does}</p></li>
            ))}
          </ul>
        </details>
      </div>

      <div className="glass relative rounded-2xl p-6 ring-2 ring-[var(--studio-gold)] sm:p-7">
        <Image src="/brand/ozzy-adventurer-cool.png" alt="" width={72} height={72} unoptimized className="absolute -top-10 right-5 [image-rendering:pixelated]" />
        <p className="font-display text-xl font-medium">{PUBLIC_OFFER.heroName}</p>
        <p className="text-sm text-muted-foreground">{PUBLIC_OFFER.heroPlanName}</p>
        <p className="mt-2 flex items-baseline gap-2"><span className="text-4xl font-semibold tabular-nums">{PUBLIC_OFFER.heroPrice}</span><span className="text-sm text-muted-foreground">/ month founding price</span></p>
        <p className="mt-1 text-sm text-muted-foreground">Regular price <s className="tabular-nums">{PUBLIC_OFFER.heroRegularPrice}</s>/month. {AUTOPILOT_PRICE_LOCK}</p>
        <p className="mt-2 text-sm text-[var(--studio-gold)]">{FOUNDING_SPOTS_LINE}{spotsLeft !== null && !full ? ` ${spotsLeft} left.` : ""}</p>
        <p className="mt-1 text-sm text-muted-foreground">For businesses that have made their free ads: {AUTOPILOT_FIRST_MONTH_LINE}. {AUTOPILOT_LAUNCH_NOTE}</p>

        <p className="mt-5 text-sm font-medium">What you do</p>
        <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {OWNER_STEPS.map((s, i) => <li key={s} className="flex gap-2"><span className="font-mono text-xs text-[var(--studio-gold)]">{i + 1}</span>{s}</li>)}
        </ol>

        <Link href={freeHref} data-pricing-plan="free" className="spellbar__cta mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl px-6 font-semibold">See your {PUBLIC_OFFER.freeAds} free ads first</Link>
        <p className="mt-2 text-center text-xs text-muted-foreground">No card needed. Like them? We put them live and send you the leads.</p>

        {full ? (
          <p role="status" className="mt-4 rounded-xl border border-border px-4 py-3 text-center text-sm font-medium">{AUTOPILOT_FULL_MESSAGE}</p>
        ) : (
          <>
            <Link href={hireHref} data-pricing-plan={HERO_PLAN.key} data-pricing-interval="month" className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--studio-gold)] px-6 font-semibold text-foreground transition-colors hover:bg-accent">Claim a founding spot</Link>
            <p className="mt-2 text-center text-xs text-muted-foreground">{checkoutTerms(HERO_PLAN)}</p>
          </>
        )}

        <ul className="mt-6 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <li className="flex gap-2"><Wallet aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[var(--studio-gold)]" />{AD_SPEND_LINE}</li>
          <li className="flex gap-2"><ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[var(--studio-gold)]" />{AUTOPILOT_GUARANTEE_LINE}</li>
          <li className="flex gap-2"><Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[var(--studio-gold)]" />{NO_GUARANTEE_LINE}</li>
        </ul>
        <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
          Rather post ads yourself? <Link href={diyHref} className="font-medium text-foreground underline-offset-4 hover:underline">{PUBLIC_OFFER.diyName}</Link>: {DIY_INCLUDES}. {PUBLIC_OFFER.diyPrice}/month ({LAUNCH_PRICE_NOTE})
        </p>
      </div>
    </section>
  );
}
