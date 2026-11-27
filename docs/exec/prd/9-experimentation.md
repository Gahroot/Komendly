# 9. Business-wide experimentation
Outcome: experiments are coordinated, not duplicated, and tied to objectives.
Acceptance: objective validator rejects duplicates of running experiments/hypotheses; coordinator starts/concludes experiments only via `src/lib/revenue/experiments.ts`; pre-revenue with thin samples allows no experiment objectives (hold_and_measure).
Status: partial: gating and dedupe tested; no experiment has run under exec yet.
Code: `objectives.ts` (`validateObjective`, `buildPortfolio`), `coordinator.ts`. Verification: `exec.test.ts` duplicate/hold tests.
