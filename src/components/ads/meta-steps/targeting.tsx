"use client";

import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PublishGoal } from "@/lib/ads/meta/core/publish";
import { GOAL_OPTIONS, MAX_COUNTRIES, META_COUNTRIES } from "@/lib/ads/meta/publish-options";

export function TargetingStep({
  countries, onCountries, budget, onBudget, currency, goal, onGoal,
}: {
  countries: string[];
  onCountries: (c: string[]) => void;
  budget: string;
  onBudget: (b: string) => void;
  currency: string;
  goal: PublishGoal;
  onGoal: (g: PublishGoal) => void;
}) {
  const name = (code: string) => META_COUNTRIES.find((c) => c.code === code)?.name ?? code;
  const addable = META_COUNTRIES.filter((c) => !countries.includes(c.code));
  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-1.5">
        <Label htmlFor="meta-country-add">Where are your customers?</Label>
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen countries">
          {countries.map((c) => (
            <li key={c} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
              {name(c)}
              <button type="button" className="rounded-full hover:text-destructive disabled:opacity-40" onClick={() => onCountries(countries.filter((x) => x !== c))}
                disabled={countries.length === 1} aria-label={`Remove ${name(c)}`}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        {countries.length < MAX_COUNTRIES && (
          <Select value="" onValueChange={(v) => onCountries([...countries, v])}>
            <SelectTrigger id="meta-country-add" className="w-full sm:w-64"><SelectValue placeholder="Add a country" /></SelectTrigger>
            <SelectContent>
              {addable.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">Meta finds the right people in these countries for you.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meta-budget">Daily budget per ad set ({currency})</Label>
        <Input id="meta-budget" inputMode="decimal" className="sm:w-40" value={budget} onChange={(e) => onBudget(e.target.value.replace(/[^\d.]/g, ""))} />
        <p className="text-xs text-muted-foreground">$10 to $20 a day is a good start. Nothing spends until you turn the ads on.</p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 font-medium">What do you want people to do?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {GOAL_OPTIONS.map((g) => (
            <label key={g.value} className={`flex cursor-pointer gap-2 rounded-md border px-3 py-2 ${goal === g.value ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
              <input type="radio" name="meta-goal" className="mt-0.5 accent-primary" checked={goal === g.value} onChange={() => onGoal(g.value)} />
              <span>
                <span className="block font-medium">{g.label}</span>
                <span className="block text-xs text-muted-foreground">{g.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
