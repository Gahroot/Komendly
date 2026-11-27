# Growth ecosystem learnings (append-only)

Each entry is tagged EVIDENCE (observed, with a source) or ASSUMPTION (believed, not yet tested). Never edit or delete old entries: add a new one that supersedes them. Format and helper: `src/lib/growth/ecosystem.ts` (`formatLearning`, `appendLearning`) and `src/lib/growth/learnings-file.ts`.

## 2026-11-26 [EVIDENCE] Cold email has produced no real replies yet (#1, #31)

About 300 emails sent in 14 days up to 24 Nov, 0 real replies and 1 click; 198 more sent 26 Nov. Volume is still low and 200 new mailboxes only became ready 26-27 Nov, so this is not yet a verdict on the offer or the copy.

Source: /Users/groot/.ezcoder/goals/paying-custys/MEMORY.md (24 and 26 Nov notes)

## 2026-11-26 [EVIDENCE] Almost all real sign-ups come from Meta ads; no recurring payers yet (#108)

58 real sign-ups all-time, 50 from Meta; 0 paying subscribers. First payment was a $9 unlock pack on 25 Nov.

Source: MEMORY.md baseline 20 Nov and 24-26 Nov notes; /admin/ads/scoreboard

## 2026-11-26 [ASSUMPTION] Gift-first outreach and free tools will compound, but are unmeasured

Free tools, industry examples and viral branding are live but their first-touch sign-ups have not been read per source yet. Treat their value as unproven until the command center shows sign-ups by utm_source.

## 2026-11-27 [EVIDENCE] No organic channel has produced a sign-up yet; only Meta (and Shopify test installs) are attributed (#61-100)

Prod AdsEvent signed_up by first-touch source: facebook 60, shopify 4, none from pinterest, embed, free tools, social, reels or newsletter. Pinterest has 52 pins scheduled since 21 Nov and 0 landed visits tagged utm_source=pinterest in the last 14 days. Facebook/Instagram own posts: 9 each plus 1 reel each, links carry utm_source=facebook|instagram. Volume is still tiny, so this is not a verdict, but nothing organic is proven.

Source: psql read-only on production 27 Nov 2026 (AdsEvent signed_up/visit_landed, KlySocialPost); docs/audit/organic-61-100.md

## 2026-11-27 [EVIDENCE] Media Master's Komendly wiring is not running (#61, #66, #67, #69)

The dev Electron process (pid 67626, started 26 Nov 16:38) loads apps/media-master/out built 20 Nov, which contains no komendlyGrowthHost code, and offsite-settings.json lists only Quora for the Komendly brand. All MM social accounts are Nolan's personal/other-company accounts (none bound to the Komendly brand). Lint, typecheck and package tests for the uncommitted MM code pass, so the fix is a rebuild + restart + dedicated accounts.

Source: ~/Library/Application Support/@media-master/app/data/*.json; pnpm lint, pnpm typecheck, package tests run 27 Nov 2026
