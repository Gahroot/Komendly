"use client";

import { useEffect } from "react";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { postOfferEvent, type OfferPlacement } from "@/lib/ads/offer-client";
import { firstInSession } from "@/lib/ads/offer-session";
import { AUTOPILOT_PLACEMENT, AUTOPILOT_PLAN_KEY, autopilotOfferCopy } from "@/lib/ads/roofer-offer";
import { AUTOPILOT_FIRST_MONTH_LINE, AUTOPILOT_GUARANTEE_LINE, AUTOPILOT_LAUNCH_NOTE } from "@/lib/ads/public-offer";
import { track } from "@/lib/analytics/track";
import { useExperiment } from "@/components/experiments/use-experiment";
import { trackOfferView } from "./launch-quarter-card";

/**
 * Main offer for roofer trial workspaces (src/lib/ads/roofer-offer.ts): Growth Autopilot, shown the moment the ads
 * are ready, before Ad Department and the $9 unlock. "No thanks" hands over to the downsell.
 * Events (server adds props.trade): upsell_shown / upsell_declined / offer_clicked with offer "autopilot";
 * checkout_started comes from the checkout route with placement "autopilot_offer".
 */
export function AutopilotOfferCard({ runId, placement = AUTOPILOT_PLACEMENT, spotsLeft = null, launch = false, onDecline, bare = false }: { runId: string; placement?: OfferPlacement; spotsLeft?: number | null; launch?: boolean; onDecline: () => void; bare?: boolean }) {
  const c = autopilotOfferCopy(spotsLeft);
  // Offer experiments (copy/ordering only). Exposure is recorded with upsell_shown below.
  const place = useExperiment("offer_card_guarantee_placement", false);
  const order = useExperiment("offer_card_objection_order", false);
  const guaranteeAbove = place.variant?.payload?.guaranteePlacement === "above_button";
  const features = order.variant?.payload?.order === "money_first" ? [c.features[2], c.features[3], ...c.features.filter((_, i) => i !== 2 && i !== 3)] : c.features;
  const expReady = place.ready && order.ready;
  useEffect(() => {
    if (!firstInSession(`autopilot_shown:${placement}:${runId}`)) return;
    trackOfferView(placement, { offer: AUTOPILOT_PLAN_KEY });
    postOfferEvent("upsell_shown", { placement, offer: AUTOPILOT_PLAN_KEY, runId });
  }, [placement, runId]);
  useEffect(() => {
    if (!expReady || !firstInSession(`autopilot_exp:${placement}:${runId}`)) return;
    for (const k of ["offer_card_guarantee_placement", "offer_card_objection_order"]) void fetch("/api/experiments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "exposure", key: k }), keepalive: true }).catch(() => undefined);
  }, [expReady, placement, runId]);

  function decline() {
    track("upsell_declined", { placement, offer: AUTOPILOT_PLAN_KEY });
    postOfferEvent("upsell_declined", { placement, offer: AUTOPILOT_PLAN_KEY, runId });
    onDecline();
  }

  const guarantee = <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />{AUTOPILOT_GUARANTEE_LINE}</p>;
  const body = (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-primary"><Sparkles className="size-4" aria-hidden /> We run it for you · founding offer</p>
        <h2 className="text-2xl font-semibold tracking-tight">{c.title}</h2>
        <p className="text-sm text-muted-foreground">{c.intro}</p>
      </div>
      <ul className="space-y-2 text-sm">
        {features.map((f) => <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{f}</li>)}
      </ul>
      <div className="rounded-xl bg-primary/10 px-4 py-3">
        <p className="text-3xl font-semibold">{launch ? AUTOPILOT_FIRST_MONTH_LINE : c.price}</p>
        <p className="text-sm text-muted-foreground">{launch ? `${AUTOPILOT_LAUNCH_NOTE} ` : ""}{c.priceNote}</p>
        <p className="mt-1 text-sm font-medium">{c.scarcity}</p>
      </div>
      <div className="space-y-2">
        {guaranteeAbove && guarantee}
        <div onClickCapture={() => postOfferEvent("offer_clicked", { placement, offer: AUTOPILOT_PLAN_KEY, runId })}>
          <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "plan", key: AUTOPILOT_PLAN_KEY, placement: AUTOPILOT_PLACEMENT }} label={c.cta} />
        </div>
        {!guaranteeAbove && guarantee}
        <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={decline}>No thanks, I&apos;ll post them myself</Button>
      </div>
    </div>
  );
  if (bare) return body;
  return (
    <section className="glow-primary rounded-2xl border-2 border-primary bg-primary/5 p-4 sm:p-6" aria-label="Growth Autopilot founding offer">
      {body}
    </section>
  );
}
