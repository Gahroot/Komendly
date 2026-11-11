<!-- gg:init:start -->
# Komendly

A paid SaaS with two products sharing one Next.js app and one Postgres database: (1) **testimonials**, which turns customer reviews into AI-avatar videos (FAL, Mirage, KIE, lip-sync pipeline); (2) **Website2ads**, which turns a brand's website into ad creatives (rendered by `engine/`, published to Meta).

## Parts
- `src/app/api/{generate,fal-generate,mirage,videos,reviews,webhooks}` + `src/lib/{fal,mirage,kie,fal-lipsync}`: testimonial video jobs. `fal-lipsync` runs split script → TTS → clips → remove silences → ffmpeg stitch → upload to FAL storage. Testimonial media lives on FAL/vendor URLs, not S3.
- `src/app/api/{ads,ads-billing}` + `src/lib/ads`: Website2ads workspaces, credit ledger, abuse/trial checks, job enqueueing, S3 presigned URLs (≤10 min), Meta OAuth/publishing.
- `engine/` (Node ≥22, ESM, Railway): the ads worker. It extracts the brand, plans, generates images, renders (Playwright/hyperframes), runs QC, and publishes.
- `src/app/api/admin` + `/admin`: admin for users, revenue, analytics and engine health (`EngineHeartbeat`).
- `scripts/`, `prisma/seed-*.ts`: one-off ops scripts. None are in package.json.

## Architecture
- **The web app and engine never talk over HTTP; they communicate only through Postgres.** `run-start` reserves credits in `CreditLedger` and inserts `AdJob` rows. The engine claims jobs with `FOR UPDATE SKIP LOCKED`, then writes `Ad`/`AdAsset` rows and uploads to S3-compatible storage (`S3_ENDPOINT`).
- The engine imports `src/lib/ads/contracts` directly and uses the root `prisma/schema.prisma`. Changes there affect both deploys, so ship them together.
- **There are two separate billing systems.** Testimonials use a Stripe subscription plus credit packs (`/api/stripe/webhooks`). Ads use workspace credits in a ledger (`/api/ads-billing/webhook`, `STRIPE_ADS_WEBHOOK_SECRET`).
- **Auth is a custom session.** Login sets a random `session_token` cookie backed by the `Session` table, with PBKDF2 password hashes. It does not use NextAuth or JWT.
- `src/lib/video-queue.ts` keeps state in memory, so it is lost on restart and not shared across serverless instances.

## Gotchas
- **Middleware does not enforce subscriptions.** It only checks that the session cookie exists and sets an `x-subscription-check` header, which nothing reads. Every gated route or page must check the subscription in the database itself.
- **New public endpoints (webhooks, callbacks) must be added to `publicPrefixes` in `src/middleware.ts`.** Otherwise they get a 401 and Stripe/FAL keep retrying. The middleware matcher skips image extensions.
- **Webhooks must call `request.text()` before verifying the signature.** Parsing JSON first breaks the Stripe/HMAC checks. FAL and video-status webhooks skip verification when their secret is unset.
- **Credit-pack idempotency comes from `CreditPurchase.stripePaymentId @unique`.** The create must come before the minutes increment, so a replayed event throws first. Don't turn it into an upsert.
- **Credit packs raise both `bonusMinutes` and `minutesLimit`.** Any renewal reset of `minutesLimit` must add `bonusMinutes` back.
- **Checkout success syncs the subscription directly** (because a delayed webhook once left Pro users with 0 minutes). The webhook can process the same event too, so both paths must stay idempotent.
- **Ads refund clawbacks are clamped at 0**, because the user may already have spent the credits. Invoices issued from admin are skipped in the billing webhook.
- **Read API keys inside functions, not as module-level constants.** A module-level `MIRAGE_API_KEY` was undefined on Vercel serverless.
- **Caching is configured in `next.config.ts` `headers()`.**
  - `/` is `private, no-store` because the content depends on the session and A/B variant.
  - Other marketing pages are cached publicly.
  - A new authenticated top-level route must be added to the exclusion regex there, or a CDN will cache it publicly.
- **OG image routes read fonts and images from disk.** Each new one needs an `outputFileTracingIncludes` entry, or it breaks only in production.
- **`.vercelignore` drops `*.png` except `public/**` and `src/app/*.png`.** It also drops `engine/`, tests and `.env*`. Put new PNGs in those allowed places.
- **The VEO REFERENCE_2_VIDEO prompt must not describe appearance.** The reference image sets the look; the prompt covers only the script and voice (`src/lib/fal-lipsync/veo3.ts`).

## Workflows
- **Schema:** there is no `prisma/migrations` folder (no migration history). Both `DATABASE_URL` (pooled) and `POSTGRES_URL_NON_POOLING` (`directUrl`) must be set.
  - After changing the schema, also run `cd engine && node scripts/prisma-generate.mjs`. It regenerates the engine's client from the root schema with the Debian binary target (`npm install` runs it via postinstall).
- **Web tests:** there is no test script, so run `npx vitest run`. It only picks up `src/**/__tests__/**/*.test.ts`, loads `.env.local`, and may hit real services. Engine tests are separate: `cd engine && npm test`, plus `npm run typecheck`.
- **Scripts:** run with `npx tsx`. They load env in different ways:
  - `ads-*` scripts: `set -a; . ./.env.local; set +a; npx tsx scripts/<x>.ts`. `ads-stripe-setup` targets test mode unless `--live` is passed.
  - `set-admin`: `npx tsx --env-file=.env.local scripts/set-admin.ts <email> [--admin]`.
  - `prisma/seed-*.ts` load no env, so source it first. `prisma db seed` is not wired up.
- **Engine:** `cd engine && npm run dev`. It does not auto-load env; source `../.env.local` first.
  - Railway builds `engine/Dockerfile` with the **repo root as context**: `docker build -f engine/Dockerfile .`.
  - It runs as a single replica on port 4100, with the health check at `/healthz`.
- **Web deploy:** Vercel default Next build (`prisma generate && next build`); there is no CI.
<!-- gg:init:end -->

## Blog & SEO
- **Content contract:** posts are `content/blog/<slug>.md(x)`; frontmatter per `docs/blog-contract.md` (title, description, date, updated, author, type, tags, published, answer, key_takeaways, competitors, cta, faq, sources...). `published: false` = draft (404, not in sitemap/feeds). Body cites `[^n]` = `sources[].id`; the site renders the Sources list and CTAs itself. `blog-engine/` writes posts; don't hand-edit its folder.
- **Where it lives:** parsing `src/lib/blog.ts` (categories, tag slugs, `ctaHref` UTM links); body transforms (footnotes, TOC, inline CTA slot) `src/lib/blog-content.ts`; authors `src/lib/authors.ts` ("Komendly Team"/missing -> Nolan Grout); JSON-LD builders `src/lib/seo/jsonld.ts`; llms.txt/llms-full.txt/RSS builders `src/lib/seo/llms.ts`; private/noindex paths + AI crawler list `src/lib/seo/crawl.ts` (used by `src/app/robots.ts`; `X-Robots-Tag` headers in `next.config.ts`). Post parts: `src/components/blog/post-parts.tsx`. Hubs: `/blog/category/[type]`, `/blog/author/[slug]`, `/blog/tag/[tag]` (noindex under 2 posts). Tests: `npx vitest run src/lib/__tests__`.
- Titles: the root template appends ` | Komendly`; never add it in page titles.
- **Attribution:** middleware stores the first visit's UTM params in the `kmd_ft` cookie; `/api/ads/auth/signup` records `AdsEvent` `signed_up` with `props.firstTouch` (blog CTAs: `utm_campaign` = post slug, `utm_content` = inline|end).
- IndexNow key file: `public/78c8478292a52ad65d0087edc113df99.txt`.
- `blog-engine/` (separate Railway service `blog-engine`, own Postgres) writes posts as PRs and auto-merges them after its gate. See `blog-engine/README.md`.

