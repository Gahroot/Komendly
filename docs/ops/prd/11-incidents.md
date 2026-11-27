# 11. Incident management

**Requirement.** Failures are detected, contained safely and learned from without the owner in the loop, except P1 or anything that needs an action outside the allow-list.

**Built (flag `sys_incidents`, default OFF)**
- Pure engine `src/lib/ops/incidents.ts`: signals -> `incident` AdsEvent (id, severity P1-P3, detectedAt, signals, status open|contained|resolved, containment, resolvedAt, rootCause, correctiveAction, recurrence, escalatedAt). Dedupe by signal key; auto-close after ~25 min clean and only when the signal's source was actually evaluated; recurrence counted over 30 days.
- Signals: funnel_check failures, reliability_finding (when a snapshot is fresh), engine / kly / Codex heartbeat staleness, blocklisted or governor-paused sending domains, payment-failure bursts (>=3 in 24h), `webhook_failed` events (none are produced yet, see gaps), failing growth systems, support health, infra_check signals.
- Severity: security or money at risk or everyone affected = P1; some customers = P2; otherwise P3.
- Containment allow-list (reversible only): switch off a `sys_*` growth flag (never the ops/monitor flags), pause a sending domain (`OutboundDomain.paused`, `pausedReason "auto: incident <id>"`, which the Kly governor lifts on a clean check), set flag `ops_maintenance` (cleared automatically when its incident closes). Max 3 actions per tick. Anything else is refused and escalated.
- Escalation: email to nolan@prestyj.com only for P1 or out-of-bounds containment, once per incident.
- Daily review: recurring keys (>=2 in 30 days) become a `product_proposal` (permanent fix), once per key per 30 days.
- Engine job `engine/src/ops/loop.ts` (every 10 min) + web watchdog `/api/cron/ops-watchdog` (Vercel cron, acts only when the engine itself is silent >5 min). Admin page `/admin/ads/incidents`. Runbooks: `docs/ops/incident-runbook.md`.

**Acceptance criteria.** Dedupe, severity, allow-list, caps, closing rules, once-only escalation, maintenance undo and recurrence proposals are covered by `npx vitest run src/lib/ops/__tests__/incidents.test.ts incident-io.test.ts`. With the flag OFF neither the engine job nor the cron writes anything.

**Gaps (honest).** `webhook_failed` is now written by the Stripe, ads-billing, Resend inbound, FAL and video-status handlers (`src/lib/ops/webhook-failure.ts`, error paths only, return codes unchanged). The `ops_maintenance` flag now drives a site banner (`/api/ops/status` + `MaintenanceBanner`). Still open: webhooks that fail signature verification are not recorded (attacker noise), and no live data yet: status = built, not proven.
