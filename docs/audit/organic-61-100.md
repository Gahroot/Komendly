# Organic growth audit, opportunities 61-100 (27 Nov 2026)

Method: registry vs code vs live. Production DB read-only (flags, AdsEvent, KlySocial*, heartbeats), curl on www.komendly.com, Media Master JSON state (`~/Library/Application Support/@media-master/app/data`), MM repo checks, outreach folder, npm/GitHub APIs. Nothing was posted, sent or written to prod.

**Score: 5 met, 24 partial, 11 not.** Not one of the 40 has produced an attributed sign-up: prod `signed_up` by first touch is facebook 60, shopify 4, nothing else.

## Findings that change the picture
1. **Instagram/Facebook own posts are the only live organic channel** (KlySocialPost: 9 FB + 9 IG static posted, last 26 Nov; 24 Nov failed on an invalidated Meta token and recovered 25 Nov). `sys_reels` was ON for one run (reel posted 26 Nov 23:37 UTC) and is **OFF again** since 27 Nov 01:55 UTC.
2. **Media Master's Komendly integration is not running.** The dev Electron (pid 67626) loads `out/` built 20 Nov, which has no `komendlyGrowthHost` code. Only Quora is enabled for the Komendly brand (offsite-settings.json). All 15 browser accounts and 14 social accounts are Nolan's personal/other-company ones; none is bound to Komendly. No Reddit and no X account exists in MM.
3. **MM code is healthy:** `pnpm lint` exit 0, `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck` exit 0, offsite 18 tests, content-intelligence 396 tests, app offsite+host tests 216, all pass. The gap is rebuild/restart + accounts + tokens (`REELS_AGENT_TOKEN`, `INTENT_AGENT_TOKEN` in MM's encrypted key store; unverifiable from here).
4. **Quora:** 1 answer published 21 Nov; 26 Nov run failed ("answer submitted but Quora never showed it"), account benched, 24 drafts waiting.
5. **Registry was wrong** for #83, #84, #86, #88 (said "not built"; they are built) and #68 (said "off until connected"; it is posting). #61-100 statuses are rewritten with evidence.
6. `sys_indexnow` and `sys_content_queue` are ON but have **no heartbeat**: their first cron run (15:30 / Mon 13:00 UTC) had not happened at audit time. Not in my slice; verify after 27 Nov 15:30 UTC.
7. **Pinterest:** 52 pins scheduled with UTM, image URL 200, but 0 landed visits tagged pinterest in 14 days.

## Matrix
Legend: met = live and producing outputs; partial = built or partly live, not yet delivering; not = nothing live.

| # | Opportunity | Requirement (implemented, activated, verified) | Verdict | Evidence | Fix in this audit | Remaining owner/prereq |
|---|---|---|---|---|---|---|
| 61 | Reddit | Disclosed presence earning sign-ups | not | u/Ozzy_da_wizard exists; MM has no Reddit account/app; blocked browser 20 Nov | registry corrected | Reddit app (human captcha) or drop; task 8 |
| 62 | FB business communities | Answer questions in groups, rules respected | not | Only personal profiles exist; Pages can't join groups | none (needs decision) | Approve Nolan's profile for answers; task 9 |
| 63 | LinkedIn | Komendly posts | not | 3 MM LinkedIn accounts, none Komendly-bound; no posts | build-in-public drafts (`build-in-public.ts`) | Choose identity; task 4 |
| 64 | X | Komendly posts | not | No X account in MM | BIP drafts <=280 chars | Create account (phone verify); task 5 |
| 65 | Pinterest | Pins live, UTM | partial | 52 pins scheduled with `utm_source=pinterest`; 0 attributed visits | learning logged | Verify pins on PRESTYJ boards; task 18; API needs Standard access |
| 66 | YouTube Shorts | Shorts posted | partial | Reel renderer works (1 reel); `social_queue` 6 rows, no consumer; no Komendly channel | none | Channel + sys_reels ON + upload; task 6 |
| 67 | TikTok | Posts | partial | As #66; MM TikTok accounts personal | none | Account + upload with AI label; task 7 |
| 68 | Instagram | Daily posts + reels | **met** | IG @komendly 9 posts + 1 reel; connection 25 Nov | registry corrected | Reels OFF pending quality OK; Meta approval ~9 Dec not needed (dev-mode admin) |
| 69 | Quora | Autopilot answering | partial | 1 published, 26 Nov fail, benched | none | Rebuild/restart MM; check answer visible |
| 70 | Ozzy personality | Ozzy voice across channels | partial | Voice in FB/IG posts and reel captions; no engagement data | none | Measure after reels run |
| 71 | Shopify App Store | Listed | partial | Built; 5 test installs 19-20 Nov; listing copy ready | none | Submit in Partner Dashboard; task 2 |
| 72 | ChatGPT | Submitted | partial | Draft uploaded; age box blocks | none | Decide age statement; checklist D |
| 73 | Claude | Approved | partial | Connector + plugin submitted 19/21 Nov; repo 200 | none | Check status; task 3 |
| 74 | Launch platforms | Launched | not | None | launch kit in desktop-tasks | Date + logins; tasks 10-12 |
| 75 | AI directories | Free listings | not | None | task list | Tasks 13 |
| 76 | Comparison directories | Listed | partial | 9 listicle pitches sent 20 Nov, no replies on record | none | Tasks 14 |
| 77 | n8n/Make/Zapier | Published nodes | partial | Zapier built (id 250388), unpublished; no n8n/Make | none | Zapier team member + 3 users; n8n node unbuilt |
| 78 | WordPress | Plugin listed | partial | Plugin written (`packages/komendly-wordpress`), not syntax-checked (no php here) | **built plugin** | php -l, submit; task 19 |
| 79 | Chrome extension | On the store | partial | Store kit in ~/Downloads/komendly-chrome-store; page says coming soon | none | $5 + upload; task 1 |
| 80 | Open source | Published | **met** | npm komendly 0.2.0 (27 dl/wk), plugin repo 200, api_used 14 | registry | none |
| 81 | Shareable experiences | Live | **met** | /g /m /r /s /u; share_created 4, viewed 6; branded visits 2 | registry | none |
| 82 | Referral | Live | partial | 34 codes, 0 referrals | none | Customers |
| 83 | Collaborative approval | Live | partial | `/approve/[token]` + API built, flag ON, 0 uses | registry corrected | Customers |
| 84 | Customer portfolios | Live | partial | /showcase built; `sys_creative_publish` OFF; 0 opt-ins | registry corrected | Opt-ins, then flag |
| 85 | Optional attribution | Live | **met** | viral_branding 212 runs / 6 outputs | registry | none |
| 86 | Embeds | Live | partial | /embed/ads + embed.js 200; 0 embeds seen | WP shortcode | Partners embedding |
| 87 | Shareable ad intelligence | Live | partial | ad_watch ON, 134 runs, 0 sends, 0 subscribers | none | Traffic to /tools/competitor-ad-watch |
| 88 | Agency expansion | Live | partial | /ads/agency + /for/* built; `sys_agency_ops` OFF | registry corrected | Flag C |
| 89 | Shareable concepts | Live | partial | Studio share links + /remix; no concept-share page | none | Product call |
| 90 | Customer showcases | Live | partial | /ad-of-the-week 200; 0 AdsFeature | none | Consent |
| 91 | Original research | Live | **met** | Both reports 200; sys_data_report ON | none | Pitch sends task 15 |
| 92 | Benchmarks | Series | partial | Tables in reports; no series | newsletter cites a weekly number | Deploy #93 |
| 93 | Newsletter | Send path exists | partial | **Built, flag-gated, undeployed**; 8 tests | newsletter code, routes, cron, page, system | Deploy + flag B |
| 94 | Journalists | Relationships | not | Pitch doc only | none | Task 15 |
| 95 | Podcasts | Appearances | not | None | none | Task 16, Nolan |
| 96 | Newsletter partnerships | Swaps | not | Needs #93 live | none | After #93 |
| 97 | Guest contributions | Posts | not | None | none | Task 17 |
| 98 | Education/workshops | Events | not | None | none | Decision |
| 99 | Build in public | Real-numbers posts | partial | Generator + script built; nothing posted | `build-in-public.ts`, script, tests | Accounts #63/#64 |
| 100 | Recognition | Ad of the Month | partial | Pipeline built; 0 consented ads | `recognition.ts`, script, tests | Consenting customers |

## Operational today
Instagram/Facebook daily posts (#68), CLI/MCP/npm (#80), share routes (#81), branding (#85), data reports (#91). Plus built-and-live-but-unused pages (#83, #86, #87, #90).

## Waiting on the owner
Reddit app, Chrome $5, ChatGPT age statement, Zapier team member, Meta ~9 Dec (one-click publishing, not needed for #68), dedicated Komendly accounts for YouTube/TikTok/LinkedIn/X, Shopify submission login.

## Could be done now by desktop/logged-in browser
See `docs/audit/desktop-tasks.md` (19 tasks). Prod activation: `docs/audit/activation-checklist-organic-61-100.md`.

## Files changed
New: `src/lib/growth/{newsletter,newsletter-server,build-in-public,recognition}.ts`, `src/app/api/newsletter/*`, `src/app/api/cron/newsletter/route.ts`, `src/app/tools/ozzys-ad-report/page.tsx`, `src/components/growth/newsletter-optin.tsx`, `scripts/{build-in-public,recognition-draft}.ts`, `src/lib/growth/__tests__/newsletter-bip.test.ts`, `packages/komendly-wordpress/*`, this folder. Edited: `src/lib/growth/systems.ts` (+newsletter, +build_in_public), `src/middleware.ts` (+`/api/newsletter/`), `vercel.json` (+cron), `docs/growth-ecosystem/{registry.json,learnings.md}`.
