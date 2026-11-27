# 15. System accountability

Owner: ops control worker (part 3).

Anti-'silent failure': every autonomous capability is inventoried and proven (or flagged) from data.

**Measurable outcomes:** 100% of growth systems, engine loops, Kly steps and Vercel crons appear in the ledger (a test enforces it); every enabled system that never ran is a finding; daily `system_status` snapshot.

**Acceptance:** status rule (operational / idle_by_design / off / failing / silent / unproven) pure and tested incl. silent detection; registry.json claims cross-checked and discrepancies proposed (never edited); `/admin/ads/ops` shows the ledger.

**Verification:** `npx vitest run src/lib/ops/control`; engine `npm run typecheck`.

**Honest status:** built but both flags (`sys_ops_control`, `sys_ops_digest`) default OFF; no `system_status` row exists until deployed and switched on. Capabilities without telemetry (weekly drop, bonuses, Kly finder, MM scheduler) show 'unproven' by design: that is an honest gap, not a pass. Marker event names were verified against code; heartbeat-less loops can only be proven by adding heartbeats later.
