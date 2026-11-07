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
