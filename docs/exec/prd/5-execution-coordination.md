# 5. Execution coordination
Outcome: every objective is carried identification -> execution -> verification -> commercial evaluation -> closure, with one accountable owner per phase, no duplicates, conflicts or abandoned work.
Acceptance: only owner/auto-approved, un-paused objectives dispatch; allow-listed reversible actions only; duplicates/conflicts/stalls (10d)/abandoned proposals (21d) flagged; code changes become `build_request` events, never executed; verifying objectives close with measured outcome.
Status: met in code and tests; engine tick not yet run live.
Code: `src/lib/exec/coordinator.ts`, `strategic-cycle.ts`, `objective-adapter.ts`, `load.ts`, `engine/src/exec/coordinate.ts`, `scripts/exec-build-queue.ts`. Strategy engine alone creates objectives (`cycle.ts`).
Verification: `__tests__/e2e-cycle.test.ts`, `exec.test.ts`; dry-run script.
