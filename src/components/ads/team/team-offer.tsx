import { Check, ShieldCheck } from "lucide-react";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTOPILOT_FIRST_MONTH_LINE, AUTOPILOT_GUARANTEE_LINE, AUTOPILOT_LAUNCH_NOTE } from "@/lib/ads/public-offer";
import { AUTOPILOT_DISPLAY_NAME, AUTOPILOT_FOUNDING_LINE, AUTOPILOT_FULL_MESSAGE, AUTOPILOT_PLAN_NAME, AUTOPILOT_PRICE_LOCK } from "@/lib/ads/billing-config";
import { TEAM_ROLES } from "@/lib/ads/team/contracts";
import { roleNextStep } from "@/lib/ads/team/rules";
import type { TeamRole } from "@/lib/ads/team/contracts";
import { OzzyImg, ROLE_OZZY } from "./team-bits";

export interface TeamOfferProps {
  /** Growth Autopilot founding price (locked while subscribed). */
  priceLabel: string;
  /** Standard price, shown as the regular price. */
  regularPriceLabel: string;
  /** No founding spots left: a waitlist line replaces the button. */
  spotsFull: boolean;
  checkout: { kind: "plan" | "offer"; key: string } | null;
  /** Already on another paid plan: switch in the billing portal instead of a new checkout. */
  switchInPortal: boolean;
  blockedReason: string | null;
  /** Server says the $97 first-month launch offer is open for this workspace. */
  launch?: boolean;
}

const WHAT_YOU_DO = ["Connect Meta with us when you join (Facebook and Instagram): we set it up together.", "Set a monthly ad budget limit.", "Read one email a week and call the leads we send you."];

export function TeamOffer({ priceLabel, regularPriceLabel, spotsFull, checkout, switchInPortal, blockedReason, launch = false }: TeamOfferProps) {
  return (
    <div className="space-y-8">
      <section className="studio-rise flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <OzzyImg src="/brand/ozzy-joyful-happy.png" size={112} />
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--studio-gold)]">{AUTOPILOT_DISPLAY_NAME} · {AUTOPILOT_PLAN_NAME}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">A steady flow of customers asking for quotes, without you running Facebook ads.</h1>
          <p className="max-w-2xl text-muted-foreground">We make your ads from your own website, put them on Facebook and Instagram with you, pause the ones that waste money every day and email every new lead to you within minutes. You set one budget; spend never goes over it.</p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(TEAM_ROLES) as TeamRole[]).map((r) => (
          <Card key={r} className="gap-3 py-4">
            <CardContent className="flex items-start gap-3 px-4">
              <OzzyImg src={ROLE_OZZY[r]} size={48} />
              <div>
                <p className="text-sm font-semibold">{TEAM_ROLES[r].label}</p>
                <p className="text-sm text-muted-foreground">{((t) => t.charAt(0).toUpperCase() + t.slice(1))(roleNextStep(r, null).replace(/^Next: /, ""))}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glow-primary border-2 border-primary">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            Have us run your ads: {priceLabel}/month <span className="text-base font-normal text-muted-foreground">founding price (regular <s>{regularPriceLabel}</s>)</span>
          </CardTitle>
          {launch ? <p className="text-sm font-medium">{AUTOPILOT_FIRST_MONTH_LINE}. {AUTOPILOT_LAUNCH_NOTE}</p> : null}
          <p className="text-sm text-[var(--studio-gold)]">{AUTOPILOT_PRICE_LOCK} {AUTOPILOT_FOUNDING_LINE}</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="font-medium">What you do</p>
          <ul className="space-y-2">{WHAT_YOU_DO.map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{t}</li>)}</ul>
          <p className="text-muted-foreground">Your ad spend is paid by you directly to Meta on your own card. It is separate from this subscription, and Ozzy can never spend more than the monthly limit you set. Results are not guaranteed.</p>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          {blockedReason ? <p role="status" className="text-sm text-muted-foreground">{blockedReason}</p>
            : spotsFull ? <p role="status" className="text-sm font-medium">{AUTOPILOT_FULL_MESSAGE}</p>
            : switchInPortal ? <BillingActionButton endpoint="/api/ads-billing/portal" label={`Switch to ${AUTOPILOT_PLAN_NAME}`} />
            : checkout ? <BillingActionButton endpoint="/api/ads-billing/checkout" body={checkout} label={`Have us run your ads for ${priceLabel}/month`} />
            : <p className="text-sm text-muted-foreground">Checkout isn&apos;t available right now. Please try again later.</p>}
          <p className="text-xs text-muted-foreground">
            {priceLabel} every month until you cancel. Cancel any time under Billing, Manage subscription. Ad spend is paid to Meta separately.
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />{AUTOPILOT_GUARANTEE_LINE}</p>
        </CardFooter>
      </Card>
    </div>
  );
}
