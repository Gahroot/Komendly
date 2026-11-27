# 16. Owner independence

Owner: ops control worker (part 3).

Reduce what only the owner can do; make the rest one click.

**Measurable outcomes:** `docs/ops/owner-dependencies.md` lists every dependency with a removal plan; emergency stop is one admin action; owner brief is <=12 lines.

**Acceptance:** `POST /api/admin/ops/emergency-stop` {stop|resume} turns off only sending/posting flags, audits, and resume restores exactly those; weekly brief (`sys_ops_digest`) skipped when nothing needs a decision.

**Honest status:** emergency-stop route is untested against a live DB (pure plan/resume logic is tested). Kly sender also has its own governor and `OUTBOUND_ENABLED`; this switch flips the AdsFeatureFlag layer only.
