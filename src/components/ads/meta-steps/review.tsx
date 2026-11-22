"use client";

import { META_COUNTRIES, GOAL_OPTIONS, adSetPlan, formatMoney } from "@/lib/ads/meta/publish-options";
import type { PublishGoal } from "@/lib/ads/meta/core/publish";
import type { MetaAdView } from "@/lib/ads/meta/status-types";

export function ReviewStep({
  ads, ratios, accountName, pageName, countries, budget, currency, goal,
}: {
  ads: MetaAdView[];
  ratios: string[];
  accountName: string;
  pageName: string;
  countries: string[];
  budget: number;
  currency: string;
  goal: PublishGoal;
}) {
  const plan = adSetPlan(ads, ratios);
  const rows: [string, string][] = [
    ["Ads account", accountName],
    ["Facebook Page", pageName],
    ["Goal", GOAL_OPTIONS.find((g) => g.value === goal)?.label ?? goal],
    ["Countries", countries.map((c) => META_COUNTRIES.find((x) => x.code === c)?.name ?? c).join(", ")],
    ["Daily budget", `${formatMoney(budget, currency)} per ad set, up to ${formatMoney(budget * plan.length, currency)} a day once turned on`],
  ];
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1.5">
        <p className="font-medium">What gets created (all paused)</p>
        <ul className="space-y-1.5">
          {plan.map((g) => (
            <li key={g.label} className="rounded-md border border-border bg-card/50 px-3 py-2">
              Ad set <span className="font-medium">{g.label}</span>: {g.ads} {g.ads === 1 ? "ad" : "ads"} in {g.ratios.join(", ")}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">Nothing spends money yet. You can check every ad in Meta Ads Manager before turning it on.</p>
    </div>
  );
}
