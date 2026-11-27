# 10. Strategic performance management
Outcome: separate "it ran/shipped" from "it moved the commercial metric"; flag technically complete but commercially ineffective work and resources consumed without value.
Acceptance: verdicts commercial_win / operational_only / consuming_without_value / inconclusive; small samples never called win or loss; expansion blocked before revenue; a hold_and_measure target met hands back to the strategy cycle, not "win".
Status: met in code. Code: `performance.ts`, `strategic-cycle.ts`. Verification: e2e test (hold objective never "expand").
