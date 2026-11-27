# Offer intelligence, CRO experiments, pricing analysis, coherence checks

Kill switch: AdsFeatureFlag `sys_offer_intel` (system `offer_intel`, default OFF). While off, every surface shows today's copy (control), no exposures are logged, the weekly job does nothing.

## Experiment surfaces (copy and ordering only, never prices or claims)
Code defaults in `src/lib/offer-intel/variants.ts` (6 experiments, max 2 running per surface), served by `src/lib/offer-intel/server.ts`:
| Surface | Where | Metric |
|---|---|---|
| `home_hero` | `src/app/page.tsx` -> `StudioHero` (server-side, no flash) | `signed_up` |
| `free_ads_hero` | `/free-ads` via `FreeAdsHeroText` (page is CDN-cached, so resolved on the client; control renders first) | `signed_up` |
| `unlock_upsell` | `unlock-upsell-modal.tsx` (title/lead, first-month framing) | `offer_clicked` |
| `autopilot_card` | `autopilot-offer-card.tsx` (guarantee above/below button, objection order) | `checkout_started` |

- Subject = cookie `kmd_vid` (same value as `kmd_aid`, set in `src/middleware.ts`), stable across login, so nobody flips variant mid-funnel. Workspace is not part of the key.
- Exposure: `POST /api/experiments` (public prefix). Conversions: `recordOfferConversions` is called from `/api/ads/auth/signup` (`signed_up`) and `/api/ads-billing/checkout` (`checkout_started`); the modal posts `offer_clicked`. Purchase *completed* is not wired as a metric (Stripe webhooks have no visitor cookie).
- Every payload is re-linted at render (`sanitizePayload`): a bad DB-defined variant falls back to control. Copy may use tokens `{first} {monthly} {regular} {unlock} {freeAds} {spots}`, filled from `public-offer.ts`.
- Verdicts: `evaluateExperiment` (rev-core) decides; `minPerVariant` is 80-300 and it also demands 5+ conversions. Expect weeks before anything is conclusive at current traffic.

## Weekly agent (`engine/src/offerintel/weekly.ts`)
Reads replies / needs-human / auto-replies / churn reasons / unsubscribes (60 days), the latest `revenue_snapshot`, checkout counts and `competitors.json`. Codex writes a value-equation gap (weakest of the 4 levers, evidence) and up to 3 proposals. Stored as AdsEvent:
- `offer_intel_report` (objection map with counts and anonymised quotes, gap, pricing table).
- `offer_proposal` with `status`: `approved` (validator + AI review gate + truth check all passed, then `defineExperiment`) or `needs_owner` (with reasons). Load for the admin page with `loadOfferProposals(db)`; `approveOfferProposal(id)` / `rejectOfferProposal(id)` for the owner (still enforce slots, lint and the 2-per-surface cap).
- Auto-approval rules (`validate.ts`): known surface and slots only, control first with no payload, no $ figure or number outside the offer facts, no new guarantee/refund wording, no urgency, no percentages, metric in {signed_up, checkout_started, offer_clicked}, minPerVariant >= 50, <= 3 variants, < 2 running on the surface.
- Competitors: `src/lib/offer-intel/competitors.json` is generated from the verified data behind /compare (`npx tsx scripts/offer-intel-competitors.ts`). To refresh facts, re-read the vendors' pages, edit `src/lib/growth/organic/compare.ts`, rerun. The engine never fetches competitors.

## Pricing analysis (`pricing.ts`, read-only)
`analysePricing(economics | null)` compares $9 attraction, $97 first month (live), $197/$297 flat, annual prepay, paid trial with money back, done-with-you tier: 30-day payback and 12-month LTGP:CAC. Uses `src/lib/revenue/economics.ts` CAC/churn when measured, else labelled assumptions; take rates per model are always assumptions. Models that beat the live one by 25% become `optimizer_action` rows of type `owner_decision` (the existing "needs you" path). It never changes a price.

## Coherence checks
`checkCoherence` (pure) flags prices not in billing config, refund days != 30, live-in-N-days != 7, founding spots != 10, odd free-ad counts. `npx tsx scripts/offer-coherence.ts [--live https://www.komendly.com]`; the weekly job runs it on the live pages + lifecycle sources and writes `coherence_issue` (deduped by `issueKey`, 30 days).

Tests: `npx vitest run src/lib/offer-intel`.
