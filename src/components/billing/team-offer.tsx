// The flagship offer block (prd.md §1-§4): "Hire Ozzy's AI Marketing Team". Server component, used on the homepage
// and the pricing pages. Every line is real work the product does; next to the checkout button: price, renewal,
// cancel path and ad spend (auto-renewal disclosure). Never promises leads, sales or ROI (DESIGN.md: no gradient text).
import Image from "next/image";
import Link from "next/link";
import { BarChart3, Check, Inbox, Palette, Rocket, Search, ShieldCheck, Wallet, Wand2 } from "lucide-react";
import { AD_SPEND_LINE, checkoutTerms, HERO_OUTCOME, HERO_PLAN, HERO_TEAM, LAUNCH_PRICE_NOTE, NO_GUARANTEE_LINE, OWNER_STEPS, PUBLIC_OFFER } from "@/lib/ads/public-offer";
import { cn } from "@/lib/utils";

const ROLE_ICONS = [Wand2, Search, Palette, Rocket, BarChart3, Inbox] as const;

export interface TeamOfferProps {
  /** Checkout path for the hero plan (signed-out visitors should get a sign-up link that keeps it). */
  hireHref: string;
  /** Free ads path (the lead magnet). */
  freeHref: string;
  /** h1 on the pricing pages, h2 on the homepage. */
  as?: "h1" | "h2";
  className?: string;
}

export function TeamOffer({ hireHref, freeHref, as: Heading = "h2", className }: TeamOfferProps) {
  return (
    <section aria-labelledby="team-offer-title" className={cn("grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-start", className)}>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Done for you · {PUBLIC_OFFER.heroPrice}/month</p>
        <Heading id="team-offer-title" className="font-display mt-3 text-balance text-4xl font-medium tracking-[-0.02em] sm:text-5xl">
          Hire Ozzy&apos;s <em className="text-[var(--studio-gold)]">AI Marketing Team</em>
        </Heading>
        <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">{HERO_OUTCOME}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="Who does what">
          {HERO_TEAM.map((t, i) => {
            const Icon = ROLE_ICONS[i] ?? Wand2;
            return (
              <li key={t.role} className="glass rounded-2xl p-4">
                <p className="flex items-center gap-2 font-medium"><Icon aria-hidden className="size-4 shrink-0 text-[var(--studio-gold)]" />{t.role}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.does}</p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="glass relative rounded-2xl p-6 ring-2 ring-[var(--studio-gold)] sm:p-7">
        <Image src="/brand/ozzy-adventurer-cool.png" alt="" width={72} height={72} unoptimized className="absolute -top-10 right-5 [image-rendering:pixelated]" />
        <p className="font-display text-xl font-medium">{PUBLIC_OFFER.heroName}</p>
        <p className="mt-2 flex items-baseline gap-1"><span className="text-4xl font-semibold tabular-nums">{PUBLIC_OFFER.heroPrice}</span><span className="text-sm text-muted-foreground">/ month</span></p>
        <p className="mt-1 text-sm text-[var(--studio-gold)]">{LAUNCH_PRICE_NOTE}</p>

        <p className="mt-5 text-sm font-medium">What you do</p>
        <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {OWNER_STEPS.map((s, i) => <li key={s} className="flex gap-2"><span className="font-mono text-xs text-[var(--studio-gold)]">{i + 1}</span>{s}</li>)}
        </ol>

        <Link href={freeHref} data-pricing-plan="free" className="spellbar__cta mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl px-6 font-semibold">Start with {PUBLIC_OFFER.freeAds} free ads</Link>
        <p className="mt-2 text-center text-xs text-muted-foreground">No card needed. Then hire the team to run them.</p>

        <Link href={hireHref} data-pricing-plan={HERO_PLAN.key} data-pricing-interval="month" className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--studio-gold)] px-6 font-semibold text-foreground transition-colors hover:bg-accent">Hire the team now</Link>
        <p className="mt-2 text-center text-xs text-muted-foreground">{checkoutTerms(HERO_PLAN)}</p>

        <ul className="mt-6 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <li className="flex gap-2"><Wallet aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[var(--studio-gold)]" />{AD_SPEND_LINE}</li>
          <li className="flex gap-2"><ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[var(--studio-gold)]" />Not happy in your first 30 days? One click on your billing page, full refund.</li>
          <li className="flex gap-2"><Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[var(--studio-gold)]" />{NO_GUARANTEE_LINE}</li>
        </ul>
      </div>
    </section>
  );
}
