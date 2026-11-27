# 4. Decision intelligence

**Code:** `src/lib/exec/decisions.ts`. **Events:** `exec_decision`, `exec_decision_review`.

A decision records the question, 2+ alternatives with pros/cons, choice, reasoning, evidence, uncertainty, reversibility, expected outcome (metric, comparator, target), assumptions, review date and authority.

`decideAuthority`: legal, billing config and spend caps are forbidden; autonomy expansion, financial, pricing/contract, product, partnership, data sensitivity, access, production risk, any spend and irreversible/costly changes need the owner; the rest is auto.

## Learning loop
On the review date `reviewDecision` compares expected vs actual (revenue_snapshot metrics) and returns met / partly_met / missed / inconclusive (fewer than 5 observations or unmeasurable). `decisionQuality` reports assumption hold rate and recurring error tags (outcome_missed, assumption_failed, decided_on_assumed_evidence, unmeasurable_expectation).
