# Revenue ecosystem PRD

Scope: the offer-to-revenue system around Komendly's ladder (free 10 ads -> $9 unlock -> Growth Autopilot $97 then $297/mo -> DIY Ad Department -> continuity). Offer facts live in the root `prd.md` (read only) and `src/lib/ads/public-offer.ts`. Method: Hormozi / Acquisition.com, see `hormozi-frameworks.md` (sources and which parts are summary-based). Acquisition side is `docs/growth-ecosystem/prd.md`.

## Principles
- Honest statistics: 0 paying customers and ~200-1000 cold emails/day means tiny samples. Every metric carries `confidence` (measured n>=30 / estimated / insufficient n<5) and sample size; rates show Wilson 95% intervals.
- One constraint at a time; no winner under minPerVariant, <95% probability best or <5 total conversions.
- No schema changes: AdsEvent + existing tables + JSON. Internal/test accounts excluded everywhere.
- Hard rules: no promised results, no fake proof, truthful guarantees/scarcity, opt-outs honoured, no automated Stripe/price changes, no raised sending caps, AI customer text goes through `src/lib/growth/review-gate.ts`.

## Current stage
Scaling Roadmap stage 1 (Monetize): see `hormozi-frameworks.md`.

## Requirements (16 areas)
Status comes from `registry.json` (operational / experimenting / awaiting_prerequisite / suspended). Verification standard for all: unit test of the pure logic, `npx tsc --noEmit -p .`, engine typecheck for shared files; live behaviour is only claimed after the flag is on and data appears on `/admin/ads/revenue`.

### 1. Grand Slam Offer intelligence

**Requirement:** Score each offer step on the four value-equation levers; surface the weakest lever; propose guarantee/bonus/scarcity tests that stay truthful (founding spots from the real helper).

**Acceptance:** A scored report per ladder step with the weakest lever named and every claim sourced; no untrue scarcity.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Single source of offer facts (price, founding spots, guarantee) | operational | `src/lib/ads/public-offer.ts` | src/lib/ads/public-offer.ts is the one place offer facts live (MEMORY 20 Nov, commit 338fad9). |
| Grand Slam Offer intelligence (value-equation scoring of the ladder, bonus/guarantee tests) | awaiting_prerequisite | `src/lib/revenue/experiments.ts` | Offer/CRO worker builds this in parallel; verify its code refs before treating as live. No offer has been scored on real buyer data (1 buyer). |

### 2. Money-model optimisation

**Requirement:** Track every step of the ladder (free pack, $9, upsell, downsell, continuity) and report 30-day payback and LTGP:CAC per channel.

**Acceptance:** Per-step counts and payback/LTGP:CAC visible per channel with confidence labels; matches Stripe-backed AdsEvents.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Money-model tracking (attraction -> upsell -> downsell -> continuity) per step | awaiting_prerequisite | `src/lib/revenue/economics.ts`, `engine/src/revenue/snapshot.ts` | Per-step counts exist in src/lib/revenue/economics.ts (upsell_shown / upsell_accepted / purchased); needs flag sys_revenue_intel on and the engine deployed. |
| 30-day payback and LTGP:CAC with confidence labels | experimenting | `src/lib/revenue/economics.ts` | computeEconomics returns payback30 and ltgpToCac with measured/estimated/insufficient; with 1 buyer everything reads insufficient by design. |

### 3. Conversion-rate optimisation

**Requirement:** Every landing/checkout change ships as an experiment with one metric and a guardrail.

**Acceptance:** No page change goes live without an exp_defined row and a metric; guardrail breach pauses it.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Conversion-rate optimisation on landing, free pack and checkout | awaiting_prerequisite | `src/lib/revenue/experiments.ts` | Offer/CRO worker in progress; experiments framework ready for it. |

### 4. Activation / time-to-value

**Requirement:** Measure share of sign-ups reaching a finished pack and time to first ad; nudge stalled users.

**Acceptance:** Activation rate and time-to-first-ad shown; nudges respect opt-out.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Activation / time-to-value (free pack finished, live-in-7-days nudges) | experimenting | `src/lib/growth/proof.ts`, `src/lib/revenue/economics.ts` | Growth system 'activation' exists (src/lib/growth/proof.ts); activation rate is measured in the snapshot. |

### 5. Lead nurture

**Requirement:** Non-buyers get a short opt-out-honouring sequence; AI text passes the review gate.

**Acceptance:** Sequences logged as events, review-gated, unsubscribe works.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Lead nurture (lifecycle emails to sign-ups who have not bought) | awaiting_prerequisite | `src/lib/ads/lifecycle/template.ts` | Lifecycle worker in parallel; existing lifecycle emails in src/lib/ads/lifecycle. |
| Abandoned-checkout recovery | experimenting | `engine/src/growth/checkout-recovery.ts` | Growth system checkout_recovery, review-gated, flag sys_checkout_recovery. |

### 6. Retention

**Requirement:** Measure day-30 retention; save flow for cancel intent.

**Acceptance:** Day-30 retention shown with n; cancellers get one note.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Retention: day-30 retention measured; cancel-save note | experimenting | `src/lib/revenue/economics.ts`, `src/lib/growth/systems.ts` | day30Retention rate in snapshot; cancel_save system exists. No subscribers yet so n=0. |

### 7. Expansion and referrals

**Requirement:** Referral/gift/partner loops measured by revenue, not sign-ups.

**Acceptance:** Referral revenue shown per source.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Expansion and referrals (referral credits, gifts, partners) | experimenting | `src/lib/ads/referral-code.ts` | Referral/gift/partner programs live (see /admin/ads/growth); revenue impact unmeasured. |

### 8. Reactivation

**Requirement:** Churned and failed-payment customers get one honest win-back path.

**Acceptance:** Win-back events counted; no customer contacted twice for one churn.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Reactivation / win-back of churned and failed-payment customers | experimenting | `engine/src/growth/winback.ts` | Growth system winback (flag sys_winback); nobody has churned yet. |

### 9. Autonomous customer success

**Requirement:** Detect stuck customers and guarantee breaches and act or alert.

**Acceptance:** Breaches alert within one cycle.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Autonomous customer success | awaiting_prerequisite | `src/lib/growth/systems.ts` | Lifecycle worker in parallel; guarantee_watch alerts exist. |

### 10. Market and product intelligence

**Requirement:** Ad Library/competitor data feeds offer decisions, not just content.

**Acceptance:** At least one offer/creative decision cites market data.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Market and product intelligence (Ad Library data, competitor watch) | experimenting | `engine/src/growth/adlib-scan.ts`, `engine/src/growth/ad-watch.ts` | Ad Library scan/report and competitor ad watch run; not yet tied to offer decisions. |

### 11. Constraint-based optimisation

**Requirement:** Rank constraints from data with benchmarks; one at a time; shrink small samples.

**Acceptance:** `diagnoseConstraint` returns 7 ranked constraints with evidence; unit tested incl. shrinkage.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Daily Meta ad-spend event (ad_spend) feeding CAC | awaiting_prerequisite | `src/lib/revenue/economics.ts`, `src/lib/ads/meta-insights.ts` | Economics reads AdsEvent 'ad_spend' {amountCents}; no job writes it yet, so CAC excludes Meta spend until one does (src/lib/ads/meta-insights.ts loadMetaCampaignSpend can supply it). |
| Constraint diagnosis (ranked, shrunk toward benchmarks) | operational | `src/lib/revenue/constraints.ts` | diagnoseConstraint unit-tested; benchmarks are stated assumptions (BENCHMARKS). |
| Daily revenue_snapshot AdsEvent (history) | awaiting_prerequisite | `engine/src/revenue/snapshot.ts`, `src/lib/revenue/snapshot.ts` | Engine loop written and typechecks; needs deploy and AdsFeatureFlag sys_revenue_intel ON. |

### 12. Continuous experimentation

**Requirement:** Deterministic assignment, idempotent logging, conservative Bayesian verdicts, append-only learnings.

**Acceptance:** Exposures/conversions idempotent; `evaluateExperiment` never returns winner under thresholds; learnings append-only.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Experiment framework: assign, expose, convert, Bayesian evaluate, conclude | operational | `src/lib/revenue/experiments.ts` | Unit-tested (src/lib/revenue/__tests__/revenue.test.ts); logs to AdsEvent; never calls winner under minPerVariant or <95% probability best. |
| Append-only evidence vs assumption log | operational | `src/lib/revenue/learnings.ts`, `docs/revenue/learnings.md` | docs/revenue/learnings.md + appendRevenueLearning helper. |

### 13. Profitability and cash flow

**Requirement:** Revenue, refunds, tracked costs, CAC, cash flow with confidence labels; internal accounts excluded.

**Acceptance:** Every figure has confidence + n; internal accounts excluded; INFRA_MONTHLY_CENTS used.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Profitability and cash flow (revenue, refunds, tracked costs, infra constant) | experimenting | `src/lib/revenue/economics.ts` | cashFlow in economics; costs from AdRun.costMicros, OutboundLead.costMicros, ad_spend events, INFRA_MONTHLY_CENTS. |

### 14. Collective intelligence with the acquisition ecosystem

**Requirement:** Revenue view uses the same first-touch to system mapping as the acquisition ecosystem.

**Acceptance:** Same channel keys as `/admin/ads/growth`.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Collective intelligence with the acquisition ecosystem | operational | `src/lib/growth/systems.ts`, `src/lib/revenue/economics.ts` | Same first-touch -> system mapping (systemForTouch); owner page shows the ecosystem registry next to revenue. |

### 15. Autonomous operation

**Requirement:** Daily snapshot, weekly digest, owner command center, a visible 'next' list; no price/billing change without an explicit config path.

**Acceptance:** Snapshot once per UTC day; digest once per ISO week; both flag-gated and off by default.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Autonomous operation (optimiser loop acting on experiments) | awaiting_prerequisite | `engine/src/optimizer/run.ts` | Optimiser agent loop worker in parallel (engine/src/optimizer). Nothing changes prices/billing by itself. |
| Owner command center /admin/ads/revenue | operational | `src/app/admin/ads/revenue/page.tsx` | Page shows stage, constraint, funnel, economics, experiments, learnings, registry, needs-you, next actions. |
| Monday revenue digest email (flag sys_revenue_digest) | awaiting_prerequisite | `src/app/api/cron/revenue-digest/route.ts` | Cron /api/cron/revenue-digest written; OFF until flag set. |

### 16. Business-stage awareness

**Requirement:** State the real Scaling Roadmap stage from counts, and what not to do yet.

**Acceptance:** Stage derived from counts only; lists what not to do.

| Capability | Status | Code | Evidence |
|---|---|---|---|
| Business-stage awareness (Scaling Roadmap stage from evidence) | operational | `src/lib/revenue/constraints.ts` | businessStage returns 'Monetize' (stage 1) for 1 paying customer; lists what not to do yet. |

## Foundation exports (stable: other workers import these)
- `src/lib/revenue/experiments.ts`: `ExperimentDef`, `EXPERIMENT_DEFAULTS`, `assignVariant`, `recordExposure`, `recordConversion`, `evaluateExperiment`, `loadExperimentResults`, `defineExperiment`, `concludeExperiment`, `loadRunningExperiments`.
- `src/lib/revenue/economics.ts`: `computeEconomics`, `loadEconomicsInput`, `channelOfTouch`, `isInternalAccount`, `rate`.
- `src/lib/revenue/constraints.ts`: `diagnoseConstraint`, `businessStage`.
- `src/lib/revenue/snapshot.ts`: `buildRevenueSnapshot`, `snapshotFromInput`.

## Known gaps
- No job writes `ad_spend` yet, so CAC excludes Meta spend.
- Testimonials-product (CreditPurchase) revenue is not in these economics; only the Ads billing ledger.
- Refund events use best-effort names (`refunded`, `refund`, `charge_refunded`); verify against real refunds.
- Delivery constraint counts finished packs only; Meta connection failures are not yet counted.
