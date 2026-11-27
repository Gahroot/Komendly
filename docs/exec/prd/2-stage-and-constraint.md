# 2. Stage and constraint

**Code:** `src/lib/exec/constraints17.ts`, `src/lib/exec/stage.ts`. Reuses `src/lib/revenue/constraints.ts` (stage + 7 funnel constraints) and `economics.ts`; nothing is recomputed.

## 17 constraints
market demand, audience selection, offer attractiveness, acquisition, lead conversion, sales, activation, product quality, outcomes, retention, expansion, pricing, delivery economics, cash flow, reliability, capacity, competitive position. Each is `evidenced` or `insufficient_evidence` (fewer than 5 observations; 30+ = measured). `sales` is insufficient by design (self-serve).

## Primary constraint
One primary, ranked by severity x evidence weight (measured 1.0, inferred 0.7, assumed 0.3). Output includes confidence (high/medium/low/none), the reason, and `whatWouldChange`. With no measured constraint, `sampleBelowThreshold = true` and the primary may be null: that is a valid answer.

## Root cause
Rule-written first (`causeUnproven` marks symptom-level notes). Codex may add a note per evidenced constraint under a strict JSON schema; it cannot change the primary or touch insufficient constraints.

## Stage filter
`allowedStrategies(stage)`: stages 0-1 forbid scale_paid_ads, enterprise, new_product, pricing_change, new_channel, hire_or_outsource; unknown stage fails closed to stage 0.
