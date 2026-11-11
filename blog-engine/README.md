# Komendly blog engine

Node 24 service on Railway (project `komendly-ads`, service `blog-engine`, its own Postgres `blog-db`, a volume at `/data`).
It writes SEO/AEO posts for komendly.com in the format set by CONTRACT.md (`content/blog/<slug>.md`), opens PRs on
`Gahroot/Komendly`, and merges them itself through an automated gate. A merge to `main` deploys production through Vercel.
It never talks to the Komendly app or its database.

- **API** (`src/api.js`): `GET /api/health`, `GET /api/admin/status` and `GET|POST /api/admin/run/<job>` (Bearer `ADMIN_TOKEN`).
  `status` shows `db.connected`, `codex` (`installed`, `loggedIn`, `lastRefresh`, `lastSuccess`, `lastError`, `backoffUntil`, `callsLast7Days`, `weeklyCap`), `github` (`tokenSet`, `repoAccess`), whether `gsc` and `bing` are configured, topic backlog counts, the last 20 `job_runs` and the last run of each job.
- **Scheduler** (`src/scheduler.js`, `src/jobs.js`): times are New York. Every run is written to `job_runs`. A failing run is retried 3 times with backoff. On boot, missed slots are caught up, and a lock stops runs overlapping. A job that still fails opens or updates a GitHub issue labelled `engine-alert`. If Codex is unavailable, the run is recorded as `deferred` and its slot is retried every hour, with no alert. A job missing a key is recorded as `skipped`.

| Job | When (NY) | What it does |
|---|---|---|
| monitor | daily 6:00 | Fetches GSC clicks/impressions/position per page+query, inspects the URLs of published posts, fetches Bing query stats and checks the sitemap. Signups-by-UTM is only a hook (`signupsByCampaign`) and is not connected. |
| research | Sun 0:00 | Sends GSC queries, competitor seed data and the existing posts to Codex, then adds new topics to the `topics` backlog (source `research`, priority 1–5, duplicates skipped). |
| draft | daily 1:00 + 3:00 | Writes one post per run, up to `DRAFTS_PER_DAY` (default 2). It takes the highest-priority open topic, skipping any that duplicate posts in `content/blog`, and writes with Codex using live web search. It links internally to related posts, `/pricing` and `/`, verifies sources, makes one repair pass, opens PR `blog/<slug>`, then gates it. |
| gate | hourly | Runs the approval gate below. |
| optimize | Fri 2:00 | Opens a refresh PR for the post with low CTR or an average position of 5–20 (minimum `OPTIMIZE_MIN_IMPRESSIONS`, default 100) and gates it. |
| audit | Sat 4:00 | Re-checks up to `AUDIT_MAX_PER_RUN` (2) published posts not audited in `AUDIT_EVERY_DAYS` (30). This includes the 12 older hand-written posts, which contain unsourced stats such as "79% of consumers". A post that fails gets a refresh PR, rewritten into the CONTRACT.md format with every stat cited or removed, keeping its original `date`. The live post stays up until the gate merges the rewrite. |
| ai_visibility | Wed 5:00, even ISO weeks | Asks ChatGPT (Codex with `web_search="live"`) up to 12 target questions and records whether komendly.com is cited, mentioned or recommended. |
| codex_keepalive | Sat 5:00 | Sends one tiny `codex exec` so the login refreshes in quiet weeks. |
| report | Mon 8:00 | Opens a GitHub issue labelled `weekly-report` (also saved in the DB). |

The seed files `seed/topics.json` (backlog, priority order) and `seed/competitors.json` are loaded into the backlog idempotently. If they are missing, the backlog simply stays empty.

## Approval gate (AUTO_PUBLISH=true, the default)

Every engine PR must pass all of these checks:
1. **Sources resolve.** Every source is https on a real host (competitor sites are fine; shorteners, search pages and komendly.com are not) and answers 2xx/3xx. A bot wall (401/403/429) counts as resolving.
2. **Validator.** Checks against CONTRACT.md:
   - Frontmatter: author Nolan Grout, slug = filename, description 120–160 chars, answer 40–70 words.
   - Citations: every `[^n]` maps to a source id and every claim names a source.
   - MDX safety: no raw HTML/JSX, `<` or `{` outside code.
   - Dates (owner rule, no backdating): `date` is the real publish day and is set at merge. It may not be earlier than the PR's creation day or in the future. A refresh keeps its original `date` and only bumps `updated`.
3. **Claims lint** (`src/claims.js`):
   - Komendly prices and credits must match **billing-config.ts on GitHub main**, parsed at runtime.
   - No customer counts, ratings, testimonials or Komendly performance stats.
   - Any statistic needs a citation.
   - Competitor prices must be cited and say "as of <Month YYYY>".
   - Nothing disparaging.
4. **Independent fact-check.** A separate, fresh Codex session with its own skeptical prompt opens each source and rates every claim. Only all-`supported` with no unlisted factual statements passes.

**Pass:** the engine sets `published: true`, `status: approved`, `approved_by: auto-review (Komendly blog engine)` and the dates, then pushes. It waits for the head commit's **`Vercel`** commit status to be `success`; if that takes longer than 20 min, the next hourly run keeps waiting. Then it squash-merges, deletes the branch, waits for the URL to serve 200 and pings IndexNow.
**Fail:** if the problem is in the content, the writer revises up to 3 times. After that nothing is merged: the PR gets the `needs-review` label and a comment, and a `needs-review` issue is opened for the owner. The PR is re-gated after a new commit. A repo-owner `/approve` comment overrides the gate.
Only the fact-check step is held to the Codex night window. Waiting for Vercel, merges, `/approve` and IndexNow run at any hour.

## Codex-only mode, and sharing the subscription politely

Every AI call (research, drafting, repairs, revisions, fact-check, AI visibility) runs `codex exec` on the owner's ChatGPT subscription. Paid APIs are never called. The same subscription also powers the paying-customer ads engine (`../engine`), so this engine uses it lightly:
- Codex runs only between **23:00 and 08:00 NY**. Change this with `CODEX_ANYTIME=true` or `CODEX_NIGHT_START`/`CODEX_NIGHT_END`.
- There is a weekly cap, `CODEX_MAX_CALLS_PER_WEEK` (default 120; the keep-alive is not counted).
- A usage-limit reply pauses Codex for 24 h. Only one Codex process runs at a time, and each call times out after 25 min.
- An auth error opens one `engine-alert` issue, "Codex login needs renewing", at most once every 7 days.

Each call is `codex exec --skip-git-repo-check --ephemeral --sandbox read-only -c approval_policy="never" -c model_reasoning_effort="$CODEX_REASONING_EFFORT" [-c web_search="live"] -m $CODEX_MODEL`, run in an empty temp dir. The login lives in `$CODEX_HOME/auth.json` (`/data/codex` on the volume). The engine only reads `auth_mode` and `last_refresh` from it and never prints or copies it. The image pins `@openai/codex@0.167.0`.

## Variables

| Name | Secret | Notes |
|---|---|---|
| DATABASE_URL | | `${{blog-db.DATABASE_URL}}`: its own Postgres, never the app DB |
| ADMIN_TOKEN | yes | random |
| SITE_URL | | `https://komendly.com` |
| GSC_SITE_URL | | `sc-domain:komendly.com` (default) or the URL-prefix property |
| GITHUB_REPO | | `Gahroot/Komendly` |
| GITHUB_TOKEN | yes | fine-grained token on Gahroot/Komendly with Contents, Pull requests and Issues read/write, plus Commit statuses read |
| GSC_SERVICE_ACCOUNT_JSON | yes | service-account JSON key (Search Console API enabled) |
| BING_API_KEY | yes | Bing Webmaster Tools API key |
| TZ | | `America/New_York` |
| LLM_PROVIDER_ORDER | | `codex` (the default and the only supported value) |
| CODEX_MODEL / CODEX_REASONING_EFFORT | | `gpt-6.1-sol` / `high` |
| CODEX_MAX_CALLS_PER_WEEK | | default 120 |
| CODEX_ANYTIME, CODEX_NIGHT_START, CODEX_NIGHT_END, CODEX_TIMEOUT_MS | | optional |
| AUTO_PUBLISH | | `true` (default). `false` = the engine never merges; `/approve` only approves |
| INDEXNOW_KEY | | `78c8478292a52ad65d0087edc113df99` (key file is `public/<key>.txt` on the site) |
| DRAFTS_PER_DAY | | default 2 (steady pace, no launch burst) |
| GATE_MAX_REVISIONS, GATE_CI_TIMEOUT_MS, GATE_CI_POLL_MS, GATE_STATUS_CONTEXT, GATE_LIVE_TIMEOUT_MS | | optional (3, 20 min, 30 s, `Vercel`, 10 min) |
| OPTIMIZE_MIN_IMPRESSIONS, AUDIT_EVERY_DAYS, AUDIT_MAX_PER_RUN, AI_VIS_MAX_QUESTIONS | | optional |
| APPROVER_NAME, GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL | | optional |
| SCHEDULER | | `off` = API only |

Set variables with `cd /Users/groot/Komendly/blog-engine && railway variables --service blog-engine --set "NAME=value"`.

## Owner one-time steps

1. **Codex login** (a separate device login for the server; never copy `~/.codex` from your Mac):
   ```bash
   cd /Users/groot/Komendly/blog-engine && railway ssh --service blog-engine
   codex login --device-auth      # open the URL, enter the code
   ```
   You may first need to enable device code login in ChatGPT settings → Security. Afterwards `/api/admin/status` shows `codex.loggedIn: true`.
2. **Search Console:** add the service account's `client_email` (from `GSC_SERVICE_ACCOUNT_JSON`) as a user on the komendly.com property (Settings → Users and permissions; Restricted is enough).
3. **Bing:** komendly.com must be verified in Bing Webmaster Tools for the account that owns `BING_API_KEY`.

## Run by hand

```bash
cd /Users/groot/Komendly/blog-engine
T=$(railway variables --service blog-engine --kv | grep '^ADMIN_TOKEN=' | cut -d= -f2-)
URL=https://<blog-engine domain>
curl -H "Authorization: Bearer $T" $URL/api/admin/status
curl -H "Authorization: Bearer $T" $URL/api/admin/run/draft    # monitor|research|draft|gate|optimize|audit|ai_visibility|report|codex_keepalive
```
Codex jobs started by hand during the day are deferred until 23:00 NY unless `CODEX_ANYTIME=true`.

## Develop and deploy

```bash
cd blog-engine && npm ci && npm test          # offline: node --test with pg-mem
railway up --service blog-engine              # build context = blog-engine/ (Dockerfile, railway.json healthcheck /api/health)
railway logs --service blog-engine
```

Prices: change `src/lib/ads/billing-config.ts` in the app. The engine reads it from `main` on every draft and gate run, falling back to the list in `knowledge/komendly.md`. Non-price product facts live in `knowledge/komendly.md`.
