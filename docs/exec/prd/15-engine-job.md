# 15. Engine job and operations

**Code:** `engine/src/exec/strategy.ts`, `src/lib/exec/cycle.ts`. Flags (default OFF): `sys_exec_strategy` (the owner email is the single Monday `sys_exec_brief`, not a separate digest).

- Weekly cycle, idempotent per ISO week; on demand via AdsEvent `exec_run_request`. Heartbeat via `recordSystemRun`.
- Env: `EXEC_MAX_CALLS` (default 10; the cycle uses at most 2), `EXEC_DRY_RUN=1` (reads and asks, writes nothing).
- Per-step try/catch; 3 failed cycles in a row switch `sys_exec_strategy` off and email ADS_ALERT_EMAIL; owner pause is not a failure.
- Codex only, through `createProvider('codex')`. Rollout: turn on with EXEC_DRY_RUN=1 first.
