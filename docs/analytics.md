# Ads funnel analytics & A/B tests

Vendor-free: events go to the existing GA4 property (G-THCR5EQWY2) via `track()` in `src/lib/analytics/track.ts`.
Every event carries the visitor's experiment variants as `exp_<key>` params.

## Funnel (in order)
landing_view → url_submit → sign_up → run_started → first_ad_ready → begin_checkout → purchase

Supporting: url_focus, url_invalid, goal_select, signup_view, login, run_start_failed, extraction_review_shown,
run_confirmed, run_completed, run_failed, ad_downloaded, upsell_view.

Run milestones come from real run state (`useRunFunnelTracking`) and fire once per run per browser.
Server-side the existing `trackAdsEvent` DB events keep running unchanged (source of truth for revenue).

## Experiments
- Defined in `src/lib/analytics/experiments.ts` (`EXPERIMENTS`). variants[0] = control.
- Middleware assigns a stable anon id (`kmd_aid`, httpOnly) and variants (`kmd_exp`) on page requests; deterministic hash, so
  server render and client events agree.
- Read on the server with `getVariant("home_hero")` (`server-experiments.ts`).
- QA: append `?exp=home_hero.companion` to force a variant.
- Stop a test: set `active: false` (everyone gets control). New test: add a key; never reuse a key.

## GA4 setup (one-time, in GA4 admin)
1. Register custom dimensions (event scope): `exp_home_hero`, `goal`, `is_trial`, `placement`, `code`.
2. Mark `sign_up`, `first_ad_ready`, `purchase` as key events.
3. Explore → Funnel exploration with the funnel steps above, breakdown by `exp_home_hero`.

## Testimonials funnel (`/testimonials`)
landing_view → review_submit → signup_view → sign_up → begin_checkout → purchase → video_started → video_ready

Every event carries `product: "testimonials"`. Supporting: review_focus, offer_view (first-video offer card seen),
video_failed. `begin_checkout`/`purchase` carry `offer: "first_video"` or `plan`, and `value` in USD.
- landing_view, offer_view: `/testimonials` (TrackOnMount, once per browser for offer_view).
- review_submit: the landing "paste your review" form saves a draft to localStorage (`kmd_testimonial_draft`), no signup needed.
- signup_view / sign_up: `/register` (`flow=first_video` when coming from the draft).
- begin_checkout: right before redirecting to Stripe (first-video offer or a plan).
- purchase: `/checkout/success` after the server verified the paid session (fires once per session id).
- video_started / video_ready / video_failed: `/dashboard/create-fal/generate`, from the real start/status APIs (once per video id).

## Meta (Pixel + Conversions API) and source attribution

Browser pixel: `src/components/analytics/meta-pixel.tsx` (root layout; PageView on every route change), mapped from `track()` in `src/lib/analytics/meta-pixel.ts`. Server CAPI: `trackAdsEvent` (`src/lib/ads/events.ts`) forwards mapped events via `src/lib/ads/meta-forward.ts` → `meta-capi.ts` (background, 2.5 s timeout, no-op without token). Browser and server send the same `event_id` so Meta dedupes; the server hands its id to the browser in a 10-minute `kmd_meid_<Event>` cookie.

| Step | GA4 (`track`) | Pixel | CAPI | AdsEvent | event_id |
|---|---|---|---|---|---|
| Landing | `landing_view` | ViewContent (also `offer_view`, `upsell_view`) | — | `visit_landed` (1 per visitor per UTC day, `/api/ads/landed`) | — |
| Sign-up | `sign_up` | CompleteRegistration | CompleteRegistration | `signed_up` | `CompleteRegistration:<workspaceId>` |
| Trial submitted | `run_started` | StartTrial (trial runs only) | StartTrial | `trial_started` | `StartTrial:<runId>` |
| Trial finished | `run_completed` | TrialCompleted (custom) | TrialCompleted (`/api/ads/runs/[id]/trial-completed`; the engine writes `run_completed`) | `run_completed` | `TrialCompleted:<runId>` |
| Checkout | `begin_checkout` | InitiateCheckout | InitiateCheckout | `checkout_started` | `InitiateCheckout:<workspaceId>:<ms>` |
| Paid (any checkout: plan, offer, credit pack) | `purchase` | Purchase (+ Subscribe for subscriptions), with value | same | `purchased` (webhook, once per session) | `Purchase:<checkoutSessionId>` / `Subscribe:<checkoutSessionId>` |
| First subscription invoice | — | — | — | `paid_converted` (DB only) | — |
| Renewal | — | — | Renewal (custom), with value | `renewed` (once per invoice) | `Renewal:<invoiceId>` |

CAPI user data: sha256 email, sha256 user id (`external_id`), IP, user agent, `fbc`, `fbp`, `event_source_url`; `action_source: website`. Webhook events (no browser) reuse the attribution saved in `props.meta` on `signed_up`.

**Attribution cookies** (middleware, `src/lib/analytics/first-touch.ts`): `kmd_ft` first touch (once, 90 days) and `kmd_lt` last touch (every attributed visit): utm_*, `fbclid`, `fbc` (`fb.1.<ms>.<fbclid>`), external referrer host, landing path. `_fbc` is set from fbclid when missing. A visit counts as attributed when it has a UTM, fbclid or external referrer.

**Admin:** `/admin/ads/funnel` (API `/api/admin/ads/funnel?from&to&by=channel|source|campaign|content`): landed → signed up → trial finished → paid → active at 30 days / now, revenue, 30-day gross profit (revenue − provider cost), weekly sign-up cohorts, and Meta campaigns (spend, CPC, cost per sign-up/trial, CAC, GP30 ÷ spend). Channels: `meta_paid` (fbclid or utm_source facebook/instagram/meta/fb/ig), `blog`, `campaign` (other UTM), `referral`, `direct`. Spend joins on `utm_campaign` = Meta campaign id or name, so use `utm_campaign={{campaign.id}}` in ad URLs. Logic: `src/lib/ads/funnel.ts` (tests in `src/lib/ads/__tests__/funnel.test.ts`).

**Env vars (Vercel):**
- `NEXT_PUBLIC_META_PIXEL_ID` = `2076490092891007` ("Komendly Pixel", AI Consulting ad account act_838454441892655, Home Sales TV business; default if unset)
- `META_CAPI_TOKEN`: system-user token for CAPI (unset = no server events)
- `META_CAPI_TEST_CODE`: only while testing in Events Manager → Test events; remove after
- `META_ADS_TOKEN`: token with `ads_read` for spend (falls back to `META_CAPI_TOKEN`)
- `META_AD_ACCOUNT_ID` = `act_1460244746175741` (unset = spend shows 0)
