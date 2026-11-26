# Ozzy short-video pipeline (Reels / Shorts / TikTok)

System `reels`, kill switch `AdsFeatureFlag sys_reels` (missing = OFF). Code: `src/lib/growth/reels-core.ts` (pure rules, hooks, captions, caps, queue),
`reels-learning.ts` (ranking, explore/exploit), `engine/src/growth/reels.ts` (render), `kly/src/reels.ts` (publish + weekly insights),
`src/lib/kly/social-core.ts` (Graph calls), `src/app/api/reels/**` (video URL + desktop queue).

## Flow (no human, no manual voice)
1. **Engine** (every 6h, flag on): keeps a backlog of at most `cap+1` unpublished reels. Picks the next hook (70% from best-scoring hooks, 30% never-used
   hooks, suspended formats skipped, never a repeated hook+asset hash), builds the script, runs `checkScript` + `checkReelCaption` + the AI **review gate**
   (`src/lib/growth/review-gate.ts`, fails closed), renders a 1080x1920, 15-30s, H.264 MP4 with captions burned in (sharp SVG frames + ffmpeg, Ozzy art and the
   trade's sample-ad poster from the public site), stores `reels/<id>/silent.mp4` + `script.txt` in the engine's S3 bucket, writes AdsEvent `reel_ready`
   and one `social_queue` row per other platform.
2. **Kly** (its normal loop, needs `KlySettings.socialEnabled` + the connected Page): publishes `reel_ready` to a Facebook Reel and an Instagram Reel.
   Meta pulls `https://www.komendly.com/api/reels/<id>/video` (302 to a 10-min presigned S3 URL; public prefix in `src/middleware.ts`).
3. **Weekly**: kly reads Graph insights, stores `reel_insights` + `reel_learning`; the engine ranks them for the next picks.
   `npx tsx --env-file=.env.local scripts/reels-learnings-sync.ts` appends the learnings to `docs/growth-ecosystem/learnings.md`.

Content unit (Hormozi): HOOK in the first 3s that calls out the person ("Roofers: ..."), RETAIN (3 steps / before-after / how I), REWARD (a real tip or an
ad makeover), "how I" not "how to". Give:ask 10:1: every 10th reel carries ONE soft CTA ("Free ads from your website, link in bio"; Facebook caption
gets the UTM link), the rest are give-only. Every caption says **"Made by Ozzy, AI"** and "animated cartoon"; "before" ads are labelled made-up. No
fake customers/results, no promised leads. Formats: tip_list, makeover, how_i x 8 trades = 40 hooks.

## Turn on
- Flag: admin flag table `sys_reels` ON (engine + kly both read it). Kill = turn it off (kly stops publishing, engine stops rendering; the static post resumes).
- Env: `REELS_PER_DAY` (default 1, max 3), `REELS_INTERVAL_HOURS` (6), `REELS_DAILY_COST_CAP_MICROS` (default 500000 = $0.50, estimated AI-review spend), plus
  the existing social setup (`ADS_TOKEN_KEY`, connected Page in admin, `KlySettings.socialEnabled`, `socialHourEt`). Engine needs ffmpeg + S3 env (already).
- Deploy engine + kly together (`engine/Dockerfile` and `kly/Dockerfile` COPY lists updated). No schema change.
- Bio links (paste once): Facebook/IG/TikTok bio -> `https://www.komendly.com/free-ads?utm_source=<platform>&utm_medium=reel&utm_campaign=bio`.

## Idempotency, caps, safety
- `KlySocialPost` unique(day, platform): reel claims use `platform = "<facebook|instagram>_reel:<slot>"`, `sourceKind="reel"`, `sourceRef=<reelId>`.
  The static daily post keeps `platform = facebook|instagram`. Slots 1..cap; each slot is spaced >= 4h and starts `socialHourEt` + a deterministic 0-180 min jitter.
- Static fallback: while reels are on, the static post is skipped for a platform once a reel went out, or while a reel is ready and < 4h past the posting hour.
  Otherwise (no reel ready, platform paused) the static post goes out as before.
- A failed publish keeps its claim (no retry same slot). Auth/permission/policy errors (`isAuthOrPolicyError`) write AdsEvent `reel_paused {platform}` and
  publishing for that platform stops until an `reel_resumed {platform}` event is inserted (after fixing the token/appeal).
- Generation spend is recorded as AdsEvent `reel_spend` and capped per day.

## Meta: does a dev-mode app need App Review? (conclusion)
No for our own accounts. In Development mode a Meta app can use its permissions (`pages_manage_posts`, `pages_read_engagement`, `instagram_content_publish`,
`instagram_basic`, `pages_show_list`) with Standard Access for people who have a role on the app (admin/developer/tester), on Pages/IG accounts those people
manage. Komendly's Page and the linked Instagram professional account are managed by Nolan (app admin), so no review is needed, and published posts are public.
App Review is only for other people's accounts. Conditions: IG must be a Professional account linked to the Page; the Page token must come from an admin; video
must be a public MP4 (H.264/AAC, 9:16, 3-90s IG / 3-90s FB Reels). Source: Meta Reels Publishing API guide + Facebook permissions docs; **not live-tested here**
(the Meta docs site returned HTTP 400 to our fetcher, parameters were cross-checked against the Ayrshare/Meta guide and the doc text). Verify with the first real run.

Facebook Reel = 3 phases on `/{page-id}/video_reels`: `upload_phase=start` -> POST `upload_url` (rupload.facebook.com) with headers `Authorization: OAuth <token>`
and `file_url: <public mp4>` -> poll `/{video-id}?fields=status` -> `upload_phase=finish&video_id&video_state=PUBLISHED&description`. Instagram Reel = `/{ig-id}/media`
(`media_type=REELS`, `video_url`, `caption`, `share_to_feed=true`) -> poll `status_code` until FINISHED -> `/{ig-id}/media_publish`.
Insights: IG `views, reach, shares, saved, likes, comments, follows` (each metric requested alone, a rejected one is skipped); FB `blue_reels_play_count, post_impressions_unique,
...` via `video_insights`. Metric names are unverified against a live account; if a read fails the job logs "insights unavailable" and the week is "no learning", never an error.
Link clicks have no Graph metric for reels: clicks/sign-ups are attributed through the UTM links and the `kmd_ft` cookie (`utm_source=<platform>&utm_medium=reel&utm_campaign=<hookId>`).

## Other platforms: PublishQueue (AdsEvent `social_queue`)
Rows are created with a checked title/caption/hashtags per platform (`buildQueueItem`), status `queued|publishing|posted|failed|paused`, retry with 1h/2h/4h/8h backoff,
5 attempts, auth/policy error = `paused`. We do not automate logins or captchas.

| Platform | Needs |
|---|---|
| YouTube Shorts | Data API `videos.insert` from an unverified project is forced **private**: needs the API compliance audit. Until then upload in YouTube Studio (title ends `#Shorts`, tick "altered or synthetic content"). |
| TikTok | Content Posting API: unaudited apps post private-only; needs audit. Until then upload in TikTok web (turn on "AI-generated content" label). No links in captions. |
| LinkedIn | Community Management API approval for the Company Page; otherwise post in the logged-in browser. |
| X | API v2 media upload + a paid API tier; otherwise the logged-in browser. 280 chars incl. disclosure. |
| Pinterest | API Standard access (trial = sandbox only); otherwise the logged-in browser. |
| Threads | `threads_content_publish` via the same Meta app (works for app admins in dev mode); can be automated later. |

**Desktop agent / Media Master contract** (`/api/reels/queue`, `Authorization: Bearer $REELS_AGENT_TOKEN` or `CRON_SECRET`; set the env on Vercel):
- `GET` -> `{items:[{id, platform, title, caption, hashtags, link, reelId, videoUrl (10-min presigned), voiced, script}]}` for due items.
- After posting: `POST {action:"status", id, ok:true, postUrl}`; on failure `{ok:false, error}` (backoff/pause is applied server side).
- Media Master's publisher can consume exactly this JSON. (MM's packages were not read for this task; align there when wiring.)

## External voice (Nolan's cloned-voice "motion agent")
Default output is **silent + burned-in captions** (works muted; no TTS provider is wired: the existing TTS is FAL, tied to testimonial actors/cost, and was not reused).
Each reel has `script.txt` (spoken script) and `silent.mp4`. A local agent can: `GET /api/reels/queue` (or read `reel_ready.script`), record/clone the voice,
mux it onto the silent video (keep 1080x1920, 15-30s), then `POST {action:"voiced-upload", reelId}` -> PUT the file to the returned URL (`Content-Type: video/mp4`)
-> `POST {action:"voiced", reelId}`. From then on `/api/reels/<id>/video` and queue `videoUrl` serve `voiced.mp4`. Only reels not yet published pick it up.

## Not built / honest gaps
Ozzy-in-video TTS default; ad-of-the-week consent clips as reel footage (reels use made-up trade examples + Ozzy art + sample posters); admin scoreboard/UI panel
(attribution is readable from first-touch `utm_medium=reel` in the existing scoreboard); Media Master code alignment.
