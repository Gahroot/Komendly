"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { ADS_GUARANTEE, getPlan, LAUNCH_QUARTER_GUARANTEE } from "@/lib/ads/billing-config";
import type { BonusSummary } from "@/lib/ads/bonus-access";
import { postOfferEvent } from "@/lib/ads/offer-client";
import { dismissedInSession, dismissInSession, firstInSession, noopSubscribe } from "@/lib/ads/offer-session";
import { track } from "@/lib/analytics/track";
import { LaunchQuarterCard } from "./launch-quarter-card";
import { LQ_STUDIO_LINE } from "@/lib/studio/bridge";

const usd = (cents: number) => `$${(cents / 100).toFixed(0)}`;

/**
 * Menu upsell when the trial run is done: Starter fallback, Ozzy Ad Department recommended (first month $97 inside the
 * 72h window, value stack + live countdown), Agency anchor. "Shown" is recorded once per run per browser session (it used to fire on every visit).
 */
export function TrialUpsell({ runId, bonus, offerOpen, remainingMs, onDecline, valueLine = null }: { valueLine?: string | null; runId: string; bonus: BonusSummary | null; offerOpen: boolean; remainingMs: number | null; onDecline?: () => void }) {
  const stored = useSyncExternalStore(noopSubscribe, () => dismissedInSession(`trial_done:${runId}`), () => false);
  const [closed, setHidden] = useState(false);
  const hidden = stored || closed;
  const open = offerOpen;
  useEffect(() => {
    if (hidden || !firstInSession(`trial_done_shown:${runId}`)) return;
    track("upsell_view", { placement: "trial_done", launch_offer: open });
    postOfferEvent("upsell_shown", { placement: "trial_done", launchOffer: open, runId, locked: Boolean(bonus?.locked) });
  }, [hidden, open, runId, bonus?.locked]);

  const hero = getPlan("ad_department");
  const agency = getPlan("agency");
  const starter = getPlan("starter");
  if (hidden || !hero || !agency || !starter) return null;

  function decline() {
    track("upsell_declined", { placement: "trial_done" });
    postOfferEvent("upsell_declined", { placement: "trial_done", runId });
    dismissInSession(`trial_done:${runId}`);
    setHidden(true);
    onDecline?.();
  }

  const body = (kind: "plan" | "offer", key: string) => ({ kind, key, placement: "trial_upsell" as const });

  return (
    <section className="space-y-4" aria-labelledby="upsell-title">
      {valueLine && <p className="text-sm text-muted-foreground">{valueLine}</p>}
      <div className="space-y-1">
        <h2 id="upsell-title" className="text-2xl font-semibold tracking-tight">Your ads are ready. Want me on your team?</h2>
        <p className="text-sm text-muted-foreground">Your AI ad department: fresh ads every Monday, a coach that tells you what&apos;s working, 30-day no-questions refund.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{starter.name}</CardTitle>
            <CardDescription><span className="text-3xl font-semibold text-foreground">{usd(starter.priceCents)}</span> / month</CardDescription>
          </CardHeader>
          <CardContent><Highlights items={starter.highlights} /></CardContent>
          <CardFooter><BillingActionButton endpoint="/api/ads-billing/checkout" body={body("plan", "starter")} label={`Choose ${starter.name}`} variant="outline" /></CardFooter>
        </Card>

        {open ? (
          <LaunchQuarterCard placement="trial_done" bonus={bonus} remainingMs={remainingMs} runId={runId} className="md:-my-2" />
        ) : (
          <Card className="glow-primary border-2 border-primary md:-my-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">{hero.name}<Badge>Founding · Unlimited</Badge></CardTitle>
              <CardDescription><span className="text-3xl font-semibold text-foreground">{usd(hero.priceCents)}</span> / month</CardDescription>
            </CardHeader>
            <CardContent><Highlights items={hero.highlights} /></CardContent>
            <CardFooter><BillingActionButton endpoint="/api/ads-billing/checkout" body={body("plan", "ad_department")} label={`Choose ${hero.name}`} /></CardFooter>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{agency.name}</CardTitle>
            <CardDescription><span className="text-3xl font-semibold text-foreground">{usd(agency.priceCents)}</span> / month · for agencies</CardDescription>
          </CardHeader>
          <CardContent><Highlights items={agency.highlights} /></CardContent>
          <CardFooter><BillingActionButton endpoint="/api/ads-billing/checkout" body={body("plan", "agency")} label={`Choose ${agency.name}`} variant="outline" /></CardFooter>
        </Card>
      </div>
      <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        {open ? LAUNCH_QUARTER_GUARANTEE : ADS_GUARANTEE}
      </p>
      <p className="text-center text-sm">
        <Link href="/ads/billing" className="text-muted-foreground underline-offset-4 hover:underline">All plans and one-time credit packs</Link>
        <span className="text-muted-foreground"> · </span>
        <button type="button" onClick={decline} className="text-muted-foreground underline-offset-4 hover:underline">No thanks</button>
      </p>
    </section>
  );
}

function Highlights({ items }: { items: string[] }) {
  return <ul className="space-y-2 text-sm">{[...items, LQ_STUDIO_LINE].map((h) => <li key={h} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{h}</li>)}</ul>;
}
