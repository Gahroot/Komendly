<!-- gg:init:start -->
# Komendly

Paid SaaS on one Next.js app + one Postgres DB: **testimonials** (reviews → AI-avatar videos), **Website2ads** (website → ad creatives, published to Meta) and **Ozzy Studio** (chat-directed promo/launch videos), plus its own acquisition systems (Kly cold email, blog-engine).

## Parts
- Testimonials: `src/lib/{fal,mirage,kie,fal-lipsync}`. Media lives on FAL/vendor URLs, not S3.
- Website2ads: `src/lib/ads` (credit ledger, trial/abuse, S3 presigned URLs ≤10 min, Meta publishing).
- Agent access: `api/mcp`, `api/oauth`, `src/lib/agent-keys` (`kmd_` Bearer keys). `packages/komendly-cli` is the npm `komendly`/`ozzy` CLI that calls these public APIs.
- `engine/` (Node ≥22, ESM, tsx, Railway): ad rendering, Studio turns, gift/autopilot pipelines.
- `kly/` (Railway, port 4200): cold-email worker (leads, gift ads, SMTP/IMAP). State in `Kly*`/`Outbound*` models.
- `blog-engine/`: separate Railway service with its own Postgres; it only opens PRs into `content/blog`.

## Architecture
- **Web, engine and kly never talk over HTTP; only through Postgres.** The web app inserts `AdJob` rows (also `studio_turn|probe|ingest|capture` for Studio) and the engine claims them with `FOR UPDATE SKIP LOCKED`. Kly inserts gift `AdRun`/`AdJob` rows and waits for the engine. Studio progress is streamed as `StudioEvent` rows (the SSE route tails them).
- **There are two billing systems.** Testimonials use a Stripe subscription + credit packs (`/api/stripe/webhooks`). Ads use a workspace credit ledger (`/api/ads-billing/webhook`, `STRIPE_ADS_WEBHOOK_SECRET`).
- **Auth is custom:** a random `session_token` cookie backed by the `Session` table, with PBKDF2 hashes. No NextAuth or JWT. On `/api/*`, a `Authorization: Bearer kmd_…` request skips the cookie logic. Middleware then stamps `x-kmd-route`, which `src/lib/auth.ts` trusts, and refuses paths matched by `isRefusedForApiKey`. Changing them can break published CLI versions.
- `src/lib/video-queue.ts` is an in-memory Map: lost on restart and not shared across serverless instances.

## Gotchas
- **The engine and kly Dockerfiles COPY a whitelist of individual shared files** (`src/lib/...`, and for kly also `engine/src/{db,providers,queue,net,util}`). A new import of a web/engine file passes tsc locally but crashes the Railway image (module not found). Add it to the COPY list. Packages used by shared files must also be in that service's `package.json`, because `/app/node_modules` is symlinked to the service's `node_modules`.
- Files the engine imports (`src/lib/ads/contracts.ts`, `src/lib/studio/contracts.ts`, etc.) must stay pure TS + zod: no Next, Prisma or Node-only imports.
- **The schema is shared by web, engine and kly. Ship schema changes together.** There is no `prisma/migrations`. Set both `DATABASE_URL` (pooled) and `POSTGRES_URL_NON_POOLING` (`directUrl`).
- **Middleware does not enforce subscriptions.** It only checks that the cookie exists, and the `x-subscription-check` header it sets is on the response and read by nothing. Gated routes and pages must check the subscription in the DB.
- **New public endpoints (webhooks, callbacks, share links) must be added to `publicPrefixes` in `src/middleware.ts`**, or they get a 401 and Stripe/FAL retry forever.
- **Webhooks must call `request.text()` before signature verification.** FAL and video-status webhooks skip verification when their secret is unset.
- **Credit-pack idempotency is `CreditPurchase.stripePaymentId @unique`.** The create must run before the minutes increment, so a replayed event throws first. Never make it an upsert.
- Credit packs raise both `bonusMinutes` and `minutesLimit`, so a renewal reset of `minutesLimit` must add `bonusMinutes` back.
- **Checkout success syncs the subscription directly** (a delayed webhook once left Pro users at 0 minutes). The webhook may process the same event, so both paths must stay idempotent.
- Ads refund clawbacks are clamped at 0, because credits may already be spent. Billing webhooks skip invoices issued from admin.
- **Read API keys inside functions, not as module constants.** A module-level key was undefined on Vercel serverless.
- **Caching lives in `next.config.ts` `headers()`.** `/` is `private, no-store` (session + A/B variant). A new authenticated top-level route must be added to the exclusion regex there, or the CDN caches it publicly.
- **OG image routes read fonts and images from disk.** Each new one needs an `outputFileTracingIncludes` entry (`src/lib/og/fonts/**`, `public/brand/**`), or it breaks only in production.
- **What deploys:**
  - `.vercelignore` drops `*.png` except `public/**` and `src/app/*.png`, and also drops `engine/`, `scripts/`, tests and `.env*`.
  - `.gitignore` ignores `*.mp4` except `public/**/*.mp4`. Vercel deploys from git, so site videos must live there.
- **Kly safety:** sending needs `KlySettings.enabled`, AdsFeatureFlag `outbound` and `OUTBOUND_ENABLED=1`. Inbound replies, bounces and unsubscribes are still processed when it is off. Engine and kly are single-replica on purpose (ticks must not overlap).
- **The VEO REFERENCE_2_VIDEO prompt must not describe appearance.** The reference image sets the look (`src/lib/fal-lipsync/veo3.ts`).

## Workflows
- **No workspaces.** Each of root, `engine/`, `kly/`, `blog-engine/` and `packages/komendly-cli/` has its own lockfile and `npm install`.
- **After a schema change:** run `node scripts/prisma-generate.mjs` in both `engine/` and `kly/` (postinstall also runs it). It regenerates each client from the root schema with the Debian binary target.
- **Tests:**
  - Web: `npx vitest run` (no script). It only picks up `src/**/__tests__/**/*.test.ts`, loads `.env.local`, and may hit real services.
  - `engine/` and `kly/`: `npm test` and `npm run typecheck`.
  - CLI: `npm test` in `packages/komendly-cli`.
- **Engine/kly local runs:** neither auto-loads env, so run `set -a; . ../.env.local; set +a; npm run dev` first.
- **Engine/kly Railway builds** use the **repo root as context**: `docker build -f engine/Dockerfile .` (same for `kly/`). The health check is `/healthz`; the engine runs on port 4100.
- **Scripts** (`npx tsx scripts/<x>.ts`) load env differently; check each file's header.
  - `ads-*`, `oauth-e2e`, `outbound-run`: source `.env.local` first.
  - `set-admin`, `experiment-readout`: use `--env-file=.env.local`.
  - `ads-stripe-setup` targets test mode unless `--live` is passed.
- **Web deploy:** Vercel (`prisma generate && next build`). There is no CI.
<!-- gg:init:end -->

## Blog & SEO
- **Content contract:** posts are `content/blog/<slug>.md(x)`; frontmatter per `docs/blog-contract.md` (title, description, date, updated, author, type, tags, published, answer, key_takeaways, competitors, cta, faq, sources...). `published: false` = draft (404, not in sitemap/feeds). Body cites `[^n]` = `sources[].id`; the site renders the Sources list and CTAs itself. `blog-engine/` writes posts; don't hand-edit its folder.
- **Where it lives:** parsing `src/lib/blog.ts` (categories, tag slugs, `ctaHref` UTM links); body transforms (footnotes, TOC, inline CTA slot) `src/lib/blog-content.ts`; authors `src/lib/authors.ts` ("Komendly Team"/missing -> Nolan Grout); JSON-LD builders `src/lib/seo/jsonld.ts`; llms.txt/llms-full.txt/RSS builders `src/lib/seo/llms.ts`; private/noindex paths + AI crawler list `src/lib/seo/crawl.ts` (used by `src/app/robots.ts`; `X-Robots-Tag` headers in `next.config.ts`). Post parts: `src/components/blog/post-parts.tsx`. Hubs: `/blog/category/[type]`, `/blog/author/[slug]`, `/blog/tag/[tag]` (noindex under 2 posts). Tests: `npx vitest run src/lib/__tests__`.
- Titles: the root template appends ` | Komendly`; never add it in page titles.
- **Attribution:** middleware stores the first visit's UTM params in the `kmd_ft` cookie; `/api/ads/auth/signup` records `AdsEvent` `signed_up` with `props.firstTouch` (blog CTAs: `utm_campaign` = post slug, `utm_content` = inline|end).
- IndexNow key file: `public/78c8478292a52ad65d0087edc113df99.txt`.
- `blog-engine/` (separate Railway service `blog-engine`, own Postgres) writes posts as PRs and auto-merges them after its gate. See `blog-engine/README.md`.

