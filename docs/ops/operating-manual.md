# Operating manual: how the Komendly machine works

Read this first. Paths only, never secret values. Index of everything else: [knowledge/README.md](knowledge/README.md). Search: `npx tsx scripts/ops-build-knowledge.ts search "<words>"`.

## The shape
One Next.js web app (Vercel) + one Postgres. Web, `engine/` (Railway, renders ads, runs all growth/revenue/ops loops) and `kly/` (Railway, cold email) **only talk through Postgres**. Every autonomous capability is either a flag-gated system (`AdsFeatureFlag sys_<key>`, heartbeat `EngineHeartbeat system:<key>`), an engine loop (`engine/src/main.ts`), a Kly step (`kly/src/loop.ts`), a Vercel cron (`vercel.json`) or the external Media Master desktop scheduler. The complete live inventory with status is `/admin/ads/ops` (code: `src/lib/ops/control/inventory.ts`).

## Offer (current, from MEMORY 24-26 Nov)
Free 10 ads -> $9 unlock -> Growth Autopilot first month $97 then $297/mo (founding, 10 spots) with a live-in-7-days guarantee -> DIY Ad Department $97/$197 as downsell. Facts live in one place: `src/lib/ads/public-offer.ts`. Meta ads are OFF (user decision 26 Nov) until proof; if ever restored keep optimising for PURCHASE.

## Daily/weekly rhythm
| When (UTC) | What | Where |
|---|---|---|
| hourly | growth loops, lifecycle emails, monitor (alerts to ADS_ALERT_EMAIL) | engine |
| daily | revenue_snapshot, finance_snapshot, reliability, `system_status` (ops ledger) | engine |
| 13:00 Mon | content queue | cron |
| 14:00 / 14:30 / 14:45 Mon | scoreboard digest, growth review, revenue digest | crons |
| ~14:50 Mon | owner brief (`sys_ops_digest`, only if something needs a decision) | engine |
| weekly | optimiser (diagnose, decide, act within allow-list) | engine |
| daily 15:00-16:00 | business-of-the-day, IndexNow, funnel monitor | crons |

## Turn things on / off / undo
- One system: `/admin/ads/growth` toggle, or `POST /api/admin/growth/systems {key, enabled}`. Missing flag row = OFF. Undo = toggle back; systems are additive and write only their own events.
- Other flags: `/admin/ads/flags`.
- **Everything outbound at once:** `/admin/ads/ops` -> "Pause all outbound" (see [kill-switch.md](kill-switch.md)).
- Kly sending needs `KlySettings.enabled` + AdsFeatureFlag `outbound` + `OUTBOUND_ENABLED=1`; the governor (`kly/src/governor.ts`) stops on any complaint, >2% bounce/7d or 2,000 sends without a positive reply (resume via `KLY_GOVERNOR_RESUME_AFTER`).

## Where data lives
Postgres (prod DB; Kly URL host `nozomi.proxy.rlwy.net:46924` for psql, credentials in Railway/Vercel env, never in docs). Business state: `AdsEvent` (all snapshots and ledgers: `revenue_snapshot`, `finance_snapshot`, `system_status`, `ops_decision`, `ops_contact`, `ops_emergency_*`), `EngineHeartbeat`, `AdsFeatureFlag`, `Kly*`/`Outbound*`. Files: `docs/**` (PRDs, registries, learnings), MEMORY.md at `~/.ezcoder/goals/paying-custys/MEMORY.md`. Secrets: goal folder `secret/` (paths: `secret/*.pw`, `secret/*key*.txt`), Vercel env, Railway env, `~/.config/meta-ads/aiconsulting.env`.

## Runbooks
- **Deploy web:** commit + push to main; Vercel deploys. No CI: run `npx tsc --noEmit -p .` and `npx vitest run src/lib` first.
- **Deploy engine / kly:** `git worktree add /tmp/x HEAD`, then `railway up --service <engine|kly> --detach` from that worktree (never from a dirty repo). Kly link: `railway link --project 745c47e6-629f-47fd-8509-3ad974cc5a2c --environment production --service kly`. New shared imports must be added to the service Dockerfile COPY list (`engine/Dockerfile` has `src/lib/ops/control/`).
- **Schema change:** web+engine+kly together; `node scripts/prisma-generate.mjs` in engine/ and kly/. This control layer needs none.
- **Stripe coupon / launch:** `scripts/ads-stripe-autopilot-launch.ts --live` (Stripe CLI is logged into another account: use the DB / Vercel Stripe key).
- **Reels:** flag `sys_reels`; first-approval gate flag `reels_first_approved`; see `docs/growth-ecosystem/reels.md`.
- **Adlib import:** `cd kly && DATABASE_URL=<kly url> npx tsx scripts/import-adlib.ts [--dir ...]`; back up touched rows first; undo = delete ids like `adlib:%`.
- **Run order after deploy of this layer:** deploy web, deploy engine, turn on `sys_ops_control`, wait a day, check `/admin/ads/ops` shows a `system_status` row and no 'silent' you did not expect; only then `sys_ops_digest`.

## Contact guard
`src/lib/ops/control/contact.ts`: `canContact(target, channel, history)` + `recordContact(db, target, channel, source)` (AdsEvent `ops_contact`). Rule: same person 3 days (any channel), same business domain 2 days by a different channel, replies exempt. **Not wired into any sender yet.** To wire into Kly: add `src/lib/ops/control/contact.ts` to the `kly/Dockerfile` COPY list, call `loadContacts` + `canContact` before the send and `recordContact` after, redeploy Kly, test with `npm test` in kly/.

## Combined Monday email
`src/lib/ops/control/brief.ts` `combinedPlan(flags)` says whether the revenue digest / optimiser digest should skip their own send in favour of the owner brief. Neither cron adopts it yet: to adopt, call it at the top of the revenue-digest cron and the optimiser digest sender and return early when their key is in `skipOwnSend`. Until then the brief drops sections those digests cover.

## What the owner must do (short)
See [owner-dependencies.md](owner-dependencies.md). Everything else should run without you; if `/admin/ads/ops` shows 'needs the owner' empty, do nothing.
