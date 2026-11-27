# Ops activation checklist (safe order, dry run first)

Rule: flip ONE flag, wait one tick, check `/admin/ads/ops` and the system's own AdsEvent, then the next. Turning OFF is always safe. Agents do not deploy; the coordinator pushes the web and `railway up`s engine/kly.

## 0. Before any flag
1. Deploy this change set (web), then engine (`railway up`). Check `railway logs --service engine` shows `engine started` and no "Cannot find module".
2. Confirm anonymous `curl -I https://www.komendly.com/admin/ads` redirects to /login.
3. Env needs (Vercel/Railway): `INFRA_ENGINE_URL`, `INFRA_KLY_URL` (health URLs, for infra watch), `META_ADS_TOKEN` (Meta spend capture; read-only), `INFRA_MONTHLY_CENTS` (known hosting total), `OPS_DIGEST_TO` (optional), `ADS_ALERT_EMAIL`.
4. Decide FAL_WEBHOOK_SECRET / VIDEO_WEBHOOK_SECRET (set, or remove the routes).
5. Kly contact guard (optional, later): add `COPY src/lib/ops/control/contact.ts` (pure TS, no imports) to `kly/Dockerfile`, then import `canContact/loadContacts/recordContact` in `kly/src/sender.ts`; run `cd kly && npm test` (dockerfile-shared + dockerfile-packages tests must pass).

## 1. Flag order (AdsFeatureFlag)
| Order | Flag | Why this position | Check after one tick |
|---|---|---|---|
| 1 | `sys_ops_control` | read-only daily `system_status` snapshot | `system_status` AdsEvent appears; ops page fills |
| 2 | `sys_incidents` | detects, may only switch a sys_ flag off / pause domain / maintenance | `incident` events, none spurious |
| 3 | `sys_infra_watch` | needs INFRA_* envs | `infra_check` events ok |
| 4 | `sys_support_ops` | ticket triage | `/admin/ads/support` fills |
| 5 | `sys_finance_intel` | P&L + Meta spend | `/admin/ads/finance` numbers sane vs Stripe |
| 6 | `sys_biz_admin` | obligations digest | weekly digest content correct |
| 7 | `sys_partner_ops` | partner statements | statements match commissions |
| 8 | `sys_ops_digest` | Monday brief; absorbed if `sys_exec_brief` ON | one email only |

Emergency stop: `/api/admin/ops/emergency-stop` or set the flag OFF (docs/ops/kill-switch.md).
