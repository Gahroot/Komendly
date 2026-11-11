"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { ADS_GUARANTEE, getPlan, getTopup, UNLOCK_PACK } from "@/lib/ads/billing-config";
import { postOfferEvent } from "@/lib/ads/offer-client";
import { track } from "@/lib/analytics/track";

/**
 * Shown after a canceled plan checkout: Starter monthly first; if Starter was the one declined, a one-time pack.
 * The one-time pack is the $9 "Unlock this pack" when the user has locked bonus ads (`unlockPack`), else 10 credits.
 */
export function CheckoutDownsell({ declined, unlockPack = false }: { declined: string; unlockPack?: boolean }) {
  const starter = getPlan("starter");
  const pack = unlockPack ? UNLOCK_PACK : getTopup("topup_10");
  const step = declined === "starter" ? "topup" : "starter";
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track("downsell_view", { declined, offer: step });
    postOfferEvent("downsell_shown", { declined, offer: step, ...(step === "topup" && pack ? { pack: pack.key } : {}) });
  }, [declined, step, pack]);
  if (!starter || !pack) return null;
  return (
    <Card className="border-primary/60">
      <CardHeader>
        <CardTitle>{step === "starter" ? "Not ready for that? Start smaller." : "No subscription? Just buy the ads."}</CardTitle>
        <CardDescription>
          {step === "starter"
            ? `${starter.name}: $${starter.priceCents / 100}/month for ${starter.monthlyCredits} credits. Monthly, cancel anytime.`
            : unlockPack
              ? `Unlock every bonus ad Ozzy made for you, plus ${pack.credits} credits for new ones. $${pack.priceCents / 100}, paid once.`
              : `${pack.credits} credits for $${pack.priceCents / 100}, paid once. They never expire.`}
        </CardDescription>
      </CardHeader>
      {step === "starter" && <CardContent className="text-xs text-muted-foreground">{ADS_GUARANTEE}</CardContent>}
      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        {step === "starter" ? (
          <>
            <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "plan", key: "starter", placement: "downsell" }} label={`Start ${starter.name} for $${starter.priceCents / 100}`} />
            <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "topup", key: pack.key, placement: "downsell" }} label={unlockPack ? `Or unlock this pack for $${pack.priceCents / 100}` : `Or ${pack.credits} credits once for $${pack.priceCents / 100}`} variant="outline" />
          </>
        ) : (
          <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "topup", key: pack.key, placement: "downsell" }} label={unlockPack ? `Unlock this pack for $${pack.priceCents / 100}` : `Buy ${pack.credits} credits for $${pack.priceCents / 100}`} />
        )}
      </CardFooter>
    </Card>
  );
}
