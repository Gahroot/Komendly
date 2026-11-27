# Operations audit (26 Nov 2026)

Method: code read + local tests + read-only live checks. "Met" means verified in code AND tests; nothing here is proven by production data, because every new `sys_*` ops flag is still OFF. Not legal advice.

## Fixed in this audit
| ID | Fix |
|---|---|
| S-16 (High) | `src/app/admin/layout.tsx` is now a server component (redirects non-admins). 4 server pages (`ads/flags`, `ads/intent`, `ads/partners`, `ads/features`) had no own check and queried Prisma directly; now call `getAdminUser()`. Other admin pages go through `AdminAdsShell` (checks) or call `getAdminUser()`. `/api/admin/**` routes all call `checkAdmin()`. |
| S-07 | `/api/webhooks/` public in middleware; FAL + video-status return 503 when secret unset (fail closed). Prod has neither secret set, so they reject all calls until set (nothing in the repo calls them). |
| S-08 | `facebook-capi`: Purchase/Subscribe need a `cs_...` session id, value 0-2000, once per session. |
| S-09 | Studio invite: suppression check, 5/day cap, contact ledger, opt-out note. |
| S-10 | Referrer-Policy, Permissions-Policy, X-Frame-Options SAMEORIGIN, CSP **report-only** (frame-ancestors/object-src/base-uri/form-action). `/embed/*` and `/shopify` excluded (stay frameable). |
| Contact guard | `contact-web.ts` wired into creative-hubs nominee email + Studio invite. Kly not wired (see checklist). |
| Banner | `ops_maintenance` -> `/api/ops/status` -> `MaintenanceBanner`. |
| webhook_failed | Producers added to 5 webhook handlers. |
| Crash safety | `engine/src/main.ts`: all loops via `safeStart`, global `unhandledRejection` handler; tests added. |
| Dockerfile | New tests: shared-file package deps in engine/kly `package.json` (existing COPY tests already cover files). |

## Still open
- S-05 `next` 16.1.1 critical: see "S-05 result" below.
- S-06 nodemailer (major bump; low exposure, no user-controlled envelope) and undici (blocked by `@prestyj/ai`).
- S-11..S-15 low/info unchanged.
- Live: `/admin/ads` returned 200 to an anonymous request on production (old deploy: renders the "Admin access required" shell, no data). After deploying this change anonymous gets a redirect to /login.

## 17-area matrix
| # | Requirement | Status | Evidence | Fix this pass | Remaining |
|---|---|---|---|---|---|
| 1 | Autonomous ops: execution, monitoring, recovery | Partial | engine loops (`engine/src/ops/*`), crons in `vercel.json`, registry | crash-safe loop start | all new loops flag-OFF; no production runs yet |
| 2 | Coordination, no contention | Partial | `ops/control/coordination.ts`, exec coordinator, single digest (`digest-dedupe.ts` used by revenue, optimizer, ops brief) | contact guard on web senders | Kly/engine senders not on the contact ledger; digests dedupe only works once `sys_exec_brief` is ON |
| 3 | Autonomous support | Partial | `ops/support.ts`, KB, review gate, auto-reply | webhook failures visible | `sys_support_ops` OFF; no measured resolution rate |
| 4 | Financial intelligence | Partial | `ops/finance/*`, P&L page `/admin/ads/finance`, fixed-costs.json | none | unknown costs listed as inputs; needs `INFRA_MONTHLY_CENTS`, Meta spend token; flag OFF |
| 5 | Infra management | Partial | `ops/infra.ts`, heartbeats, kill switch | maintenance banner; crash safety | needs `INFRA_*_URL`; flag OFF |
| 6 | QA | Partial | qa-canary.md, funnel monitor, test suites | admin guard, CAPI abuse | no live canary data |
| 7 | Security/privacy/risk | Partial | security-audit.md, url-guard, rate limits | S-07/08/09/10/16 | S-05/06, CSP enforcing, git-history secret scan |
| 8 | Business administration | Partial | obligations.json, `biz_admin` loop | none | flag OFF; owner must confirm obligations |
| 9 | Partner operations | Partial | `ops/partners/*`, `partner_ops` loop | none | flag OFF; commission mismatch (owner decision) |
| 10 | Knowledge/memory | Met (docs) | docs/ops/knowledge, runbooks, this audit | audit docs | keep updated by hand |
| 11 | Incidents | Partial | `incidents.ts`, `incident-io.ts`, runbook | webhook_failed producers, banner | flag OFF; never exercised live |
| 12 | Resource/capacity | Partial | `control/capacity.ts`, AI budget throttle | none | no live consumption data |
| 13 | Scalability | Met (by design) | single-replica, pre-revenue restraint | none | n/a |
| 14 | Process improvement | Partial | optimizer + experiments | none | no outcome history |
| 15 | Accountability | Partial | ledger `system_status`, `/admin/ads/ops` | none | ledger snapshot needs `sys_ops_control` ON |
| 16 | Owner independence/emergency | Partial | emergency-stop route, kill-switch.md, boundaries.md | none | stop untested live |
| 17 | Operational intelligence | Partial | `/admin/ads/ops`, executive page, Monday brief | none | pages show "Not available yet" until flags ON |

## Owner decisions
1. Partner commission: live `PARTNER_TERMS` 30% vs 20% requested. Terms NOT changed.
2. Set `FAL_WEBHOOK_SECRET` / `VIDEO_WEBHOOK_SECRET` only if those vendor callbacks are still used; otherwise delete the routes.
3. Approve turning ops flags ON in the order of the activation checklist.
4. Approve nodemailer major upgrade (S-06).
