# 4. Financial intelligence

Flag: `sys_finance_intel` (default OFF). Method: Hormozi money model (gross margin, CAC, 30-day payback), constraint-based, honest about unknowns.

## Built
- P&L (weekly = last full Mon-Sun, monthly = last full month): `src/lib/ops/finance/{pnl,load}.ts`. Revenue reuses `loadEconomicsInput` (same de-duplicated, internal-excluded ledgers as the revenue page); refunds from `AdsRefund`; AI cost from `AdRun.costMicros`; Kly from `KlyDaily.costMicros`; Meta from `ad_spend` events.
- Fixed costs: `docs/ops/fixed-costs.json` (amounts null = unknown, owner fills) + `INFRA_MONTHLY_CENTS` (replaces `infra` items). Env: `FIN_EMAIL_CENTS_PER_SEND`, `FIN_MEDIA_MONTHLY_CENTS`, `FIN_CASH_CENTS`, `META_ADS_TOKEN` (+ `META_AD_ACCOUNT_ID`).
- Engine job `engine/src/ops/business.ts`: writes `ad_spend` (yesterday, read-only Meta Insights GET), daily `finance_snapshot`, emails a cost spike (median/MAD detector, `stats.ts`) to `ADS_ALERT_EMAIL`. Never pauses or spends.
- Spending authority `authority.ts`: `checkSpend()`; AI 1000c/day auto-allowed, new paid service 0, Meta increase 0. Never moves money.
- Page `/admin/ads/finance` (admin-gated), confidence labels, "unknown, needs your input" list, cancel candidates.
- Accountant export: `scripts/ops-export-records.ts` -> `docs/ops/records/<month>/`.

## Acceptance criteria
1. Net revenue = gross - refunds - chargebacks; gross margin = (net - cost of revenue)/net. Tested in `__tests__/finance.test.ts`.
2. No unknown cost is invented: unknown items are listed and confidence is lowered; totals are lower bounds.
3. Spike detector flags >= 3.5 robust z AND >= 2x median AND >= $5, needs 5+ prior days; one outlier does not mask a spike.
4. `checkSpend` denies anything outside the owner limits and anything unlisted.
5. With flag OFF nothing is written; with no `META_ADS_TOKEN` no `ad_spend` is written.

## Known gaps (need owner/data)
- Chargebacks: no Stripe dispute handler exists (billing-webhook is a protected-area neighbour); shown as "not tracked".
- Testimonial/FAL media cost has no ledger; set `FIN_MEDIA_MONTHLY_CENTS` or leave unknown.
- Codex is a flat subscription: `AdRun.costMicros` is an estimate for it.
- Status: built, unverified against real data (no paying customers yet; confidence will read "insufficient").
