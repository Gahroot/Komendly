# Revenue learnings (append-only)

Each entry is tagged EVIDENCE (observed, with a source) or ASSUMPTION (believed, not yet tested). Never edit or delete old entries: add a new one that supersedes them. Helper: `appendRevenueLearning` in `src/lib/revenue/learnings.ts` (format shared with `docs/growth-ecosystem/learnings.md`).

## 2026-11-26 [EVIDENCE] Business is at Scaling Roadmap stage 1 (Monetize): one $9 buyer, no recurring customers

58 real sign-ups all-time (50 from Meta), 0 paying subscribers, first payment a $9 unlock pack on 25 Nov. Nothing yet shows the offer sells repeatably.

Source: /Users/groot/.ezcoder/goals/paying-custys/MEMORY.md (20-26 Nov baseline); /admin/ads/scoreboard

## 2026-11-26 [ASSUMPTION] Funnel benchmarks are generic, not Komendly's own

BENCHMARKS in `src/lib/revenue/constraints.ts` (3% visit to sign-up, 60% activation, 5% free-to-$9, 10% upsell, 70% day-30 retention) are typical low-ticket SaaS guesses used only to rank constraints. Replace with measured rates once each step has 30+ samples.

## 2026-11-26 [ASSUMPTION] LTV uses 10% monthly churn and 70% margin until subscribers have 90 days of history

Labelled "assumption" everywhere it appears (`ASSUMPTIONS` in `src/lib/revenue/economics.ts`). No subscriber exists, so no churn has been observed.

## 2026-11-26 [ASSUMPTION] Cold-email volume (200-1000/day) is too small for A/B verdicts on reply or sign-up rates in under weeks

At 1-2% click and ~0% sign-up rates, a 100-per-variant test sees 0-2 conversions. The framework refuses to call winners below minPerVariant, 95% probability best and 5 total conversions.
