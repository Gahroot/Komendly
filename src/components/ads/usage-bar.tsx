"use client";

import { Progress } from "@/components/ui/progress";
import { usageMeter } from "@/lib/ads/billing-config";

/** Usage bar for "Nx Starter" plans (no credit number). Returns null for credit-count plans so callers show the number. */
export function UsageBar({ plan, balance, className }: { plan: string; balance: number; className?: string }) {
  const m = usageMeter(plan, balance);
  if (!m) return null;
  return (
    <div className={className}>
      <Progress value={m.percentLeft} aria-label={m.label} />
      <p className="mt-1.5 text-xs text-muted-foreground">{m.label}</p>
    </div>
  );
}
