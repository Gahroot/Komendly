"use client";

import { Check, Clock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { LAUNCH_QUARTER, LAUNCH_QUARTER_GUARANTEE } from "@/lib/ads/billing-config";
import type { BonusSummary } from "@/lib/ads/bonus-access";
import { postOfferEvent, type OfferPlacement } from "@/lib/ads/offer-client";
import { formatCountdown, launchQuarterValueStack } from "@/lib/ads/offer-value";
import { track } from "@/lib/analytics/track";
import { LQ_STUDIO_LINE } from "@/lib/studio/bridge";

const usd = (cents: number) => `$${(cents / 100).toFixed(0)}`;

/** Live "Offer ends in 71h 12m" on server time; hidden when unknown. */
export function OfferCountdown({ remainingMs, className = "" }: { remainingMs: number | null; className?: string }) {
  const text = remainingMs === null ? "" : formatCountdown(remainingMs);
  if (!text) return null;
  return (
    <p className={`inline-flex items-center gap-1.5 text-xs font-medium tabular-nums ${className}`}>
      <Clock className="size-3.5" aria-hidden /> Launch price ends in {text}
    </p>
  );
}

/** Launch Quarter with its explicit value stack (all numbers from billing-config). */
export function LaunchQuarterCard({ placement, bonus, remainingMs, runId, className = "" }: {
  placement: OfferPlacement;
  bonus: BonusSummary | null;
  remainingMs: number | null;
  runId?: string;
  className?: string;
}) {
  return (
    <Card className={`glow-primary border-2 border-primary ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{LAUNCH_QUARTER.name}<Badge>Recommended</Badge></CardTitle>
        <CardDescription>
          <span className="text-3xl font-semibold text-foreground">{usd(LAUNCH_QUARTER.priceCents)}</span> every 3 months
          <span className="mt-1 block text-xs">Starter for 3 months, renews at {usd(LAUNCH_QUARTER.priceCents)} per quarter, cancel anytime</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2 text-sm">
          {[...launchQuarterValueStack(bonus), LQ_STUDIO_LINE].map((h) => <li key={h} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{h}</li>)}
        </ul>
        <OfferCountdown remainingMs={remainingMs} className="text-primary" />
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <div className="w-full" onClickCapture={() => postOfferEvent("offer_clicked", { placement, offer: LAUNCH_QUARTER.key, ...(runId ? { runId } : {}) })}>
          <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "offer", key: LAUNCH_QUARTER.key, placement }} label={bonus?.locked ? "Unlock with Launch Quarter" : "Get the Launch Quarter"} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />{LAUNCH_QUARTER_GUARANTEE}</p>
      </CardFooter>
    </Card>
  );
}

export function trackOfferView(placement: OfferPlacement, props: Record<string, string | number | boolean> = {}): void {
  track("upsell_view", { placement, ...props });
}
