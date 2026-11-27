# Incident runbook

Each incident type below: what it means, what automation already did, what to do. Incidents live at `/admin/ads/incidents`. Containment is always reversible; nothing here changes billing or infrastructure.

**funnel** (`funnel:<check>`). A public page, the sitemap, offer API or a Stripe price/coupon check failed (`/api/cron/funnel-monitor`). Stripe/offer = P1 (checkout may be wrong). Do: open the named page or Stripe object; fix the env/object; the incident closes after clean checks (next daily run, or run the cron by hand).

**heartbeat** (`heartbeat:engine`, `heartbeat:kly`). No heartbeat for 5 min (engine) / 10 min (kly). Automation: after 15 min the `ops_maintenance` flag is set and the owner is emailed (P1). Do: Railway > service logs, redeploy/restart. Clearing the incident clears the flag. Kly down only stops cold email (P2).

**provider** (`provider:codex`). Codex login or provider unhealthy; ads and replies that need AI fall back or wait. Do: re-login Codex on the engine (see `docs/growth-ecosystem` notes; shared via `CodexCredential`).

**deliverability** (`deliverability:blocklist:<domain>`, `kly:paused:<domain>`). Domain on a blocklist: automation pauses it (`pausedReason auto: incident ...`; the Kly governor lifts it after a clean check). Do: check the domain at the listing site, wait or retire the domain; do not unpause by hand while listed.

**payment** (`payment:failures`). 3+ payment failures in 24h = P1. Do: Stripe dashboard > Payments; check card-update emails went out (winback system) and the Stripe webhook endpoint.

**webhook** (`webhook:<provider>`). Fed by `webhook_failed` events (no producer yet). Do: provider dashboard > webhook deliveries; confirm the secret env and that the route is in `publicPrefixes`.

**reliability** (`reliability:<key>`). From the reliability snapshot: provider outage, stuck jobs, SLO breach. Do: `/admin/ads/jobs`; provider order guidance is in the finding.

**system** (`system:<key>`). A growth system keeps failing. An email-sending system that has not succeeded for an hour and 3+ runs is switched off (flag `sys_<key>`). Do: read the error at `/admin/ads/growth`, fix, then switch the flag back on yourself.

**support** (`support:auto_reply_silent`, `support:owner_backlog`). Auto-responder produced no outcomes, or owner items are overdue. Do: check `/api/inbound/resend` logs and `/admin/ads/support`.

**infra** (`infra:http:*`, `infra:db:*`, `infra:expiry:*`). Site/kly/engine health URL failing; DB connections/locks/size; SSL, domain, Meta token or Codex login near expiry (P1 within days). Do: renew at the registrar, reconnect Meta from the admin partner page, or inspect Railway/Vercel.

**Closing and learning.** An incident closes itself after ~25 min clean; root cause/corrective action are filled by the owner or stay "cleared by itself". The daily review turns anything that recurs twice in 30 days into a `product_proposal` for a permanent fix.
