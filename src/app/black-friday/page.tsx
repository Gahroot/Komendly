import type { Metadata } from "next";
import { Check, ShieldCheck } from "lucide-react";
import { DeviceCookie } from "@/components/ads/device-cookie";
import { FreeAdsUrlForm } from "@/components/ads/free-ads-url-form";
import { BfcmBanner } from "@/components/ads/bfcm-offer";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";
import { ADS_GUARANTEE, AUTOPILOT_FOUNDING_SPOTS, UNLOCK_PACK } from "@/lib/ads/billing-config";
import { BFCM_DEADLINE_LINE, BFCM_ENDS_AT, BFCM_UNLOCK_BONUS_CREDITS, bfcmAnnualViews, isBfcmActive } from "@/lib/ads/bfcm";
import { FREE_TRIAL_ADS } from "@/lib/ads/bonus-access";
import { foundingSpotsLeft } from "@/lib/ads/founding-spots";
import { AD_SPEND_LINE, AUTOPILOT_GUARANTEE_LINE, NO_GUARANTEE_LINE } from "@/lib/ads/public-offer";
import { prisma } from "@/lib/prisma";

// Paid-traffic landing page for Black Friday to Cyber Monday 2026 (Meta ads, optimised for Purchase). One CTA: paste
// your website, get the free pack; the offer comes after, inside the product. Public, no session read. Re-rendered every
// 60 s (and short-cached in next.config.ts), so after the deadline (src/lib/ads/bfcm.ts) the offer section is gone by
// itself; the client strip also hides at 0 and the checkout refuses promo=bfcm. Not in the sitemap, noindex (time-limited).
export const revalidate = 60;

export const metadata: Metadata = {
  title: `Black Friday: ${FREE_TRIAL_ADS} free ads from your website`,
  description: `Paste your website and get ${FREE_TRIAL_ADS} ready-to-post ads free, no card. Black Friday to Cyber Monday prices on what comes next.`,
  alternates: { canonical: "/black-friday" },
  robots: { index: false, follow: true },
};

export default async function BlackFridayPage() {
  const now = new Date();
  const active = isBfcmActive(now);
  const spotsLeft = active ? await foundingSpotsLeft(prisma).catch(() => null) : null;
  const annual = bfcmAnnualViews().filter((v) => v.plan !== "autopilot" || spotsLeft !== 0);
  const unlockCredits = UNLOCK_PACK.credits + BFCM_UNLOCK_BONUS_CREDITS;
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <DeviceCookie />
      <TrackOnMount event="landing_view" params={{ page: "black_friday" }} />
      <StudioNav signedIn={false} minimal />
      <main>
        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-12 pt-4 text-center sm:px-6 sm:pt-14" aria-labelledby="bf-title">
          {active && (
            <p className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.1em] text-[var(--studio-gold)]">
              Black Friday to Cyber Monday
            </p>
          )}
          <h1 id="bf-title" className="font-display mt-3 text-balance text-[2.4rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-6xl">
            Paste your website. Get {FREE_TRIAL_ADS} ads for your business, free.
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-lg text-foreground/90 sm:text-xl">
            Made from your own logo, colors and words in minutes. No card needed.
          </p>
          <div id="start" className="mt-6 w-full max-w-2xl"><FreeAdsUrlForm id="bf-hero" cta={`Get my ${FREE_TRIAL_ADS} free ads`} /></div>
          {active && <BfcmBanner endsAt={BFCM_ENDS_AT.toISOString()} serverNow={now.toISOString()} text={`After your free ads: the rest of your pack for $${UNLOCK_PACK.priceCents / 100}, with ${unlockCredits} credits for new ads (normally ${UNLOCK_PACK.credits}).`} />}
        </section>

        {active && (
          <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="bf-offer">
            <h2 id="bf-offer" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Then, until Monday night only</h2>
            <p className="mt-2 text-lg text-foreground/90">{BFCM_DEADLINE_LINE}</p>
            <ol className="mt-6 space-y-4">
              <li className="rounded-xl border border-border p-4 sm:p-5">
                <p className="text-xl font-semibold">1. Unlock your whole pack: ${UNLOCK_PACK.priceCents / 100}, once</p>
                <p className="mt-1 text-foreground/90">The rest of your pack, plus {unlockCredits} credits for {unlockCredits} brand-new ads (normally {UNLOCK_PACK.credits}). No subscription.</p>
              </li>
              {annual.map((v, i) => (
                <li key={v.plan} className="rounded-xl border border-border p-4 sm:p-5">
                  <p className="text-xl font-semibold">{i + 2}. {v.name} for a year: {v.price}</p>
                  <p className="mt-1 text-foreground/90">12 monthly payments would be {v.twelveMonthly}. You keep {v.saving}.</p>
                  <ul className="mt-2 space-y-1">
                    {v.bonuses.map((b) => <li key={b} className="flex gap-2"><Check aria-hidden className="mt-1 size-4 shrink-0 text-[var(--studio-gold)]" />{b}</li>)}
                  </ul>
                  {v.plan === "autopilot" && spotsLeft !== null && <p className="mt-2 font-medium">{spotsLeft} of {AUTOPILOT_FOUNDING_SPOTS} founding spots left.</p>}
                  <p className="mt-2 flex items-start gap-2 text-sm text-foreground/80"><ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />{v.plan === "autopilot" ? AUTOPILOT_GUARANTEE_LINE : ADS_GUARANTEE}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-foreground/80">{AD_SPEND_LINE} {NO_GUARANTEE_LINE}</p>
            <div className="mt-8 flex justify-center"><a href="#start" className="rounded-xl bg-[var(--studio-gold)] px-6 py-3 text-lg font-semibold text-[#2a0f10]">Start with my {FREE_TRIAL_ADS} free ads</a></div>
          </section>
        )}
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
