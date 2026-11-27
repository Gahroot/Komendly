# 5. Infrastructure

**Requirement.** Know before customers do: site/engine/kly health, DB pressure, and anything that expires. Read-only: the watch never changes infrastructure.

**Built (flag `sys_infra_watch`, default OFF)** `engine/src/ops/infra.ts` + pure `src/lib/ops/infra.ts`.
- Fast check (hourly): site GET `/`; optional `INFRA_KLY_URL` / `INFRA_ENGINE_URL` `/healthz`; DB via read-only `pg_stat_activity` / `pg_database_size` (connections vs max, slow >30 s queries, lock waits, size vs `INFRA_DB_WARN_GB`, default 8); cost inputs (DB bytes, jobs in 24 h). Engine/kly heartbeat age is checked by the incident job.
- Slow check (12 h): SSL expiry of the site host (TLS handshake), domain expiry by RDAP for komendly.com, getkomendly.com and every `OutboundDomain`, Meta token expiry from `MetaConnection.tokenExpiresAt` (founder partner login + earliest customer), Codex login freshness (`CodexCredential.updatedAt`). Blocklist (Spamhaus DBL) status is reused from `OutboundDomain.listedOn` (Kly's own check), not re-queried.
- Output: `infra_check` AdsEvents (fast/slow) -> incidents (P1/P2 by days left). Monday: weekly "expiring soon" email to the owner (items within 45 days), skipped when none.

**Acceptance criteria.** Expiry thresholds, RDAP parsing, DB signals, weekly list and email are unit-tested (`incidents.test.ts`). OFF = no network calls.

**Not built.** S3 bucket size (needs list permission and costs per request), Resend/SMTP quota (no stable quota API), Jobber/Pinterest tokens (not stored in the DB; Jobber rotates refresh tokens itself, Pinterest is a manual app). Add to `evalExpiry` items when a store exists. Needs env to enable: `INFRA_KLY_URL`, `INFRA_ENGINE_URL` (public health URLs) on the engine service.
