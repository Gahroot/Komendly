# Komendly ads engine

Generation worker for Website2ads (komendly.com/ads). It reads jobs from the
Postgres `AdJob` table (FOR UPDATE SKIP LOCKED), crawls sites, plans ads,
renders static ads (Playwright) and EZMotion videos (HyperFrames + ffmpeg),
runs QC and writes results to the Railway bucket + `Ad` / `AdAsset` rows.

- Entry: `src/main.ts` (runner + `/healthz`, `/readyz` on `PORT`, default 4100)
- Job types: extract, plan, render_static, render_motion, qc, publish_meta, cleanup
- Providers: `AI_PROVIDER=codex` (ChatGPT/Codex subscription, default) or `openai` (`OPENAI_API_KEY`)
- EZMotion: optional module, enabled by the `ezmotion` row in `AdsFeatureFlag` (see `src/modules/ezmotion/README.md`)

## Local dev

```bash
cd engine
npm install                      # also generates the Prisma client from ../prisma/schema.prisma
set -a; . ../.env.local; set +a  # dev DB + bucket
CODEX_AUTH_FILE=$HOME/.ezcoder/auth.json npm run dev   # local only — never upload this file
npm test && npm run typecheck
```

## Railway (project `komendly-ads`, service `engine`)

- Build: `engine/Dockerfile` (build context = repo root), config `engine/railway.json`.
  The service has `RAILWAY_DOCKERFILE_PATH=engine/Dockerfile` and `RAILWAY_CONFIG_FILE=engine/railway.json`.
- Deploy from the repo root: `railway up --service engine --detach`
- Logs: `railway logs --service engine` · Rollback: `railway redeploy` a previous deployment in the dashboard.
- Volume: `/data` (Codex token store `CODEX_TOKEN_STORE=/data/codex-token.json`, scratch).
- Scale: `ENGINE_CONCURRENCY` (jobs in parallel per replica). Each EZMotion render needs ~1 GB RAM;
  keep motion concurrency at 1–2 per replica. Add replicas for more throughput (the queue is safe for many workers).

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (private network) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_URL_STYLE` | Railway bucket `ads-assets` |
| `ENGINE_SHARED_SECRET` | HMAC for internal HTTP calls from the web app |
| `ADS_HASH_SALT` | same value as the web app |
| `AI_PROVIDER` | `codex` (default) or `openai` |
| `CODEX_AUTH_JSON` | the server's ChatGPT login (see below) |
| `CODEX_TOKEN_STORE` | where refreshed tokens are persisted (`/data/codex-token.json`) |
| `OPENAI_API_KEY` | only when `AI_PROVIDER=openai` |
| `ENGINE_PRICES_JSON` | optional override for cost estimates |

Without `CODEX_AUTH_JSON` the engine still boots, reports `provider:codex` = "Codex login not configured"
(shown on /admin/ads/engine) and leaves AI jobs queued.

## Connect the server's own ChatGPT account (one time)

Use a **separate** ChatGPT account: if the server and your Mac share one login, a token refresh on one
side signs the other out. This logs in inside a throwaway home folder so your own login is untouched:

```bash
export LOGIN_HOME=$(mktemp -d)
HOME=$LOGIN_HOME npx -y @prestyj/cli login        # choose OpenAI (ChatGPT), sign in with the server account
cd /Users/groot/Komendly
railway variables --service engine --set "CODEX_AUTH_JSON=$(python3 -c "import json;print(json.dumps(json.load(open('$LOGIN_HOME/.ezcoder/auth.json'))['openai']))")"
rm -rf "$LOGIN_HOME"
```

Setting the variable redeploys the service. Check `/admin/ads/engine` (or `railway logs --service engine`)
for `provider:codex ok`. After that the engine refreshes and stores its own tokens in `/data`.
If the login ever expires, the admin page shows an alert; repeat the steps above.

## Switching to OpenAI API keys

`railway variables --service engine --set AI_PROVIDER=openai --set OPENAI_API_KEY=sk-...`
