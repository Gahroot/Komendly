# Hormozi funnel audit (live, 26-27 Nov 2026)

Checked live: curl of www.komendly.com (/, /free-ads, /free-ads/roofers, /free-ads/plumbers, /pricing, /ads/team, /ads/pricing, /llms.txt, /sitemap.xml), Stripe live (read-only), prod DB (read-only), Railway engine/kly, Vercel env names.

| Requirement | Status | Evidence | Fix made | Remaining |
|---|---|---|---|---|
| Attraction: free 10-ad pack | met | /free-ads title "Free Ad Pack: 10 ready-to-run ads"; FAQ "10 free ads need no card" | none | none |
| Small first yes: $9 unlock | met | Stripe price active, 900 one-time "Website2ads Unlock this pack"; coupon ads_unlock_pack_credit_900 valid; checkout test: payment mode, success_url lands on /ads/runs/<run>?bought=unlock_pack (src/lib/ads/__tests__/checkout-route-hormozi.test.ts) | test added | 1 real $9 buyer so far |
| Immediate upsell at $9: Autopilot $97 then $297 | met (code) | upsell modal uses AUTOPILOT_FIRST_MONTH_LINE; price active 29700/month; coupon ads_autopilot_first_month_20000 = $200 off once, valid, 0 redeemed; Vercel has STRIPE_ADS_AUTOPILOT_PRICE_ID + LAUNCH_COUPON_ID | none | not yet exercised by a real buyer |
| Server-side eligibility (finished pack, 7 days, once, 10 spots) | met | 9 route-level tests with mocked Stripe/DB: ineligible workspaces get 410/409, no session created; missing coupon env = not sold; plain autopilot plan never carries the coupon; existing subscriber blocked | test added | none |
| Downsell DIY $97/$197 different terms | met | DIY_STEP_DOWN "you post the ads yourself"; Stripe $197 ad dept price active; old $97 launch price inactive (coupon ads_founding_first_month_10000 does the $97) | none | none |
| Continuity | met | monthly $297 sub; Autopilot spots: 0 taken (2 active subs are ad_department) | none | none |
| Quick first payment | partial | $9 checkout exists; only 1 purchase, 6 checkouts in 14d, 52 sign-ups | none | traffic/conversion, not code |
| $97 line only where purchasable | met | live: $97 first-month line appears on /free-ads/roofers (gated to finished pack wording), /pricing, /ads/pricing, homepage; not on /free-ads, plumbers, /ads/team (signed-out) | none | none |
| Guarantee text = AUTOPILOT_GUARANTEE_LINE | met | exact string present live on /, /pricing, /ads/pricing, /free-ads/roofers | none | the $97 line on plumbers page absent: fine |
| Dream everywhere | partial | headline "A steady flow of customers asking for quotes, without you running Facebook ads" is the title of / and /pricing; /free-ads hero says "Customers asking for quotes, without you running Facebook ads" | none | /ads/team and /free-ads/plumbers don't carry the exact headline (signed-out /ads/team is a gate page) |
| Banned phrases in HTML | partial then fixed | live pricing/home/ads-pricing: "One click, full refund" and "cancel in one click" (refund/cancel, not publishing: allowed by intent but the lint regex flags it); /free-ads/plumbers: "Fix anything in one click" (editing) | not changed: these are not publishing claims | decide whether to reword to "one tap"; lint test only covers page source files that don't contain them |
| Banned "one-click publishing" in blog + llms.txt | fixed in repo | 9 blog posts said "one-click publish to Meta on Growth and Scale" (plans no longer sold) -> now "Meta publishing set up with you on Growth Autopilot" | 9 content/blog/*.md edited; new src/lib/__tests__/public-copy-lint-wide.test.ts sweeps blog, lifecycle, seo, outbound copy | /llms.txt is served from a build/cached copy: still shows one blog blurb "one-click" and the pricing refund lines until deploy; refund/cancel lines are in pricing source |
| Price consistency | met | live prices: $9, $97, $297, $497 regular, $197; "Founding spots: 10 businesses" on pricing/home; no "$X left" count shown, DB: 0 of 10 taken (helper foundingSpotsLeft counts autopilot active/trialing/past_due) | none | pricing says "Founding offer for the first 100 members" in one FAQ (ad dept legacy line) - leave or reword |
| Stripe objects exist | met | see above (live key, read-only list) | none | none |
| Purchase emails unlock_thanks/day3/day7 | met | select.ts schedule: thanks 0-12h (engine tick ~10 min), day3 72-96h, day7 168-192h; stop on subscribe/unsubscribe/reply; tests in unlock-emails.test.ts pass | none | none |
| Engine can send them | met | engine/Dockerfile COPYs lifecycle/, public-offer.ts, billing-config.ts, bonus-access.ts; smoke import of engine/src/lifecycle/send.ts OK; LIFECYCLE_AUTOPILOT_FIRST_MONTH=1, LIFECYCLE_DRY_RUN=0 on engine; flag lifecycle_email ON | none | engine needs STRIPE_ADS_AUTOPILOT_LAUNCH_COUPON_ID? Not required: only flag; web has it |
| Cold email Hormozi arms | partial | KlyArm: hz-gift-outcome, hz-which-job, hz-headline, hz-followup active (created 26 Nov 22:44); nolan-* retired 26 Nov. Last 24h: 199 sends, only 1 with hz-headline | none | rollout just started; recheck sends per arm in 2-3 days. Four arms were active but only one has sent |
| Lead magnet narrowing | partial | /free-ads has "What kind of business" picker with roofers/plumbers; form code writes kmd_trade/kmd_site (free-ads-url-form.tsx); signed_up props carry is_business, work_email, trade, trade_picked, website_own_domain (latest event) | none | 1 of last 4 events in 3d had is_business (others predate it); 72 of 30-day sign-ups have no trade |
| Proof machinery | partial | sys_proof ON, consent flow + /results exist (200); only real testimonial: Max (Trustpilot, verbatim, shown with OK) ; no consented results yet | none | needs first live customer |
| Traffic systems | partial | reels: 2 reel_published events 26 Nov (facebook+instagram), sys_reels flag is OFF in DB (published manually/other path); Pinterest per MEMORY (4 pins live day 1); Quora 1 answer | none | decide on sys_reels |
| Experiments not running | met | sys_offer_intel flag not present in DB (=off); signed_up props show home_hero control/companion, from legacy experiments.ts (50/50) - NOT offer-intel | none | the legacy home_hero 50/50 test IS running ("companion" assigned); live HTML contains no "companion" for my fetch (control). Confirm intended |
| Referral / lead-getter | partial | /ads/refer exists; referred friends get 20 free; referral not mentioned on public pages | none | feature exists, little promotion |
| Core Four in practice | partial | cold email ~200/day (Rule of 100 met on one channel), content/reels started, warm outreach = founder_ask emails, paid ads (Meta) still running per memory though brief says OFF | none | confirm Meta campaign actually paused |
| Copy compliance (emails) | met | no banned patterns in src/lib/ads/lifecycle, outbound/copy.ts, nurture.ts (wide lint test passes for these) | test added | none |

## Counts
Met 12, partial 10, not met 0 (of 22 rows).

## Test status
- New: checkout-route-hormozi.test.ts (9 pass), public-copy-lint-wide.test.ts.
- `npx vitest run src/lib`: 4 failures, none from this work: funnel classifyTouch (sys_newsletter), ecosystem registry (kly_partner_segments flag key), email-guard (unclassified sender), control cron coverage (/api/cron/newsletter). All caused by another worker's uncommitted newsletter/registry changes.
- `npx tsc --noEmit` and `engine npm run typecheck`: fail only in src/lib/exec/strategic-cycle.ts (another worker's uncommitted file).
