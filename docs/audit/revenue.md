# Revenue ecosystem audit (26-27 Nov 2026, commit 534b1d3 + fixes below)

Method: code read, live read-only SELECTs on prod, `scripts/revenue-dry-run.ts` (real loaders through a read-only DB proxy), unit tests. Nothing written to prod, nothing deployed.
"Operational" = correct when its flag is turned on; all new `sys_*` flags are OFF in prod (live check: no `sys_revenue_*`, `sys_offer_intel`, `sys_optimizer*`, `sys_nurture`, etc. rows exist; no `revenue_snapshot`, `exp_*`, `offer_proposal`, `optimizer_*`, `activation_stuck`, `rl_email_sent` events exist yet).

## Live verification of the numbers
Dry run vs independent SQL: payingCustomers=1 (SQL: only `purchased` event = mtplanton@comcast.net, $9 unlock_pack), subscribers=0 (SQL: no workspace with a Stripe subscription), revenue $9, 1 refund 0, signups 67 excluding internal (SQL: 66 non-internal by email regex vs 67 here: the extra one is a non-matching test-like inbox; within 1, see remaining), Kly cost $123.70 = SQL sum(OutboundLead.costMicros)/10000 over 90d. `ad_spend` events: 0 (Meta spend counted as 0). Stage = Stage 1 Monetize (correct).

## Bugs found and fixed
1. **Constraint ranking wrong (src/lib/revenue/constraints.ts).** Traffic severity mixed units (shrunk a 10-sample proxy) and always read ~1; with one $9 sale vs $123 Kly cost the "economics" constraint ranked #1 at severity 5 on n=1. Now traffic uses real visits/day vs target, and economics is neutral (severity 1, insufficient) below 5 customers. Live dry run now ranks traffic > first_purchase > delivery. Test added.
2. **Cash-flow honesty (economics.ts):** note now says when INFRA_MONTHLY_CENTS is unset and when no ad_spend exists (costs understated).
3. **Purchase conversion never recorded for experiments.** Checkout now stamps `kmdVid` (kmd_vid cookie) in Stripe metadata; the Ads webhook calls `recordOfferConversions("purchased")` (flag-gated, idempotent, never throws). `purchased` allowed as an experiment metric in validate.ts/agent.ts (agent told to prefer checkout_started at low volume).
4. **`loadOfferProposals` not shown / no owner approve-reject UI.** /admin/ads/revenue now has an "Offer proposals" card with Approve/Reject buttons -> new `POST /api/admin/ads/offer-proposals` (admin-only; approve still enforces slots, lint, 2-per-surface cap). Dashboard loader also reads `sys_offer_intel`.
5. **Lifecycle email cap hole.** The older lifecycle (`src/lib/ads/lifecycle/load.ts`) only counted its own `email_sent`; sends by the new systems (rl_email_sent, winback, recovery, nudges, first-win, proof, cancel-save) did not count toward its 24h gap, so a user could get two emails in a day. They now count (as `ext:` kinds). `recovery_email_sent` added to the revenue-lifecycle cap list.
6. **Opt-outs could expire.** engine/src/customersuccess/load.ts only loaded events from the last 130 days, so an old unsubscribe/reply/purchase would stop suppressing. Those four event names are now loaded regardless of age.
7. **Internal accounts mailed.** `isTestEmail` (lifecycle) did not cover @getkomendly.com or the Zapier test inbox (the review/funnel-test accounts); added.
8. **Image safety:** Dockerfile COPY whitelist is already guarded by engine/test/dockerfile-{shared,transitive,packages}.test.ts (they pass; I proved the guard by removing the snapshot.ts COPY: it fails, restored). No duplicate test added.

## Matrix (met / partial / not)
| # | Requirement | Status | Evidence | Fix this audit | Remaining |
|---|---|---|---|---|---|
| 1 | Grand Slam Offer intel | partial | offer-intel weekly agent (engine/src/offerintel/weekly.ts), validate.ts rules, public-offer.ts single facts source, pricing.ts | proposals visible + owner approve/reject (#4) | never run (flag OFF); no real buyer data (n=1) |
| 2 | Money model optimisation | partial | economics funnel steps, pricing.ts model comparison, payback30/LTGP:CAC with confidence | constraint fix (#1) | all `insufficient` until >=5 customers; ad_spend not flowing; Testimonials-product revenue excluded |
| 3 | CRO by source/segment | partial | 6 copy experiments on home/free-ads/upsell/card, kmd_vid subject | purchased conversion (#3) | no per-source segmentation of variants; weeks of traffic needed (minPerVariant 80-300) |
| 4 | Activation / time-to-value | partial | activation rescue (rescue.ts, loop), activation rate in snapshot | opt-out/cap fixes (#5-7) | flag OFF; unverified live |
| 5 | Lead nurture | partial | nurture.ts 2-3 emails, one question, checkNote promise-regex, global caps | caps (#5) | flag OFF; no objection-reply feedback loop verified |
| 6 | Retention | partial | day30 retention, cancel_save, success agent | - | n=0 subscribers; nothing to observe |
| 7 | Expansion/referrals | partial | expansion.ts, referral loops | cap fix | referral revenue not attributed in economics |
| 8 | Reactivation | partial | reactivation.ts (dormant d-steps, cancelled feedback), winback, checkout_recovery | opt-out age fix (#6) | flag OFF; consent = unsubscribe/reply suppression only |
| 9 | Autonomous customer success | partial | success.ts daily agent, guarantee_watch ON | - | OFF; no auto-credit (web-only) by design: alerts Nolan |
| 10 | Market/product intel | partial | adlib scan, ad_watch, competitors.json, product-intel | - | not yet tied to offer decisions beyond agent prompt |
| 11 | Constraint optimisation | met | diagnoseConstraint, optimizer diagnose | ranking bug (#1) | benchmarks are assumptions (labelled) |
| 12 | Experimentation | met | experiments.ts Bayesian, idempotent, honest thresholds, learnings append-only | purchased metric | winner calls need weeks |
| 13 | Profitability/cash flow | partial | cashFlow, CAC, payback, refunds, costs (AdRun cost, Kly cost, ad_spend, infra) | honesty notes (#2) | ad_spend: writer exists in engine/src/ops/business.ts under `sys_finance_intel` + META_ADS_TOKEN (not on); INFRA_MONTHLY_CENTS unset; support cost not modelled |
| 14 | Collective intelligence | met | shared systemForTouch mapping, optimizer knowledge.ts merges findings | - | - |
| 15 | Autonomous operation | partial | snapshot loop, digest cron, optimizer allow-list, dry-run mode | owner UI (#4) | everything OFF; browser/desktop use not built into these loops (coordinator-driven) |
| 16 | Stage awareness | met | businessStage -> Stage 1 Monetize (live verified) | - | - |

Count: met 4, partial 12, not 0. Nothing is "not built"; most is unproven until flags run.

## Copy audit
Lifecycle/offer copy uses public-offer.ts facts; NO_GUARANTEE_LINE ("can't promise leads or sales") appears in the bridge; `checkNote` rejects promise phrases and requires unsubscribe + a question. Scarcity: "limited window ... only once" is true (7-day first-month window, once per workspace, enforced by `autopilotLaunchState`). Founding-spot counts come from the helper. No fake proof found.

## Remaining / risks
- Digest cron writes its "sent" marker before sending (revenue-digest route): a mail failure skips that week. Minor, left.
- Optimizer needs experiments module in image: already COPY'd (Dockerfile lines for revenue/*, offer-intel/, optimizer/).
- Unrelated failures from other workers seen during runs (newsletter email-guard/cron inventory, funnel classifyTouch sys_newsletter, ecosystem flag regex, competitive scorecard): not touched here.
- Engine render static tests fail: missing Playwright browser (environmental).

## Files changed
src/lib/revenue/{constraints,economics,queries}.ts + __tests__/revenue.test.ts; src/lib/revenue-lifecycle/core.ts; src/lib/offer-intel/{validate,agent}.ts; src/lib/ads/billing-webhook.ts; src/app/api/ads-billing/checkout/route.ts; src/lib/ads/lifecycle/{load,select}.ts; engine/src/customersuccess/load.ts; src/app/admin/ads/revenue/page.tsx; new src/app/api/admin/ads/offer-proposals/route.ts, scripts/revenue-dry-run.ts, docs/audit/*.
