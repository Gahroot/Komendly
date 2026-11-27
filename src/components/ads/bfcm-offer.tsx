"use client";

// Black Friday to Cyber Monday offer UI. The server decides what may be bought (getBfcmState / offer API) and the
// checkout re-checks the deadline; this only counts down to the fixed BFCM_ENDS_AT on server time and hides at 0.
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, CreditCard, ShieldCheck } from "lucide-react";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { ADS_GUARANTEE, AUTOPILOT_FOUNDING_SPOTS, UNLOCK_PACK } from "@/lib/ads/billing-config";
import { BFCM_DEADLINE_LINE, BFCM_UNLOCK_LINE, bfcmAnnualViews, CARD_SAVED_LINE, formatBfcmLeft, type BfcmState } from "@/lib/ads/bfcm";
import { AD_SPEND_LINE, AUTOPILOT_GUARANTEE_LINE, NO_GUARANTEE_LINE } from "@/lib/ads/public-offer";

/** Milliseconds left to `endsAt`, on the server's clock (serverNow - local now = offset). */
export function useBfcmRemaining(endsAt: string, serverNow: string): number {
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return Math.max(0, end - (now + offset));
}

function Deadline({ endsAt, serverNow }: { endsAt: string; serverNow: string }) {
  const left = useBfcmRemaining(endsAt, serverNow);
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-primary">
      <CalendarClock className="size-4" aria-hidden /> {BFCM_DEADLINE_LINE}
      {left > 0 && <span className="tabular-nums text-muted-foreground">({formatBfcmLeft(left)})</span>}
    </p>
  );
}

/** Public strip (pricing, /ads/start, landing): the deadline + one link. Hides itself at the deadline. */
export function BfcmBanner({ endsAt, serverNow, href, cta, text }: { endsAt: string; serverNow: string; href?: string; cta?: string; text: string }) {
  const left = useBfcmRemaining(endsAt, serverNow);
  if (left <= 0) return null;
  return (
    <aside aria-label="Black Friday offer" className="mx-auto my-4 flex w-full max-w-4xl flex-col gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="font-semibold">Black Friday to Cyber Monday</p>
        <p className="text-muted-foreground">{text}</p>
        <p className="tabular-nums text-xs font-medium text-primary">{BFCM_DEADLINE_LINE} ({formatBfcmLeft(left)})</p>
      </div>
      {href && cta && <Link href={href} className="shrink-0 rounded-lg bg-primary px-4 py-2 text-center font-semibold text-primary-foreground">{cta}</Link>}
    </aside>
  );
}

/**
 * The offer for a signed-in workspace. Step 1 = the $9 unlock with bonus credits (the small first payment, card saved);
 * step 2 = annual prepay (shown after the unlock, or straight away when there's no pack to unlock / `showAnnual`).
 */
export function BfcmOffer({ state, placement, showAnnual = false }: { state: BfcmState; placement: "bfcm_run" | "bfcm_page"; showAnnual?: boolean }) {
  const left = useBfcmRemaining(state.endsAt, state.serverNow);
  if (left <= 0) return null;
  const unlock = state.unlockAvailable;
  const annual = bfcmAnnualViews().filter((v) => state.annual.includes(v.plan));
  const annualOn = annual.length > 0 && (showAnnual || !unlock);
  if (!unlock && !annualOn) return null;
  return (
    <section aria-label="Black Friday offer" className="space-y-4 rounded-2xl border-2 border-primary bg-primary/5 p-4 sm:p-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Black Friday to Cyber Monday</p>
        <Deadline endsAt={state.endsAt} serverNow={state.serverNow} />
      </div>
      {unlock && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">{`Unlock the rest of your pack for $${UNLOCK_PACK.priceCents / 100}`}</h2>
          <p className="text-sm text-muted-foreground">{BFCM_UNLOCK_LINE}</p>
          <div className="sm:max-w-xs">
            <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "topup", key: UNLOCK_PACK.key, placement, promo: "bfcm" }} label={`Unlock my pack for $${UNLOCK_PACK.priceCents / 100}`} />
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><CreditCard className="mt-0.5 size-3.5 shrink-0" aria-hidden />{CARD_SAVED_LINE}</p>
        </div>
      )}
      {annualOn && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">{unlock ? "Or pay for the year at the Black Friday price" : "Pay for the year at the Black Friday price"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {annual.map((v) => (
              <div key={v.plan} className="flex flex-col gap-2 rounded-xl border bg-background p-4">
                <p className="font-semibold">{v.name}, yearly</p>
                <p className="text-2xl font-semibold">{v.price}<span className="text-sm font-normal text-muted-foreground"> for 12 months</span></p>
                <p className="text-sm text-muted-foreground">12 monthly payments would be {v.twelveMonthly}. You keep {v.saving}.</p>
                <ul className="space-y-1 text-sm">
                  {v.bonuses.map((b) => <li key={b} className="flex gap-1.5"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{b}</li>)}
                </ul>
                {v.plan === "autopilot" && state.spotsLeft !== null && <p className="text-sm font-medium">{state.spotsLeft} of {AUTOPILOT_FOUNDING_SPOTS} founding spots left.</p>}
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />{v.plan === "autopilot" ? AUTOPILOT_GUARANTEE_LINE : ADS_GUARANTEE}</p>
                <div className="mt-auto pt-1">
                  <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "plan", key: v.plan, interval: "year", placement, promo: "bfcm" }} label={`Get ${v.name} yearly for ${v.price}`} variant={v.plan === "autopilot" ? "default" : "outline"} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{AD_SPEND_LINE} {NO_GUARANTEE_LINE}</p>
        </div>
      )}
    </section>
  );
}
