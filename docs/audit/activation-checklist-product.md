# Activation checklist: product + customer intel (all flags are OFF today)

Deploy first (web + engine together; no schema change). Then enable one flag at a time via /admin/ads/flags, check, wait one cycle.

0. Before anything: `DATABASE_URL=... npx tsx scripts/audit-product-live.ts` (read-only) for a baseline.
1. `sys_reliability` (hourly): writes `reliability_snapshot` / `reliability_finding`. Emails only on severity-3 (the SLO is currently breached at ~80% vs 97%, so expect ONE alert/day: decide first whether to loosen `packWithinMs` or accept the alert). Check /admin/ads/product.
2. `sys_delivery_econ` (daily): `delivery_econ` snapshot. Compare costPerPack with the figures in docs/audit/product.md.
3. `sys_outcome_verify`: first run emails nolan@prestyj.com for each preventable failure across 49 customers (capped 20/tick). Set `CS_DRY_RUN=1` on the engine for the first tick to see rows without email, then unset.
4. `sys_creative_qa`: scores up to 4 packs/tick, critique on ~1/3 (Codex calls = cost). Report-only.
5. `sys_competitive`, then `sys_product_loop` (weekly; sends digest; config-only auto actions on the allow-list, each logged with previous value). Turn `product_loop` on last, after 1-4 have produced signals.
6. `sys_customer_memory`: start with engine env `CM_DRY_RUN=1` (logs candidates, writes nothing), then unset. Builds memory + weekly "learned" lines; does NOT affect generation.
7. `sys_customer_memory_planner`: only after >=30 packs per arm have `memory_ab` rows and `creative_score` shows no drop for `treatment` vs `holdout`. Earlier blind tests showed planner-side memory hurt; keep OFF if unproven. Instant rollback = flag off.
8. `sys_agency_ops`: only when a real agency customer exists (also enables client-ready ZIP names).

Rollback: any flag off stops its loop next tick; rows written are inert AdsEvents. Privacy: `npx tsx scripts/privacy-purge-user.ts --email X` (dry run first) now also lists/deletes that user's customer memory.
