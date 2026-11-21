# Komendly for Jobber: App Marketplace listing package

Growth system `jobber` (kill switch AdsFeatureFlag `sys_jobber`, missing row = OFF; attribution `utm_source=jobber`).

## Listing

- **App name:** Komendly: Facebook Ads
- **Tagline (short):** Free Facebook & Instagram ads from your website, then fresh ad ideas from every job you finish.
- **Description:**
  Komendly makes Facebook and Instagram ads for home-service businesses: roofers, HVAC, plumbers, electricians, cleaners, landscapers. Connect Jobber, paste your website, and Ozzy (Komendly's AI ad maker) makes your first 3 ads free in a few minutes, in your brand's look, with headlines and ad copy.
  After that, the jobs you close in Jobber become ad ideas. When you finish a "roof replacement in Austin, TX", Komendly uses it to steer your next weekly ads, so your ads always show the work you're doing right now.
  Read-only. Komendly never changes anything in Jobber and doesn't keep client names, phone numbers or street addresses, only the service and the city.
  Pricing: connecting and the first 3 ads are free. Ozzy Ad Department (fresh ads every week) is $97 for the first month, then $197/month, billed by Komendly.
- **Category:** Marketing
- **App website / learn more:** https://www.komendly.com/integrations/jobber
- **Support URL:** https://www.komendly.com/integrations/jobber (FAQ) and nolan@komendly.com
- **Privacy policy:** https://www.komendly.com/privacy
- **Terms of service:** https://www.komendly.com/terms

## OAuth settings (Developer Center)

- **OAuth Callback URL (exact):** `https://komendly.com/api/integrations/jobber/callback`
  (override with `JOBBER_REDIRECT_URI` if it must be `https://www.komendly.com/...`; the registered value and the env must match exactly. If komendly.com redirects to www, the redirect must keep the query string.)
- **Refresh Token Rotation:** ON (required for the Marketplace; the code always stores the new refresh token before using the new access token).
- **Env vars (Vercel, read inside functions):** `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET` (also the webhook HMAC key), optional `JOBBER_REDIRECT_URI`, `JOBBER_GRAPHQL_VERSION` (default `2026-09-25`). `ADS_TOKEN_KEY` (already set) seals the tokens.

## Scopes and why

| Scope (Developer Center) | Why Komendly needs it |
| --- | --- |
| Read account (always granted) | `account { id name }`: ties the tokens to the Jobber account and greets the business by name. |
| Read jobs | `JOB_CLOSED` webhook + `job(id)`: the service (first line item / job title) of each finished job becomes an ad idea. |
| Read scheduling (visits) | `VISIT_COMPLETE` webhook + `visit(id) { job }`: same idea when a visit is completed before the job is closed. |
| Read clients / properties (only if Jobber requires it for `job.property.address`) | Only the city and state of the job's property, for "in Austin, TX" in the ad idea. No names, emails, phones or street addresses are stored. |

No write scopes. No access to quotes, invoices, payments or timesheets.

## Webhooks (all to `https://komendly.com/api/integrations/jobber/webhook`)

- `APP_DISCONNECT` (required): tokens deleted at once, connection marked disconnected.
- `JOB_CLOSED`, `VISIT_COMPLETE`: ad ideas. Duplicates are ignored per job.
- The route checks `X-Jobber-Hmac-SHA256` against the raw body, logs the delivery and answers right away; the work runs after the response (`after()`), because Jobber wants a reply within 1 second.

## What Jobber's API allows (research, Nov 2026)

- OAuth 2.0 authorization code grant, self-serve: create the app at developer.getjobber.com, choose scopes, test with a tester account (expires after 90 days). PKCE (S256) is supported; the Marketplace "Connect" button sends no `state`/PKCE, so the callback accepts a bare `code` and checks `state` when we started the flow.
- Access tokens are JWTs valid 60 minutes; refresh tokens rotate.
- GraphQL at `https://api.getjobber.com/api/graphql` with the `X-JOBBER-GRAPHQL-VERSION` header; latest version in the changelog is 2026-09-25.
- Webhook payloads carry only `topic`, `accountId`, `itemId`, `occurredAt`; we query the item with the account's token.
- **Reviews: not exposed.** No review object or review webhook topic is in Jobber's public docs, so "new 5-star reviews" can't feed ideas. Finished jobs and visits do. Reviews on the business's website are still read when the free pack is made. Check `__type(name: "WebHookTopicEnum")` in GraphiQL once the dev account exists; if a review topic appears, add it to `IDEA_TOPICS`.
- The business website isn't a documented `account` field, so the member pastes it once on `/ads/jobber` (prefilled on later visits).
- Draft apps work for up to 5 paying accounts without review; the Marketplace needs Jobber's App Review (2FA on, a review meeting covering the user flow, the listing and disconnect handling).

## Housecall Pro: not built

Housecall Pro's public API (docs.housecallpro.com) uses a per-company API key created by an admin on the MAX plan. OAuth for apps serving many companies is **only for approved Integration Partners** (approved by email; fees not published). There's no self-serve OAuth app, so nothing was built. Next step if wanted: apply to the Housecall Pro partner program; the Jobber code (OAuth, sealed tokens, webhook -> idea -> weekly focus) is the template. HCP webhooks are HMAC-SHA256 signed and include job completed events.

## Flow and storage

1. Connect: `/integrations/jobber` button -> `/api/integrations/jobber/authorize` (signed state + PKCE cookie) -> Jobber consent, or the Marketplace's Connect button.
2. `/api/integrations/jobber/callback`: exchange the code, read `account`, save the connection. With `sys_jobber` OFF, new accounts are refused (`appDisconnect` is called) and existing ones keep working.
3. Redirect to `/ads/jobber?c=<signed link>&utm_source=jobber&utm_medium=app_marketplace&utm_campaign=connect`. Middleware records the first touch, so the sign-up is traced to `jobber`. Signed-out visitors go through `/ads/signup?next=...`.
4. Website form -> `/api/integrations/jobber/link`: links the connection to the workspace and calls the normal `startRun` (`src/lib/ads/run-start.ts`, the same path as the web and agent API). New workspaces get the free trial pack, and all trial and abuse rules still apply.
5. Later, each finished job is turned into an idea, and the latest ideas become `AdsAutopilot.focus`, the sentence that steers the Weekly Drop (`engine/src/jobs/weekly.ts`). This only happens while the focus is empty or still the one Jobber wrote, so the member's own focus always wins.

**Token storage (no schema change).** The schema has no generic integration or token model: the `OAuth*` models are Komendly's own OAuth server for MCP clients, and `MetaConnection` is Meta-only. Each Jobber account is therefore one mutable `AdsEvent` row (`name = "jobber_connection"`, `workspaceId`/`userId` set once linked). Its `props` hold AES-256-GCM-sealed access and refresh tokens (`ADS_TOKEN_KEY`, the same sealing as Meta and Shopify), plus status, ideas and the last focus written. Updates are compare-and-swap on `props.rev`, and a refresh claims `props.refreshingUntil`, so a rotated refresh token is never lost to a race. Deliveries are logged as `jobber_webhook` rows. If a real `IntegrationConnection` model is added later, move these rows into it.

## Screenshots plan (Marketplace gallery, 1280x800)

1. Komendly landing for Jobber users: "Facebook ads for your Jobber business" with the Connect button.
2. The `/ads/jobber` page: "Your free ads for <Business>" with the website field.
3. A finished free pack for a roofing site: 3 ads in the run view.
4. The Autopilot card showing a focus written from Jobber ("Fresh proof from Jobber, just finished: roof replacement in Austin, TX...").
5. An ad from the weekly drop built on that finished job.
Use a demo roofing/HVAC business and a Jobber tester account; no real client data.

## Steps left (coordinator)

1. Create the Jobber developer account and app; set the scopes, callback URL and webhooks above; keep Refresh Token Rotation ON.
2. Set `JOBBER_CLIENT_ID` and `JOBBER_CLIENT_SECRET` on Vercel, then turn on `sys_jobber` in admin.
3. In GraphiQL with a tester account, check the field names in `src/lib/integrations/jobber/graphql.ts` (`job { title completedAt property { address { city province } } lineItems { nodes { name } } }`, `visit { job }`, `appDisconnect`), the scope that `property.address` needs, and whether a review topic exists.
4. Run the end-to-end flow (connect, sign up, free pack, close a job, focus updated, disconnect), take the screenshots, then Request Review (2FA on).
5. Optional: add Jobber to `src/lib/integrations.ts` (the `/integrations` hub and llms.txt) and to the sitemap.
