import Link from "next/link";
import { ADS_GUARANTEE } from "@/lib/ads/billing-config";
import { FOUNDING_SPOTS_LINE, NO_GUARANTEE_LINE, PUBLIC_OFFER } from "@/lib/ads/public-offer";
import { StudioPose } from "./studio-pose";

/** Pricing teaser + a last call to action that jumps back to the spell bar. */
export function StudioClosing() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6" aria-labelledby="closing-title">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-[linear-gradient(160deg,#24124a,#160b2c_60%,#2a1020)] p-8 sm:p-12">
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[80%] -translate-x-1/2 rounded-full bg-[oklch(0.62_0.17_45/0.35)] blur-3xl" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl space-y-3">
            <h2 id="closing-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">See your free ads first. Then hire the team.</h2>
            <p className="text-muted-foreground">Free: {PUBLIC_OFFER.freeAds} ads from your website, no card. Like them? we put them live on Facebook and Instagram with you and email you the leads within minutes. You set one budget and read one email a week.</p>
            <p className="text-sm text-muted-foreground">{PUBLIC_OFFER.heroPlanName}: {PUBLIC_OFFER.heroPrice}/month founding price (regular {PUBLIC_OFFER.heroRegularPrice}), locked while you stay subscribed, renews monthly. Cancel anytime online. Ad spend is paid to Meta separately. {FOUNDING_SPOTS_LINE}</p>
            <p className="text-sm text-muted-foreground">Rather post them yourself? {PUBLIC_OFFER.diyName}: fresh ads every week and a coach, {PUBLIC_OFFER.diyFirstMonth} the first month within {PUBLIC_OFFER.launchWindowHours} hours of your free ads, then {PUBLIC_OFFER.diyPrice}/month.</p>
            <p className="text-xs text-muted-foreground">{ADS_GUARANTEE} {NO_GUARANTEE_LINE}</p>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
            <div className="-mb-2 hidden md:block"><StudioPose form="ascended" expression="happy" size={112} /></div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link href="/#studio-url" className="spellbar__cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-2xl px-6 font-semibold">Make my free ads</Link>
            <Link href="/ads/pricing" className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-2xl border border-border px-6 font-medium text-foreground transition-colors hover:bg-accent">See pricing</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
