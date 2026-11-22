"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MIN_MONTHLY_LIMIT_MINOR, SUGGESTED_MONTHLY_LIMIT_MINOR, formatMoney } from "@/lib/ads/team/contracts";

export interface BudgetForm { monthlyLimit: string; zips: string; leadEmail: string; privacyUrl: string }

/** Service area, monthly limit, lead email, privacy link (plain words; prd.md §5 step 2). */
export function BudgetFields({ value, onChange, currency }: { value: BudgetForm; onChange: (v: BudgetForm) => void; currency: string }) {
  const set = (k: keyof BudgetForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-5">
      <div className="space-y-1.5">
        <Label htmlFor="team-zips">ZIP codes you serve</Label>
        <Textarea id="team-zips" rows={2} value={value.zips} onChange={set("zips")} placeholder="94110, 94114, 94131" inputMode="numeric" />
        <p className="text-xs text-muted-foreground">Your ads are shown to adults (18+) in these ZIP codes. Separate them with commas or spaces.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="team-limit">Monthly ad budget limit ({currency})</Label>
        <div className="flex items-center gap-2">
          <span className="text-lg text-muted-foreground" aria-hidden>$</span>
          <Input id="team-limit" className="max-w-40 tabular-nums" inputMode="decimal" value={value.monthlyLimit} onChange={set("monthlyLimit")} />
          <span className="text-sm text-muted-foreground">per month</span>
        </div>
        <p className="text-xs text-muted-foreground">
          We suggest {formatMoney(SUGGESTED_MONTHLY_LIMIT_MINOR)} (about $20 a day); the minimum is {formatMoney(MIN_MONTHLY_LIMIT_MINOR)} so Meta has enough to learn from.
          Meta charges this to your own card, separately from your Komendly plan. The team never spends more, and Meta enforces it too.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="team-email">Send leads to</Label>
        <Input id="team-email" type="email" autoComplete="email" value={value.leadEmail} onChange={set("leadEmail")} />
        <p className="text-xs text-muted-foreground">Every new lead lands here within a minute. We never contact your leads.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="team-privacy">Your privacy policy link (optional)</Label>
        <Input id="team-privacy" type="url" placeholder="https://yourbusiness.com/privacy" value={value.privacyUrl} onChange={set("privacyUrl")} />
        <p className="text-xs text-muted-foreground">Meta lead forms need one. No policy yet? We use <a className="text-primary underline-offset-4 hover:underline" href="/lead-privacy" target="_blank" rel="noreferrer">Komendly&apos;s lead notice</a>.</p>
      </div>
    </div>
  );
}

export function budgetBody(f: BudgetForm) {
  return { monthlyLimit: f.monthlyLimit, zips: f.zips, leadEmail: f.leadEmail, privacyUrl: f.privacyUrl.trim() || null };
}
