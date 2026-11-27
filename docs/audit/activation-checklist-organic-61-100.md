# Activation checklist (coordinator runs; nothing here was run by the audit)

Prod DB reads: `U=$(cat /tmp/.kdb); psql "$U" -Atc "..."`. Never print the URL. Flags are rows in `AdsFeatureFlag` (key, enabled). Use the admin flag UI or a one-line write by whoever owns prod writes.

## A. Deploy web (carries newsletter, build-in-public, recognition, WordPress plugin files)
```
cd /Users/groot/Komendly
npx tsc --noEmit -p . && npx vitest run src/lib
git status --short     # review; this audit's files are listed in docs/audit/organic-61-100.md
# commit only the audit files, then push main (Vercel deploys). Engine/kly are NOT touched by this audit.
```
Check after deploy: `curl -s -o /dev/null -w "%{http_code}\n" https://www.komendly.com/tools/ozzys-ad-report` -> 200 (page is noindex while the flag is off); `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $CRON_SECRET" https://www.komendly.com/api/cron/newsletter` -> `{"result":{"status":"off"}}`.

## B. Newsletter (#93), flag `sys_newsletter`
Prereqs: `LIFECYCLE_EMAIL_SECRET` (already used by ad-watch), SMTP env (already), optional `OUTBOUND_POSTAL_ADDRESS` (default 2211 Cole St, Birmingham, MI 48009).
1. Turn on: `insert into "AdsFeatureFlag"(key,enabled,...) ... 'sys_newsletter' true` (match the table's required columns; easiest via the admin flags page).
2. Dry run without sending: `ADS_EMAIL_LOG_ONLY=1 npx tsx` is not needed; with zero confirmed subscribers the Thursday run sends nothing and records heartbeat `system:newsletter`.
3. Subscribe a test address at `/tools/ozzys-ad-report`, click confirm in the mail, then `curl -H "Authorization: Bearer $CRON_SECRET" https://www.komendly.com/api/cron/newsletter` -> `{"status":"sent","sent":1}`; the mail must show source+date, UTM links, unsubscribe. Confirm `select count(*) from "AdsEvent" where name='newsletter_sent'`.
4. Then link `/tools/ozzys-ad-report` from the footer/blog CTA (not done in this audit) and add it to `src/app/sitemap.ts`.
Kill: set `sys_newsletter` false.

## C. Other flags (read-only audit found these OFF/missing)
- `sys_agency_ops` (#88): turn on after one manual pass of `/ads/agency`.
- `sys_creative_publish`, `sys_creative_outreach` (#84, #90): only when at least one opt-in exists.
- `sys_reels` (#66-68): currently false. First check `reels_first_approved` and the 26 Nov reel visuals; then turn on. Recovery from paused platform: insert AdsEvent `reel_resumed {platform}`.
- `sys_build_in_public` is a draft-only system (no cron); no flag needed. Weekly: `npx tsx --env-file=.env.local scripts/build-in-public.ts`; monthly: `npx tsx --env-file=.env.local scripts/recognition-draft.ts`.

## D. Owner decisions
- ChatGPT age box: options (1) change privacy policy minimum age to 13+ and tick "suitable for under 18" (recommended: needs lawyer-grade wording by Nolan), (2) leave unsubmitted. Then submit at platform.openai.com plugins (draft 1.1.0 is uploaded).
- Zapier: add a komendly.com team member, 3 live users; invite link in MEMORY.
- Chrome $5, Reddit app, dedicated accounts: see desktop-tasks.md.

## E. Media Master (stale running app)
```
pgrep -fl "remote-debugging-port=9333"         # old pid 67626 runs out/ built 20 Nov
kill 67657 67626                                # exact PIDs only
cd ~/media-master/apps/media-master && npx electron-vite build
PLAYWRIGHT_BROWSERS_PATH="/Applications/Media Master.app/Contents/Resources/patchright-browsers/arm64" MEDIA_MASTER_USER_DATA="$HOME/Library/Application Support/@media-master/app" npx electron . --remote-debugging-port=9333 &
```
Then: store `REELS_AGENT_TOKEN` / `INTENT_AGENT_TOKEN` (same values as Vercel env) in MM key names `komendly-reels-token` / `komendly-intent-token`; bind only Komendly accounts to brand b801414e (the host refuses unbound ones). Expect `data/komendly-*.json` state files to appear within a tick; if none appear, the host did not start.

## F. Verification queries after 27 Nov 15:30 UTC (not my slice, flagged by the audit)
`select id,meta->>'lastRunAt' from "EngineHeartbeat" where id in ('system:indexnow','system:content_queue')` should be non-null by Mon 30 Nov 13:00 UTC; if not, check CRON_SECRET and vercel.json crons.
