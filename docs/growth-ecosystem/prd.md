# Autonomous Organic Growth Ecosystem: PRD

Status: living document. Audit date: 26 Nov 2026. Source of truth for each opportunity: `registry.json` (same folder). Root `/prd.md` is the OFFER PRD and is separate.

## 1. Objective
Komendly reaches its first paying customers (goal: 10 by 31 Jan 2027, either the $297 done-for-you plan or the DIY $97/$197 plans) through many small, measurable, honest acquisition systems that run without the owner. The ecosystem tracks 100 named opportunities plus those discovered along the way, builds the ones worth building, and shuts down the ones that do not earn.

## 2. Principles
1. Everything outward is openly from Komendly (or Ozzy, disclosed). No fake reviews or testimonials, no invented results, no promised leads or sales. No calls or texts.
2. Honour opt-outs and suppression. The postal address comes only from Kly `OUTBOUND_POSTAL_ADDRESS`.
3. Never bypass captchas or platform limits.
4. Public offer facts come only from `src/lib/ads/public-offer.ts`.
5. Anything that sends or posts to the outside world sits behind an `AdsFeatureFlag` that defaults OFF (see `src/lib/growth/systems.ts`, flag `sys_<key>`). The coordinator turns flags on after review.
6. Quality over volume: no thin mass-generated pages. Page titles never append ` | Komendly`.
7. No schema changes. State lives in existing tables (`AdsEvent`, `AdsFeatureFlag`, `EngineHeartbeat`, `KlySettings`) and files.
8. Evidence over assumption: every status in the registry cites a file or a number.

## 3. Architecture
- Web (Next.js) hosts pages, tools, partner pages, admin and Vercel cron routes. Engine runs jobs (`engine/src/growth/*`). Kly runs outbound (`kly/src/*`). They talk only through Postgres.
- Each growth system has a kill switch (`sys_<key>`), a first-touch `utm_source` tag and a heartbeat (`EngineHeartbeat system:<key>`), defined once in `src/lib/growth/systems.ts`.
- Attribution: middleware stores the first visit's UTM in the `kmd_ft` cookie; `/api/ads/auth/signup` records `AdsEvent signed_up` with `props.firstTouch`; payments are `purchased` / `paid_converted` events. The command center groups both by first-touch source (`src/lib/growth/ecosystem-queries.ts`).
- Control layer (this PRD's code): `src/lib/growth/ecosystem.ts` (pure rules, report, learnings format), `ecosystem-queries.ts` (DB reads), `src/app/admin/ads/growth/` (owner page), `src/app/api/cron/growth-review/route.ts` (weekly review, flag `growth_weekly_review`).

## 4. Boundaries
- Ozzy's core creative role (turning a website into ads and videos, Studio, Meta publishing) is untouched. Growth work wraps it; it does not change generation.
- Files owned by other work in progress (Meta publishing, engine runner, contracts, schema, root `prd.md`) are not edited here.
- Engine/kly Dockerfile COPY whitelists must be updated for any new shared import.

## 5. Measurement
- Per source: actions, sign-ups, payments (first-touch). Internal/test accounts excluded.
- Course-change rules, applied weekly by `decideChannel`: a channel with 500+ actions and no sign-ups is suspended (its `sys_<key>` flag is turned off by the review when the flag exists; Kly is recommended only); any payment means turn up; sign-ups with no payment after 500 actions means fix the offer.
- Weekly: `/api/cron/scoreboard-digest` (existing, Mon 14:00 UTC) and `/api/cron/growth-review` (Mon 14:30 UTC, flag-gated, off by default) emails `nolan@prestyj.com` (override `GROWTH_REPORT_EMAIL`).
- Learnings: append-only `learnings.md`, entries tagged EVIDENCE (with a source) or ASSUMPTION.

## 6. Owner experience
One page: `/admin/ads/growth` (admin nav "Growth"). It shows status counts by category, a "Needs you" list (every registry `owner_action`), sign-ups and payments by source, experiments running, known costs, operational issues, the learnings log, and the full list. Beyond that the owner gets one short Monday email. The owner is only asked for things nobody else can do (accounts, fees, approvals, policy decisions).

## 7. Acceptance and verification standards
An opportunity may be marked:
- `operational` only if it runs live now and there is evidence (a file path plus a count, a flag state, or a published URL).
- `experimenting` if built or partly live but unmeasured or flag state not verified.
- `awaiting_prerequisite` if not built, or blocked on a review, fee, key or decision (the blocker is written in `prerequisites`).
- `suspended` if turned off by a rule or the owner; `unviable` if disproved or not allowed (reason in `evidence`).
Code changes need `npx vitest run src/lib`, `npx tsc --noEmit -p .` (and `npm test && npm run typecheck` in `kly/` and `engine/` if touched). Statuses are claims about the repo and goal notes only: they were not verified against the production database (flag states are not read from code).

## 8. Audit summary (26 Nov 2026)
See the counts printed by the command center. Headline: 9 of the 120 items operational (Ad Library prospecting, gift-first cold email, Ad Check, ad watch, original data report, cold-email strategist, open-data lead sources, weekly scoreboard, blog engine); about 40 live or built but unmeasured; the rest not built or blocked. There are 0 real payers; the one payment is a $9 unlock pack (25 Nov).

## 9. Inventory
All 100 opportunities and the discovered #101+ with status, in the table below; full fields in `registry.json`.

| # | Name | Category | Status |
|---|---|---|---|
| 1 | Meta Ad Library prospecting | Prospecting & intent signals | operational |
| 2 | Stale creative detection | Prospecting & intent signals | experimenting |
| 3 | Single-ad advertiser acquisition | Prospecting & intent signals | experimenting |
| 4 | Google Ads advertiser acquisition | Prospecting & intent signals | awaiting_prerequisite |
| 5 | New business acquisition | Prospecting & intent signals | experimenting |
| 6 | New website acquisition | Prospecting & intent signals | experimenting |
| 7 | New Shopify store acquisition | Prospecting & intent signals | awaiting_prerequisite |
| 8 | New product launch acquisition | Prospecting & intent signals | awaiting_prerequisite |
| 9 | Marketing hiring signals | Prospecting & intent signals | awaiting_prerequisite |
| 10 | Seasonal opportunity acquisition | Prospecting & intent signals | experimenting |
| 11 | Crowdfunding campaign acquisition | Prospecting & intent signals | awaiting_prerequisite |
| 12 | Business expansion acquisition | Prospecting & intent signals | awaiting_prerequisite |
| 13 | Public purchase-intent monitoring | Prospecting & intent signals | awaiting_prerequisite |
| 14 | Creative gap identification | Prospecting & intent signals | experimenting |
| 15 | Website redesign acquisition | Prospecting & intent signals | awaiting_prerequisite |
| 16 | Marketing agency acquisition | Agency & partner channels | awaiting_prerequisite |
| 17 | Web design agency partnerships | Agency & partner channels | awaiting_prerequisite |
| 18 | Freelance media buyer acquisition | Agency & partner channels | awaiting_prerequisite |
| 19 | Social media manager acquisition | Agency & partner channels | awaiting_prerequisite |
| 20 | SEO agency partnerships | Agency & partner channels | awaiting_prerequisite |
| 21 | GoHighLevel agency acquisition | Agency & partner channels | awaiting_prerequisite |
| 22 | Shopify development agency partnerships | Agency & partner channels | awaiting_prerequisite |
| 23 | Branding agency partnerships | Agency & partner channels | awaiting_prerequisite |
| 24 | Business coach partnerships | Agency & partner channels | awaiting_prerequisite |
| 25 | Marketing educator partnerships | Agency & partner channels | awaiting_prerequisite |
| 26 | Freelancer marketplace acquisition | Agency & partner channels | awaiting_prerequisite |
| 27 | White-label and reseller | Agency & partner channels | awaiting_prerequisite |
| 28 | Franchise partnerships | Agency & partner channels | awaiting_prerequisite |
| 29 | Virtual assistant agency partnerships | Agency & partner channels | awaiting_prerequisite |
| 30 | Embedded partner experiences | Agency & partner channels | awaiting_prerequisite |
| 31 | Personalized advertising gifts | Gifts, publicity & viral pages | operational |
| 32 | Public advertising makeovers | Gifts, publicity & viral pages | awaiting_prerequisite |
| 33 | Ozzy's business of the day | Gifts, publicity & viral pages | awaiting_prerequisite |
| 34 | Small-business makeover competitions | Gifts, publicity & viral pages | awaiting_prerequisite |
| 35 | 100 businesses in 100 days campaign | Gifts, publicity & viral pages | awaiting_prerequisite |
| 36 | Recurring creative giveaways | Gifts, publicity & viral pages | awaiting_prerequisite |
| 37 | Community business nominations | Gifts, publicity & viral pages | awaiting_prerequisite |
| 38 | Seasonal creative releases | Gifts, publicity & viral pages | awaiting_prerequisite |
| 39 | Startup launch gifts | Gifts, publicity & viral pages | experimenting |
| 40 | Customer review transformations | Gifts, publicity & viral pages | experimenting |
| 41 | Creative competitions and voting | Gifts, publicity & viral pages | awaiting_prerequisite |
| 42 | Website-to-ad challenges | Gifts, publicity & viral pages | awaiting_prerequisite |
| 43 | Advertising rescue submissions | Gifts, publicity & viral pages | awaiting_prerequisite |
| 44 | Nonprofit creative initiatives | Gifts, publicity & viral pages | awaiting_prerequisite |
| 45 | Customer reaction content | Gifts, publicity & viral pages | awaiting_prerequisite |
| 46 | Industry-specific ad generators | SEO & free tools | experimenting |
| 47 | Industry-specific ad galleries | SEO & free tools | experimenting |
| 48 | Competitor comparison content | SEO & free tools | experimenting |
| 49 | Alternative software discovery | SEO & free tools | experimenting |
| 50 | Ad creative assessment | SEO & free tools | operational |
| 51 | Website ad readiness assessment | SEO & free tools | experimenting |
| 52 | Competitor ad intelligence | SEO & free tools | operational |
| 53 | Marketing offer generation | SEO & free tools | awaiting_prerequisite |
| 54 | Marketing calendar generation | SEO & free tools | awaiting_prerequisite |
| 55 | Ad budget resources | SEO & free tools | experimenting |
| 56 | Ad image resizing | SEO & free tools | experimenting |
| 57 | Downloadable ad templates | SEO & free tools | awaiting_prerequisite |
| 58 | Headline/copy libraries | SEO & free tools | experimenting |
| 59 | Searchable ad inspiration | SEO & free tools | experimenting |
| 60 | Interactive marketing playbooks | SEO & free tools | experimenting |
| 61 | Reddit | Social & community | awaiting_prerequisite |
| 62 | Facebook business communities | Social & community | awaiting_prerequisite |
| 63 | LinkedIn | Social & community | awaiting_prerequisite |
| 64 | X | Social & community | awaiting_prerequisite |
| 65 | Pinterest | Social & community | experimenting |
| 66 | YouTube Shorts | Social & community | awaiting_prerequisite |
| 67 | TikTok | Social & community | awaiting_prerequisite |
| 68 | Instagram | Social & community | awaiting_prerequisite |
| 69 | Quora | Social & community | experimenting |
| 70 | Ozzy as a marketing personality | Social & community | experimenting |
| 71 | Shopify App Store | Platform & ecosystem distribution | awaiting_prerequisite |
| 72 | ChatGPT ecosystem | Platform & ecosystem distribution | awaiting_prerequisite |
| 73 | Claude ecosystem | Platform & ecosystem distribution | awaiting_prerequisite |
| 74 | Product launch platforms | Platform & ecosystem distribution | awaiting_prerequisite |
| 75 | AI software directories | Platform & ecosystem distribution | awaiting_prerequisite |
| 76 | Software comparison directories | Platform & ecosystem distribution | experimenting |
| 77 | Automation ecosystems (n8n, Make, Zapier) | Platform & ecosystem distribution | awaiting_prerequisite |
| 78 | WordPress ecosystem | Platform & ecosystem distribution | awaiting_prerequisite |
| 79 | Browser-based distribution | Platform & ecosystem distribution | awaiting_prerequisite |
| 80 | Open-source distribution | Platform & ecosystem distribution | experimenting |
| 81 | Shareable ad experiences | Product-led virality | experimenting |
| 82 | Customer referral | Product-led virality | experimenting |
| 83 | Collaborative creative approval | Product-led virality | awaiting_prerequisite |
| 84 | Customer creative portfolios | Product-led virality | awaiting_prerequisite |
| 85 | Optional Komendly attribution | Product-led virality | experimenting |
| 86 | Embeddable free resources | Product-led virality | awaiting_prerequisite |
| 87 | Shareable ad intelligence | Product-led virality | experimenting |
| 88 | Agency-client expansion | Product-led virality | awaiting_prerequisite |
| 89 | Shareable campaign concepts | Product-led virality | awaiting_prerequisite |
| 90 | Customer creative showcases | Product-led virality | experimenting |
| 91 | Original ad research | Authority & PR | operational |
| 92 | Industry benchmarks | Authority & PR | experimenting |
| 93 | Marketing newsletter | Authority & PR | awaiting_prerequisite |
| 94 | Journalist/publication relationships | Authority & PR | awaiting_prerequisite |
| 95 | Podcast opportunities | Authority & PR | awaiting_prerequisite |
| 96 | Newsletter partnerships | Authority & PR | awaiting_prerequisite |
| 97 | Guest contributions | Authority & PR | awaiting_prerequisite |
| 98 | Ad education and workshops | Authority & PR | awaiting_prerequisite |
| 99 | Build-in-public experiments | Authority & PR | awaiting_prerequisite |
| 100 | Ad recognition initiatives | Authority & PR | awaiting_prerequisite |
| 101 | Jobber App Marketplace | Platform & ecosystem distribution | awaiting_prerequisite |
| 102 | Abandoned-checkout recovery | SEO & free tools | experimenting |
| 103 | Churn and failed-payment win-back | Product-led virality | experimenting |
| 104 | Agent distribution (MCP, OAuth, CLI) | Platform & ecosystem distribution | experimenting |
| 105 | Public API docs | SEO & free tools | experimenting |
| 106 | Instant Meta lead alerts for customers | Product-led virality | awaiting_prerequisite |
| 107 | Weekly Meta results report | Product-led virality | awaiting_prerequisite |
| 108 | Meta paid ads for Komendly | Social & community | experimenting |
| 109 | Cold-email arm strategist | Prospecting & intent signals | operational |
| 110 | Mailbox capacity scaling | Prospecting & intent signals | experimenting |
| 111 | Places and open-data lead sources | Prospecting & intent signals | operational |
| 112 | Roofer-specific offer page | SEO & free tools | experimenting |
| 113 | Reply auto-responder | Prospecting & intent signals | awaiting_prerequisite |
| 114 | Paid unlock pack ($9) | Product-led virality | experimenting |
| 115 | Done-for-you Growth Autopilot offer | Product-led virality | experimenting |
| 116 | Ozzy Lab / Studio demos | Gifts, publicity & viral pages | experimenting |
| 117 | Testimonial-video SEO cluster | SEO & free tools | experimenting |
| 118 | Weekly scoreboard review email | Authority & PR | operational |
| 119 | Blog engine (autonomous posts) | SEO & free tools | operational |
| 120 | Ad Library niche expansion | Prospecting & intent signals | awaiting_prerequisite |
