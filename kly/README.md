# Kly

Komendly's autonomous cold-email customer-acquisition worker (Railway service, single replica). It talks to the rest of
Komendly only through Postgres. Each tick (~60s, never overlapping, restart-safe):

1. Reads `KlySettings` (row `kly`, created with defaults if missing). `enabled` and AdsFeatureFlag `outbound` are kill
   switches: off = no discovery, gifts, sending or strategist (inbound replies/bounces/unsubscribes are still honoured).
2. Processes pending `OutboundRun` requests, then segment-arm driven discovery (OpenStreetMap finder + AI qualification)
   to keep a buffer of ~2 days of sending capacity.
3. Starts free hook-ad gifts through the engine's gift pipeline (AdRun kind=gift, AdsGift source `outbound`, `extract`
   AdJob), capped by `dailyGiftCap`, the monthly budget and `maxCodexWeeklyPct`.
4. Judges ready ads with AI; weak ones are regenerated once, then dropped.
5. Sends plain-text emails + one threaded follow-up via Gmail SMTP mailboxes (only with `OUTBOUND_ENABLED=1`, mailboxes
   set and not a dry run). Polls IMAP every ~5 min for replies, bounces, complaints; auto-replies (max 2) or alerts.
6. Syncs signups/revenue (`AdsEvent` `paid_converted`/`renewed`), credits experiment arms (`KlyArm`, Thompson sampling,
   champions/retirements), runs the daily AI strategist, autoscales volume, purges PII after 180 days, upserts `KlyDaily`.

Every autonomous change is logged to `KlyDecision`. All AI goes through the owner's Codex subscription via
`engine/src/providers` (default model `gpt-6.1-sol`, reasoning medium). `/healthz` returns JSON status; the
`EngineHeartbeat` row `kly` is refreshed every 30s (its `meta` feeds /admin/ads/outbound).

## Env vars
Required: `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `ADS_HASH_SALT`, and a Codex login (`CODEX_SHARED_STORE=db` with
`ADS_TOKEN_KEY` when deployed; `CODEX_AUTH_FILE` or `CODEX_AUTH_JSON` locally).

Sending: `OUTBOUND_MAILBOXES`, `OUTBOUND_ENABLED`, `OUTBOUND_FROM`, `OUTBOUND_POSTAL_ADDRESS`, `OUTBOUND_APP_URL`
(or `NEXT_PUBLIC_APP_URL`), `OUTBOUND_GIFT_WORKSPACE_ID` or `OUTBOUND_ADMIN_EMAIL`.

Alerts: `ADS_ALERT_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (unset = alerts only logged).

Voice (The Tribunal AI calls, `src/voice.ts`): `TRIBUNAL_BRIDGE_URL` (…/api/v1/komendly-bridge), `KOMENDLY_BRIDGE_TOKEN`;
also needs `KlySettings.voiceEnabled` (off by default), capped by `dailyCallCap`/`hourlyCallCap`.

Other: `PORT` (default 4200), `CODEX_TEXT_MODEL`, `ENGINE_PRICES_JSON`, `OUTBOUND_DRY_RUN`, `OUTBOUND_DRY_RUN_DIR`, `KLY_DEBUG`.

## Run locally
```sh
cd kly && npm install            # also generates the Prisma client from ../prisma/schema.prisma
set -a; . ../.env.local; set +a
npm run dev
npm run typecheck && npm test
```

## Dry run (sends nothing, never touches SMTP/IMAP)
Finds + qualifies leads for one segment, makes their gifts (needs an engine processing this DB), judges them and writes
each would-be email to `OUTBOUND_DRY_RUN_DIR`:
```sh
set -a; . ../.env.local; set +a
OUTBOUND_DRY_RUN=1 OUTBOUND_DRY_RUN_DIR=/tmp/kly-dry npx tsx scripts/dry-run.ts --niche roofers --city "Denver, CO" --count 3 [--wait-min 20] [--reuse]
```

## Deploy
Railway service using `kly/railway.json` (Dockerfile `kly/Dockerfile`, build context = repo root, health check
`/healthz`, 1 replica). Local check: `docker build -f kly/Dockerfile .`. Schema changes to `prisma/schema.prisma` affect
web, engine and Kly: ship them together.
