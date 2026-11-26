"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ShieldCheck } from "lucide-react";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AUTOPILOT_FIRST_MONTH_LINE, AUTOPILOT_GUARANTEE_LINE, AUTOPILOT_LAUNCH_NOTE, AD_SPEND_LINE, DIY_STEP_DOWN, HERO_INCLUDES, NO_GUARANTEE_LINE, PUBLIC_OFFER } from "@/lib/ads/public-offer";
import { postOfferEvent } from "@/lib/ads/offer-client";
import { dismissedInSession, dismissInSession, firstInSession, noopSubscribe } from "@/lib/ads/offer-session";
import { AUTOPILOT_FIRST_MONTH_CENTS, AUTOPILOT_LAUNCH, LAUNCH_QUARTER } from "@/lib/ads/billing-config";

const PLACEMENT = "unlock_upsell";
const subscribeNone = noopSubscribe;
const readQuery = (): string => (typeof window === "undefined" ? "" : window.location.search);

/**
 * One-time upsell at the moment of the $9 purchase (checkout success lands on the unlocked pack with ?bought=unlock_pack):
 * "Want us to put these live in your Facebook for you?" with the first-month price + our-work guarantee. "Not now" closes it
 * and, only then, offers the do-it-yourself plan (different terms, you post the ads). The email link (?offer=autopilot)
 * reopens it. Server decides eligibility (useLaunchOffer autopilotLaunch); the parent only mounts this when it is true.
 */
export function UnlockUpsellModal({ runId, spotsLeft, stepDownOpen }: { runId: string; spotsLeft: number | null; stepDownOpen: boolean }) {
  const query = useSyncExternalStore(subscribeNone, readQuery, () => "");
  const params = new URLSearchParams(query);
  const fromEmail = params.get("offer") === "autopilot";
  const justBought = params.get("bought") === "unlock_pack";
  const dismissKey = `unlock_upsell:${runId}`;
  const dismissed = useSyncExternalStore(subscribeNone, () => dismissedInSession(dismissKey), () => true);
  const [phase, setPhase] = useState<"offer" | "stepdown" | "closed">("offer");
  const wanted = (justBought || fromEmail) && (fromEmail || !dismissed);
  const open = wanted && phase !== "closed";

  useEffect(() => {
    if (!open || phase !== "offer" || !firstInSession(`unlock_upsell_shown:${runId}`)) return;
    postOfferEvent("upsell_shown", { placement: PLACEMENT, offer: AUTOPILOT_LAUNCH.key, runId });
  }, [open, phase, runId]);

  function notNow() {
    dismissInSession(dismissKey);
    postOfferEvent("upsell_declined", { placement: PLACEMENT, offer: AUTOPILOT_LAUNCH.key, runId });
    if (stepDownOpen) {
      setPhase("stepdown");
      postOfferEvent("downsell_shown", { placement: "unlock_stepdown", offer: LAUNCH_QUARTER.key, runId });
    } else setPhase("closed");
  }
  function close() {
    dismissInSession(dismissKey);
    setPhase("closed");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? (phase === "offer" ? notNow() : close()) : undefined)}>
      <DialogContent className="max-w-md">
        {phase === "offer" ? (
          <>
            <DialogTitle>Want us to put these live in your Facebook for you?</DialogTitle>
            <DialogDescription>
              Your pack is unlocked. Growth Autopilot is done for you: {HERO_INCLUDES}.
            </DialogDescription>
            <div className="rounded-xl bg-primary/10 px-4 py-3">
              <p className="text-2xl font-semibold">{AUTOPILOT_FIRST_MONTH_LINE}</p>
              <p className="text-sm text-muted-foreground">{AUTOPILOT_LAUNCH_NOTE}</p>
              {spotsLeft !== null && <p className="mt-1 text-sm font-medium">{spotsLeft} of {PUBLIC_OFFER.foundingSpots} founding spots left.</p>}
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />{AUTOPILOT_GUARANTEE_LINE}</p>
            <p className="text-xs text-muted-foreground">{AD_SPEND_LINE} {NO_GUARANTEE_LINE}</p>
            <div onClickCapture={() => postOfferEvent("offer_clicked", { placement: PLACEMENT, offer: AUTOPILOT_LAUNCH.key, runId })}>
              <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "offer", key: AUTOPILOT_LAUNCH.key, placement: PLACEMENT }} label={`Start for $${AUTOPILOT_FIRST_MONTH_CENTS / 100}`} />
            </div>
            <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={notNow}>Not now</Button>
          </>
        ) : (
          <>
            <DialogTitle>{DIY_STEP_DOWN.headline}</DialogTitle>
            <DialogDescription>{DIY_STEP_DOWN.name}: {DIY_STEP_DOWN.terms}</DialogDescription>
            <p className="text-sm font-medium">{DIY_STEP_DOWN.priceLine}. Cancel anytime online.</p>
            <div onClickCapture={() => postOfferEvent("offer_clicked", { placement: "unlock_stepdown", offer: LAUNCH_QUARTER.key, runId })}>
              <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "offer", key: LAUNCH_QUARTER.key, placement: "downsell" }} label={`Start for ${DIY_STEP_DOWN.firstMonth}`} />
            </div>
            <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={close}>No thanks</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
