# Activation checklist: executive layer (all flags default OFF)
1. Deploy engine from a clean worktree (`railway up --service engine --detach`). Confirm `/healthz`.
2. Optional env on engine: `EXEC_MAX_CALLS` (default 10; cycle uses at most 2).
3. **Strategy, dry first:** set `EXEC_DRY_RUN=1`, turn ON `sys_exec_strategy`. Wait for the tick (90s after boot, then every 30 min). Expect an `exec_cycle` log and no new exec_* rows. Remove `EXEC_DRY_RUN`, redeploy; the next tick runs for real.
4. **Verify the first real cycle:** AdsEvent `exec_cycle` ok=true, status `ok`, mode `hold_and_measure`; one `exec_objective` with spec.type `hold_and_measure`, approval `auto_approved`, spend 0; `exec_context`, `exec_decision`, `exec_audit` rows (chain verifies). `exec_cycle` status `halted` means a governance problem or emergency stop: read `problems`.
5. Turn ON `sys_exec_coordinator`. Next daily tick should write `exec_dispatch` rows (checkpoint) and one `exec_coordinator_run`. Spend must stay 0.
6. Open `/admin/ads/executive`: banner shows commercial validation, First-10 card shows 1/10 (verified $9 buyer), Needs-you list renders.
7. Turn ON `sys_exec_brief` last: it absorbs the revenue/optimiser/ops Monday digests. Expect at most one email on Monday after 12:00 UTC, and `digest_sent` channel exec_brief.
8. Rollback: switch the flag off, or write an `exec_override` pause_all. 3 failed cycles auto-pause `sys_exec_strategy`.
9. Run `npx tsx scripts/exec-dry-run.ts` any time to preview.
