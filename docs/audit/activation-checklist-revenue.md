# Activation checklist: revenue ecosystem (safe order, dry run first)

Prereq: deploy web + engine from the commit that includes the 26-27 Nov audit fixes (checkout `kmdVid`, webhook purchased conversion, lifecycle cap fix, owner proposals UI). Flags live in `AdsFeatureFlag`; set with the admin flags page or SQL via the app's tooling. Never auto-change prices.

0. Read-only sanity (anytime): `set -a; . ./.env.local; set +a; npx tsx scripts/revenue-dry-run.ts` -> expect payingCustomers=1, subscribers=0.
1. Env (Vercel + engine): `INFRA_MONTHLY_CENTS=<real monthly infra cost>` so cash flow stops understating costs. Optional `META_ADS_TOKEN` (engine) for ad_spend capture.
2. `sys_revenue_intel` ON -> engine writes one `revenue_snapshot`/UTC day. Verify: `select count(*) from "AdsEvent" where name='revenue_snapshot'` = 1 within ~3h; /admin/ads/revenue shows history; heartbeat `system:revenue_intel` ok.
3. `sys_revenue_digest` ON -> Monday 14:45 UTC email to nolan@prestyj.com (once/week; skipped if exec brief absorbs it).
4. `sys_finance_intel` ON (only with META_ADS_TOKEN set) -> daily `ad_spend`. Verify rows appear and CAC includes Meta.
5. Optimizer dry run: set engine env `OPTIMIZER_DRY_RUN=1`, then `sys_optimizer` ON. Force a cycle: insert AdsEvent `optimizer_run_request`. Read `optimizer_action` rows (props.dryRun=true, "DRY RUN: would ...") for a week. Optional `sys_optimizer_digest` ON.
6. `sys_offer_intel` ON (only after step 5 looks sane). Starts exposing the 6 copy experiments and the weekly agent. Review `offer_proposal` rows in /admin/ads/revenue -> Approve/Reject. Verify `exp_exposure` rows appear and conversions (`signed_up`, `checkout_started`, `purchased`).
7. Lifecycle systems, one at a time, each with `CS_DRY_RUN=1` on the engine first (logs "revenue lifecycle email (dry run)", sends nothing): `sys_activation_rescue`, then `sys_nurture`, `sys_reactivation`, `sys_expansion`, `sys_success_agent`. After reading dry-run logs for a day, remove `CS_DRY_RUN` and watch `rl_email_sent` (max 20/tick, <=1/24h, <=3/week per user). Needs `LIFECYCLE_EMAIL_SECRET` set on the engine.
8. `sys_funnel_monitor` ON last (synthetic checks; trial IP guard may block it from some networks).
Kill: switch any flag OFF; engine loops read it each tick. Rollback of experiment: conclude it in /admin/ads/revenue (or reject proposal).
Verify per step: AdsEvent kinds above, `EngineHeartbeat` rows `kind='system:<key>'` (`ok`, `updatedAt`), no `optimizer_paused`.
