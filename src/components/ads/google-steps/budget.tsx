"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, monthlyEstimate, parseMoney } from "./logic";

export function BudgetStep({
  budget, onBudget, currency, min, campaigns,
}: {
  budget: string;
  onBudget: (v: string) => void;
  currency: string;
  min: number;
  campaigns: number;
}) {
  const daily = parseMoney(budget);
  const valid = Number.isFinite(daily) && daily > 0;
  const tooLow = valid && daily < min;
  const month = monthlyEstimate(valid ? daily : 0, campaigns);
  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-1.5">
        <Label htmlFor="google-budget">How much per day? ({currency})</Label>
        <Input id="google-budget" inputMode="decimal" className="sm:w-40" value={budget} aria-invalid={budget !== "" && (!valid || tooLow)} aria-describedby="google-budget-help"
          onChange={(e) => onBudget(e.target.value.replace(/[^\d.,]/g, ""))} />
        <p id="google-budget-help" className={`text-xs ${tooLow || (budget !== "" && !valid) ? "text-destructive" : "text-muted-foreground"}`}>
          {tooLow ? `The lowest you can set is ${formatMoney(min, currency)} a day.` : budget !== "" && !valid ? "Enter an amount, like 20." : `At least ${formatMoney(min, currency)} a day.`}
        </p>
      </div>
      <div className="min-h-16 rounded-md border border-border bg-card/50 px-3 py-2" aria-live="polite">
        {campaigns > 1 ? (
          <p>You&apos;re making {campaigns} campaigns (search ads and image ads). Each gets this daily amount, so up to <span className="font-medium">{formatMoney(valid ? daily * campaigns : 0, currency)} a day</span> in total.</p>
        ) : (
          <p>Up to <span className="font-medium">{formatMoney(valid ? daily : 0, currency)} a day</span>.</p>
        )}
        <p>That&apos;s about <span className="font-medium">{formatMoney(month, currency)} a month</span> at most.</p>
      </div>
      <p className="text-muted-foreground">Google charges your card directly, not Komendly. Nothing is spent until you start the ads, and you can pause any time.</p>
    </div>
  );
}
