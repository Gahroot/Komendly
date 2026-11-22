# PRD: Hire Ozzy's AI Marketing Team

Status: living document, the source of truth for the "offer swap" goal. Last updated 2026-11-22.
Sources: founder brief (`komendlyPRD.md`), codebase audit (2026-11-22), `docs/meta-app-review.md`, `docs/prd-autopilot-growth.md`.

## 1. The promise

> Meet your new AI marketing team. They make your ads, launch your campaigns and keep working to bring you more customers. You run your business. Ozzy runs your marketing.

A local service business owner gives us their website, connects Meta, sets a monthly ad budget limit and hires the team.
From then on Komendly creates, launches, measures and improves their Facebook and Instagram lead ads, inside that limit,
and reports in plain words what was done and what came of it. We sell an ongoing managed service, not credits or creatives.
We never guarantee lead volume, sales or revenue.

## 2. Who it is for

- **Primary:** established, high-value local service businesses (home services, trades, clinics without regulated claims,
  studios) in the US who need steady inquiries and don't want to run ads themselves.
- **Not in v1:** businesses whose ads fall in Meta's Special Ad Categories (housing, credit/loans, employment, social
  issues/politics). They can still use the free ads and creative plans, but Ozzy won't run their campaigns (Meta restricts
  targeting for them and the compliance risk is different). The product says so plainly at budget setup.
- **The founder**, who wants the service to run and improve itself with minimal involvement.

## 3. The offer (Grand Slam)

| Part | What it is |
|---|---|
| Lead magnet | **10 free ads** made from your website (20 when a friend refers you). No card. Already rendered for every trial; now all 10 are unlocked. |
| Core offer | **Ozzy's AI Marketing Team, $197/month** (existing "Ozzy Ad Department" plan and Stripe prices; first month $97 with the launch coupon). Cancel any time in the billing portal; 30-day self-serve refund stays. |
| What the team does | Writes and designs new ads every week, launches them as Meta lead ads in your account, watches results every day, pauses what wastes money, brings in fresh ads, delivers every lead to your inbox within minutes, and sends a weekly plain-English report. |
| What you do | Connect Meta once, set a monthly ad budget limit, read the weekly report, call your leads. |
| Ad spend | Paid by you **directly to Meta** on your own card. It is never billed by Komendly and never mixed into the subscription. Ozzy can never spend above your monthly limit, and Meta enforces it too (campaign spend cap). |
| Bonuses kept | Website check-up, 30-day plan, hook library, Ad Coach, weekly Studio video. |
| Other plans | Starter $49 (ads only, no team) and Agency $497 stay for sale; Growth/Scale stay hidden. The $9 "unlock" is kept for the locked bonus ads only. |

Why subscription and not performance pricing: lead quality is disputed and sales are self-reported; flat recurring revenue is
predictable and avoids attribution fights (brief §5).

Unit economics (from code, `billing-config.ts`, `scripts/ads-pricing-sim.ts`): a credit costs about $0.53 at p90. The team uses
the weekly drop (~43 credits/month, about $23) plus engine time for daily checks (no AI calls: decisions are rules; Ozzy's
report wording runs on Codex, which is on the flat ChatGPT subscription). Gross margin on $197 stays above 80% even with the
video. **Verified:** cost per credit is a modelled number, not a measured invoice total (see §11).

## 4. The team (real work only)

Ozzy is the only character. The "team" is the set of real jobs the system does, each shown with a role label, so the owner
can see who did what. Every activity line comes from a stored `MarketingAction` row written by the code that did the work;
nothing is shown that didn't happen.

| Role (label shown) | Real work in code |
|---|---|
| **Ozzy, Marketing Director** | Weekly report email and dashboard summary; tells the owner when they're needed (reconnect Meta, payment method missing, budget reached). |
| **Research & Strategy** | Brand extraction from the website, industry detection, lead-form questions for the niche, Special Ad Category screening. |
| **Creative Studio** | Ad generation and QC; weekly fresh ads (Weekly Drop / Autopilot), steered by what is working. |
| **Launch & Budget Desk** | Creates the lead form, campaign, ad sets and ads; turns them on; keeps daily budgets inside the monthly limit; sets the Meta spend cap; pauses when the limit is reached or service stops. |
| **Performance Analyst** | Reads results every day, stores them, pauses ads that waste money, keeps winners, records the evidence for each decision. |
| **Lead Desk** | Receives each lead from Meta, stores it, emails it to the owner within a minute. |

Visuals reuse Ozzy's existing forms and expressions (`src/components/ozzy/*`, `public/brand/ozzy-*`). No new characters.

## 5. Customer journey (target)

1. **Visit** `/` or `/free-ads` → enter website.
2. **Sign up** (email + password, verify email) → 10 free ads render (about 5–10 minutes).
3. **See ads** → offer: "Hire Ozzy's team to run these for you" ($97 first month, then $197).
4. **Pay** (Stripe checkout) → lands on **`/ads/team`** (not just a notice).
5. **Hire the team** on `/ads/team`, three steps:
   1. Connect Meta (popup), pick ad account + Page. Readiness check: account active, payment method on file, Page chosen.
   2. Service area and budget: ZIP codes served, monthly ad budget limit (suggested $600, min $300), lead email.
   3. Authorize: plain summary + checkbox "I authorize Komendly to create, run and change Meta ads in my ad account, spending
      at most $X per calendar month from my Meta payment method. I can pause or lower this any time." Stored with time,
      user, the exact text and a terms version.
6. **Live:** within one engine cycle (≤15 min) the team creates the lead form and campaign, turns it on, and the owner sees
   "Your campaign is live" with what was launched. No visit to Ads Manager needed.
7. **Ongoing:** leads emailed within a minute; dashboard shows spend vs limit, leads, cost per lead, what the team did and
   why; weekly report email; fresh ads each week; poor ads paused; owner can pause everything or change the limit any time.
8. **Leave:** cancel in the billing portal → at period end (or immediately on refund/suspension) the team pauses the
   campaign. Disconnecting Meta pauses first, then revokes.

## 6. Requirements

### R1 Delegation and budget authorization
- One `MarketingMandate` per workspace: status (`active` | `paused` | `stopped`), monthly limit (minor units, account
  currency), ZIPs, lead email, authorization text + version + user + time.
- Limit min $300/month equivalent, max $50,000/month. Only the owner changes it. **AI and automation never raise it.**
- Changing the limit or resuming requires the authorization checkbox again.

### R2 Autonomous launch (hands-off from the start)
- When the mandate is active, the subscription is live (Ad Department or Agency, not suspended), Meta is connected and the
  account is ready, the engine launches without further clicks: one lead form (niche questions + the business's privacy
  link, falling back to Komendly's lead-handling notice page), one `OUTCOME_LEADS` campaign with `spend_cap`, ad sets
  optimized for `LEAD_GENERATION` (`destination_type ON_AD`, `promoted_object.page_id`), targeting the owner's ZIPs, 18+,
  up to 4 best ready QC-passed ads, then turned ACTIVE.
- Daily budget across ad sets = floor(monthly limit × 0.95 / 30.4). Meta may over-deliver a single day; the monthly
  guard (R3) and the spend cap are the real ceiling.

### R3 Budget protection (layered)
1. Meta-enforced: campaign `spend_cap` = spend before this month + monthly limit, set at launch and each month rollover.
2. Engine guard: month-to-date spend ≥ 98% of the limit → pause the campaign until the 1st, tell the owner.
3. Stop conditions → pause within one cycle: mandate paused/stopped, subscription not live, workspace suspended, refund,
   Meta disconnect (pause before revoke), global kill switch `team_ops_kill`.
4. Never create objects outside the mandate's ad account; only touch objects Komendly created (`MetaPublish`/mandate ids).
5. If Meta can't be reached or the token expired: stop changing things, alert the owner and founder; the Meta spend cap
   still holds.

### R4 Measurement (honest)
- Daily ad-level insights for Komendly ads stored in `AdPerformanceDay` (spend, impressions, clicks, leads).
- Leads stored in `MetaLead` when the webhook delivers them (verified count). Meta-reported lead actions are shown as
  "Meta reports"; webhook-received leads as "received". If they differ, show both and say why it can happen.
- Everything is labelled: **measured** (from Meta or our webhook), **estimated** (e.g. projected month-end spend), or
  **unknown** (no data yet / Meta unreachable). Never fill gaps with guesses.

### R5 Self-improvement (evidence-based)
- Daily analyst decisions are pure rules (`decideOptimizations`), with minimum evidence before acting:
  - pause an ad with ≥ 2× the account's median cost per lead after ≥ 1.5× that median in spend, or with no lead after
    spending ≥ 3× the account median CPL (or ≥ 3 days of the daily budget when there's no lead yet anywhere);
  - never act on an ad younger than 72 hours or with < 1,000 impressions;
  - always keep at least 2 ads running; add fresh ready ads to fill up to 4.
- Each decision stores its evidence (numbers, thresholds, window) in a `MarketingAction`.
- Learning loop: the ads that win (lowest CPL with enough leads) set the Weekly Drop focus ("more like: <angle>") when the
  owner hasn't set one, so new creative is steered by evidence. Recorded as an action.
- Claims of improvement in the report must compare two measured periods with sample sizes shown; otherwise say "too early to tell".

### R6 Lead handling
- Page subscribed to `leadgen` at launch (`subscribePageToLeadgen`). Each lead stored once (`leadgenId` unique), emailed to
  the lead email once. Email only; we never contact the lead. Owner sees leads on the dashboard and can delete them.
  Leads are deleted with the workspace, and 180 days after receipt.

### R7 Owner control and transparency
- One "Pause my ads" button (immediate pause job) and "Resume" (re-authorize). Limit and ZIPs editable.
- Activity feed of the team's real actions, newest first, with role labels and plain reasons.
- Everything needing the owner (reconnect, payment method, Special Ad Category, limit reached) appears as one clear card
  and an email.

### R8 Komendly's own business loop (separate objective)
- Funnel events `team_hired`, `team_meta_connected`, `team_authorized`, `team_launched`, `team_first_lead`, `team_paused`
  feed the existing scoreboard/funnel dashboards. Existing growth systems (checkout recovery, win-back, lifecycle,
  experiments) remain the mechanisms for Komendly's own acquisition and retention. Customer campaign rules never use
  Komendly's revenue as an objective.

### R9 AI provider
- All AI text runs through the engine's Codex provider (ChatGPT subscription). No new paid-API calls. Optimisation and
  budget decisions use no AI at all. Every AI-written text has a deterministic fallback.

## 7. Edge cases (must be handled)

| Case | Behaviour |
|---|---|
| Ad account disabled / unsettled / no payment method | Don't launch; owner card "Add a payment method in Meta" with link; recheck each cycle. |
| Token expired / revoked | Stop changes, mark mandate `needs_reconnect`, email owner; spend cap still protects. |
| Special Ad Category business | Refuse to launch with an explanation; mandate stays unlaunched. |
| No ready ads | Creative Studio queues the weekly drop now; launch next cycle. |
| Ad rejected by Meta review | Analyst records it, replaces it with another ready ad. |
| Limit reached mid-month | Pause until the 1st, then resume automatically (mandate still active). |
| Limit lowered below month-to-date spend | Pause immediately until next month. |
| Subscription canceled | Runs to period end, then pauses; mandate `stopped`. |
| Payment failed (past_due) | Keeps running through Stripe's retry window (it's the owner's ad money, not ours); paused if the subscription ends. |
| Refund / suspension | Pause immediately. |
| Owner edits campaign in Ads Manager | We don't fight it: if our campaign is paused/deleted by the owner, mark the mandate paused and tell them. |
| Duplicate webhook / retried job | Idempotent (unique keys, status checks). |
| Engine down | Meta spend cap holds; monitor alerts the founder. |

## 8. Compliance controls (engineering guidance, not legal advice)
- Auto-renewal: price, renewal and cancel path stated next to the checkout button; cancel online in the portal (ROSCA /
  state auto-renewal laws).
- Spend authorization recorded verbatim with version and timestamp; ad spend shown separately from subscription.
- Lead forms carry a privacy policy link; leads are used only to notify the owner; retention 180 days; deletable.
- Ad claims come from the brand's own website facts (existing claims/QC). No guarantees of results.
- **LAWYER:** terms of service update for the managed-ads service (authority to act in the owner's ad account, liability
  for ad spend and ad content, lead data processing role). Placeholder text only until reviewed.

## 9. External dependencies (cannot be solved by code)
| Dependency | Status (2026-11-22) |
|---|---|
| Meta App Review: ads_management, business_management, pages_show_list, pages_read_engagement, pages_manage_ads | Submitted 2026-11-19, in review. Until approved only app-role users can connect. |
| Meta App Review #2: ads_read, leads_retrieval, pages_manage_metadata (needed for results, leads, lead webhook) | **Not submitted.** Works now for app-role users. Submit after #1. |
| Marketing API access tier upgrade (Limited → Standard) | Not requested. Needed for volume. |
| Meta webhook subscription for `leadgen` on the app + `META_WEBHOOK_VERIFY_TOKEN` | Check in app dashboard. |
| Terms of service update (LAWYER) | Not done. |
| Live performance proof (real spend, real leads, improvement over time) | Run by the founder's separate ad-spend agent. Not yet evidence here. |

## 10. Acceptance criteria (verifiable)

| # | Criterion | How it's verified |
|---|---|---|
| A1 | Free pack gives 10 unlocked ads (20 referred) and public copy says so everywhere | unit tests + grep for stale "3 free" |
| A2 | After checkout the owner lands on `/ads/team` and can finish connect → budget → authorize without leaving it | browser run on dev with a test workspace (Meta step mocked/app-role) |
| A3 | Authorization is stored verbatim with version/user/time; limit can't be raised by any engine code | unit tests on mandate parsing; code search |
| A4 | Active mandate + ready account → engine creates lead form, campaign with spend_cap, LEAD_GENERATION ad sets, ads, and activates them, recording actions | engine tests with a fake publisher |
| A5 | Every stop condition pauses within one cycle | engine tests per condition |
| A6 | Month-to-date spend ≥ 98% of limit pauses; next month resumes and raises spend_cap by exactly one limit | engine tests |
| A7 | Analyst decisions follow R5 thresholds, keep ≥2 ads, record evidence | pure unit tests |
| A8 | Leads are stored once and emailed once; dashboard lists them | tests on lead processing |
| A9 | Dashboard labels measured / estimated / unknown; no fabricated activity | review + tests on the view model |
| A10 | All AI calls in new code go through the Codex provider with fallbacks | code search + tests |
| A11 | Existing test suites (web, engine, kly) and typechecks pass | `npx vitest run`, `npm test`, `npm run typecheck` |
| A12 | Live: a real campaign spends within limit and receives real leads | **Outstanding** (live-validation agent) |
| A13 | Live: an optimisation measurably lowers cost per lead over a period | **Outstanding** (needs weeks of data) |

## 11. Not claimed yet
Production readiness, real cost per lead, real improvement over time, and Meta approval of the extra permissions are all
unproven until §9 and A12–A13 are closed. The status of each criterion is tracked in §12.

## 12. Status (2026-11-22)

Evidence labels: RUN = executed and observed; CODE = read in source/tests only.

| # | Status | Evidence |
|---|---|---|
| A1 | Done | `FREE_TRIAL_ADS=10` (`bonus-access.ts`), copy swept across site, kly, docs, CLI, blog-engine knowledge; tests pass (RUN). Gift/partner packs stay 3 on purpose. |
| A2 | Partly verified | `/ads/team` offer, setup and dashboard walked in a browser on dev (RUN, screenshots in goal folder). Meta connect and Stripe checkout not exercised locally (no `META_APP_ID` / `STRIPE_SECRET_KEY` in `.env.local`). |
| A3 | Done | Authorization stored verbatim + version/user/time; API keys refused on authorize; engine test asserts `monthlyLimitMinor` never written (RUN). |
| A4 | Done in tests | `engine/test/team-ops.test.ts` launch path with fake Graph (RUN). Meta params checked against docs (URLs in §13); a few unconfirmed (§13). Not run against real Meta. |
| A5 | Done in tests | Each stop condition pauses within one tick (RUN, fake Graph). |
| A6 | Done in tests | 98% guard and month rollover spend_cap (RUN, fake Graph). |
| A7 | Done in tests | `decideOptimizations` + engine analyst tests (RUN). |
| A8 | Done in tests | Lead stored once, emailed once, retry safe, routed to mandate email (RUN, fakes). |
| A9 | Done | Dashboard labels measured / estimated / no data; roster shows "Nothing yet. Next: ..." (RUN, browser). |
| A10 | Done | Weekly report polish runs only on the Codex provider with deterministic fallback; decisions use no AI (CODE + tests). |
| A11 | Done | Web 968 tests, engine 549, kly 221, CLI 33, tsc web/engine/kly, `next build` all pass (RUN). |
| A12 | **Outstanding** | Live spend + real leads: owned by the founder's live-validation agent. |
| A13 | **Outstanding** | Measured improvement over time needs weeks of live data. |

Known gaps / follow-ups:
- The weekly team report rides the Monday Weekly Drop email; a week whose drop fails sends no report.
- Days in the report use the Autopilot time zone, not the ad account time zone.
- Locally the Meta connect popup shows raw JSON when Meta isn't configured.
- `/pricing` price-survey popup overlaps the offer card on first desktop view (pre-existing component).

## 13. Meta API parameters
Confirmed in Meta docs (2026-11-22): lead ads create guide https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create (OUTCOME_LEADS, LEAD_GENERATION, ON_AD, promoted_object, leadgen_forms, lead_gen_form_id CTA, safe question types); https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/; spend_cap https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/ (minimum about $100); zips targeting https://developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting; insights https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/.
Unconfirmed until the first live launch: `targeting_automation.advantage_audience: 0`, insights `campaign.id` filtering, error codes for a deleted campaign, `special_ad_categories: []` vs `["NONE"]`.

## 14. Release checklist (production)
1. Ship web + engine + kly together (shared schema). Apply the schema to production: additive only (4 new tables, new FK relations); `prisma db push` against prod after a verified backup, or the same SQL reviewed first.
2. Engine env: no new vars. Web env: optional `META_EXTRA_SCOPES=ads_read,leads_retrieval,pages_manage_metadata` (only after Meta approves them, or for app-role testing).
3. Flags (AdsFeatureFlag): `sys_team_ops` on (engine loop), `sys_lead_alerts` on, `meta_publish` on (globally after App Review, or `meta_publish:<ws>` for testers). `team_ops_kill` = emergency pause of every team campaign.
4. Meta app: leadgen webhook subscription + `META_WEBHOOK_VERIFY_TOKEN`; submit App Review #2 (docs/meta-app-review.md §9).
5. Lawyer review of the Terms "Managed advertising service" draft (placeholders) before selling to the public.
6. First live launch on an app-role test business with a small limit, watched end to end (lead form, spend cap in Ads Manager, a test lead via Meta's Lead Ads Testing Tool).
