import { Check, ShieldCheck } from "lucide-react";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TEAM_ROLES } from "@/lib/ads/team/contracts";
import { roleNextStep } from "@/lib/ads/team/rules";
import type { TeamRole } from "@/lib/ads/team/contracts";
import { OzzyImg, ROLE_OZZY } from "./team-bits";

export interface TeamOfferProps {
  priceLabel: string;
  /** Founding first month, when the launch coupon applies to this workspace. */
  firstMonthLabel: string | null;
  checkout: { kind: "plan" | "offer"; key: string } | null;
  /** Already on another paid plan: switch in the billing portal instead of a new checkout. */
  switchInPortal: boolean;
  blockedReason: string | null;
}

const WHAT_YOU_DO = ["Connect Meta once (Facebook and Instagram).", "Set a monthly ad budget limit.", "Call the leads Ozzy sends you."];

export function TeamOffer({ priceLabel, firstMonthLabel, checkout, switchInPortal, blockedReason }: TeamOfferProps) {
  return (
    <div className="space-y-8">
      <section className="studio-rise flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <OzzyImg src="/brand/ozzy-joyful-happy.png" size={112} />
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--studio-gold)]">Ozzy&apos;s AI marketing team</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">You run your business. Ozzy runs your marketing.</h1>
          <p className="max-w-2xl text-muted-foreground">The team makes your ads, puts them on Facebook and Instagram, checks them every day and sends every new lead to your inbox. You set the monthly limit; they never go over it.</p>
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
            {firstMonthLabel ? <>Hire the team: {firstMonthLabel} for the first month, then {priceLabel}/month</> : <>Hire the team: {priceLabel}/month</>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="font-medium">What you do</p>
          <ul className="space-y-2">{WHAT_YOU_DO.map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{t}</li>)}</ul>
          <p className="text-muted-foreground">Your ad spend is paid by you directly to Meta on your own card. It is separate from this subscription, and Ozzy can never spend more than the monthly limit you set. Results are not guaranteed.</p>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          {blockedReason ? <p role="status" className="text-sm text-muted-foreground">{blockedReason}</p>
            : switchInPortal ? <BillingActionButton endpoint="/api/ads-billing/portal" label="Switch to Ozzy Ad Department" />
            : checkout ? <BillingActionButton endpoint="/api/ads-billing/checkout" body={checkout} label={firstMonthLabel ? `Hire the team for ${firstMonthLabel}` : "Hire the team"} />
            : <p className="text-sm text-muted-foreground">Checkout isn&apos;t available right now. Please try again later.</p>}
          <p className="text-xs text-muted-foreground">
            {firstMonthLabel ? `${firstMonthLabel} today, then ${priceLabel} every month` : `${priceLabel} every month`} until you cancel. Cancel any time in one click under Billing, Manage subscription.
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />Not happy in the first 30 days? Refund yourself in one click on the billing page.</p>
        </CardFooter>
      </Card>
    </div>
  );
}
