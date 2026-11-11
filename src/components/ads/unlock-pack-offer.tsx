"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Lock, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { ADS_GUARANTEE, getPlan, UNLOCK_PACK } from "@/lib/ads/billing-config";
import { bonusLabel, type BonusSummary } from "@/lib/ads/bonus-access";
import { postOfferEvent } from "@/lib/ads/offer-client";
import { dismissedInSession, dismissInSession, firstInSession, noopSubscribe } from "@/lib/ads/offer-session";
import { trackOfferView } from "./launch-quarter-card";

const usd = (cents: number) => `$${(cents / 100).toFixed(0)}`;

/** $9 downsell on a trial run: shown only after the Launch Quarter is dismissed or closed, while bonus ads are locked. */
export function UnlockPackCard({ runId, bonus }: { runId: string; bonus: BonusSummary }) {
  const key = `unlock_pack:${runId}`;
  const stored = useSyncExternalStore(noopSubscribe, () => dismissedInSession(key), () => true);
  const [closed, setClosed] = useState(false);
  const hidden = stored || closed;
  useEffect(() => {
    if (hidden || !firstInSession(`unlock_pack_shown:${runId}`)) return;
    trackOfferView("unlock_pack");
    postOfferEvent("downsell_shown", { placement: "unlock_pack", offer: UNLOCK_PACK.key, runId });
  }, [hidden, runId]);
  if (hidden) return null;

  function dismiss() {
    dismissInSession(key);
    setClosed(true);
    postOfferEvent("offer_dismissed", { placement: "unlock_pack", runId });
  }

  return (
    <aside className="relative rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5" aria-label="Unlock this pack">
      <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-2 size-7" onClick={dismiss} aria-label="Hide">
        <X className="size-4" />
      </Button>
      <div className="flex flex-col gap-4 pr-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold"><Lock className="size-4 text-primary" aria-hidden /> Your {bonusLabel(bonus)} {bonus.stories + bonus.videos + (bonus.fresh ?? 0) === 1 ? "is" : "are"} waiting</p>
          <p className="text-sm text-muted-foreground">Unlock the whole pack for {usd(UNLOCK_PACK.priceCents)}, once. You also get {UNLOCK_PACK.credits} credits for {UNLOCK_PACK.credits} brand-new ads. No subscription.</p>
        </div>
        <div className="w-full shrink-0 sm:w-56" onClickCapture={() => postOfferEvent("offer_clicked", { placement: "unlock_pack", offer: UNLOCK_PACK.key, runId })}>
          <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "topup", key: UNLOCK_PACK.key, placement: "unlock_pack" }} label={`Unlock this pack for ${usd(UNLOCK_PACK.priceCents)}`} />
        </div>
      </div>
    </aside>
  );
}

/** Success view after the $9 unlock: the next step is Starter with the $9 taken off the first month. */
export function UnlockPackNext({ couponReady }: { couponReady: boolean }) {
  const starter = getPlan("starter");
  useEffect(() => {
    if (!firstInSession("unlock_pack_next_shown")) return;
    trackOfferView("unlock_pack_next");
    postOfferEvent("upsell_shown", { placement: "unlock_pack_next", credited: couponReady });
  }, [couponReady]);
  if (!starter) return null;
  const first = starter.priceCents - (couponReady ? UNLOCK_PACK.priceCents : 0);
  return (
    <Card className="glow-primary border-2 border-primary">
      <CardHeader>
        <CardDescription className="flex items-center gap-2"><Sparkles className="size-4 text-primary" aria-hidden /> Your pack is unlocked. Go grab your ads.</CardDescription>
        <CardTitle className="text-2xl">Want ads like these every month?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          {starter.name} gives you {starter.monthlyCredits} fresh ads a month, in every size.
          {couponReady ? ` Your ${usd(UNLOCK_PACK.priceCents)} counts toward it: your first month is ${usd(first)} instead of ${usd(starter.priceCents)}.` : ` ${usd(starter.priceCents)} a month, cancel anytime.`}
        </p>
        <p className="text-xs">{ADS_GUARANTEE}</p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "plan", key: starter.key, placement: "unlock_pack_next" }} label={`Start ${starter.name} for ${usd(first)}`} />
        <Button asChild variant="outline"><Link href="/ads/app">See my unlocked ads</Link></Button>
      </CardFooter>
    </Card>
  );
}
