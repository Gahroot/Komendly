"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CalendarClock, Film, ShieldCheck, Smartphone, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { AUTOPILOT_FOUNDING_LINE, getPlan, LAUNCH_QUARTER, LAUNCH_QUARTER_GUARANTEE, offerFirstPaymentCents } from "@/lib/ads/billing-config";
import { checkoutTerms } from "@/lib/ads/public-offer";
import type { BonusSummary } from "@/lib/ads/bonus-access";
import { postOfferEvent } from "@/lib/ads/offer-client";
import { firstInSession } from "@/lib/ads/offer-session";
import { OfferCountdown, trackOfferView } from "./launch-quarter-card";

const usd = (cents: number) => `$${(cents / 100).toFixed(0)}`;

/**
 * The real, buyable Launch Quarter as soon as the trial has its first ready ads (placement early_offer), shown right
 * under the gallery while the rest keeps rendering. Non-blocking, dismissible; dismissing hands over to the downsell.
 */
export function OfferNudge({ runId, ready, bonus, remainingMs, onDismiss, valueLine = null }: { valueLine?: string | null; runId: string; ready: number; bonus: BonusSummary | null; remainingMs: number | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!firstInSession(`early_offer_shown:${runId}`)) return;
    trackOfferView("early_offer", { ready });
    postOfferEvent("offer_nudge_shown", { placement: "early_offer", runId, ready, offer: LAUNCH_QUARTER.key });
  }, [runId, ready]);
  const hero = getPlan(LAUNCH_QUARTER.plan);
  const autopilot = getPlan("autopilot");
  if (!hero) return null;
  const today = usd(offerFirstPaymentCents(LAUNCH_QUARTER));

  function dismiss() {
    postOfferEvent("offer_dismissed", { placement: "early_offer", runId });
    onDismiss();
  }

  return (
    <div className="space-y-2">
    {valueLine && <p className="text-sm text-muted-foreground">{valueLine}</p>}
    <aside className="glow-primary relative rounded-2xl border-2 border-primary bg-primary/5 p-4 sm:p-6" aria-label="Keep these coming">
      <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-2 size-7" onClick={dismiss} aria-label="Not now">
        <X className="size-4" />
      </Button>
      <div className="space-y-4 pr-8">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Sparkles className="size-5 text-primary" aria-hidden /> Want a fresh set of ads every week, without the work?</p>
          <p className="text-sm text-muted-foreground">
            You just got {ready} {ready === 1 ? "ad" : "ads"} made from your own website, and Ozzy is still making the rest. {hero.name} is the do-it-yourself option: 6 new ads every Monday so your ads never go stale, and a coach that tells you what&apos;s working. First month {today}, then {usd(hero.priceCents)}/month.
          </p>
        </div>
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
          You post them yourself. Prefer to do nothing? We can run them for you instead.
        </p>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li className="flex items-start gap-2"><CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />6 fresh ads every Monday</li>
          <li className="flex items-start gap-2"><Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />{hero.usageMultiple ?? 20}x Starter usage</li>
          <li className="flex items-start gap-2"><Film className="mt-0.5 size-4 shrink-0 text-primary" />{bonus?.locked ? "Unlocks your bonus ads too" : "Animated ads included"}</li>
        </ul>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <OfferCountdown remainingMs={remainingMs} className="text-primary" />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />{LAUNCH_QUARTER_GUARANTEE}</p>
          </div>
          <div className="w-full shrink-0 sm:w-64" onClickCapture={() => postOfferEvent("offer_clicked", { placement: "early_offer", offer: LAUNCH_QUARTER.key, runId })}>
            <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "offer", key: LAUNCH_QUARTER.key, placement: "early_offer" }} label={`Start for ${today}`} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{checkoutTerms(hero, { firstPaymentCents: offerFirstPaymentCents(LAUNCH_QUARTER) })} You post the ads yourself.</p>
        <p className="text-xs text-muted-foreground">
          {autopilot ? <>Rather have Ozzy&apos;s team run your Facebook and Instagram lead ads? {autopilot.name}, {usd(autopilot.priceCents)}/month founding price. {AUTOPILOT_FOUNDING_LINE}{" "}</> : null}
          <Link href="/ads/pricing" target="_blank" className="underline underline-offset-4" onClick={() => postOfferEvent("offer_clicked", { placement: "early_offer", runId, target: "pricing" })}>See all plans</Link>
        </p>
      </div>
    </aside>
    </div>
  );
}
