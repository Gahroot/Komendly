# Product excellence PRD (part 2)

Methodology: Hormozi value equation (shorter delay, less effort), constraint theory (fix the biggest constraint first), $100M Offers differentiation. AI = Codex subscription only. No promised results: every outcome below is a *measure*, and status says what exists today. Machine-readable mirror: `registry.json`. Flags (default OFF): `sys_reliability`, `sys_delivery_econ`, `sys_competitive`, `sys_product_loop`. Admin: `/admin/ads/product`.

Status values: built_flag_off (code + tests exist, flag off), operational_pending_flag, partial, documented, awaiting_prerequisite (needs real customer data).

## 1. Creative quality

- **Measurable outcome:** Share of generated ads passing QC and the critique rubric on first render; no unsupported claims.
- **Acceptance criteria:** QC pass rate >= target on real packs; critique scores logged per ad.
- **Verification:** QC/critique events per ad; src/lib/product-intel/creative.ts, critique.ts tests.
- **Status:** partial
- **Code refs:** src/lib/product-intel/creative.ts, src/lib/product-intel/critique.ts, engine/src/jobs/qc.ts
- **Blocked on real customer data / owner:** Needs real packs and customer ratings to calibrate the rubric.

## 2. Advertising effectiveness

- **Measurable outcome:** Cost per lead / CTR of published ads vs the customer's own baseline.
- **Acceptance criteria:** Effectiveness reported per ad with sample size and confidence; never an invented number.
- **Verification:** src/lib/product-intel/effectiveness.ts tests; Meta insights.
- **Status:** partial
- **Code refs:** src/lib/product-intel/effectiveness.ts, engine/src/growth/meta-results.ts
- **Blocked on real customer data / owner:** Needs real Meta spend from paying customers (currently ~1 buyer).

## 3. Self-learning campaigns

- **Measurable outcome:** Next week's ads change because of last week's results.
- **Acceptance criteria:** A logged decision per cycle that cites results; reversible.
- **Verification:** Optimizer/outcome events; src/lib/optimizer tests.
- **Status:** awaiting_prerequisite
- **Code refs:** src/lib/optimizer/cycle.ts, src/lib/product-intel/outcomes.ts
- **Blocked on real customer data / owner:** Needs live spend and results to learn from.

## 4. Complete customer problem solving

- **Measurable outcome:** Share of customer problems (support replies, stuck states) resolved without the founder.
- **Acceptance criteria:** Customer-success findings cluster causes; each cluster has a fix or an owner action.
- **Verification:** engine/src/customersuccess; product_loop ingests customer_success_finding.
- **Status:** partial
- **Code refs:** src/lib/revenue-lifecycle/success.ts, engine/src/productintel/run.ts
- **Blocked on real customer data / owner:** Needs real replies and failures to cluster.

## 5. Radical simplicity

- **Measurable outcome:** Steps and minutes from link to first ad; fewer decisions asked of the owner.
- **Acceptance criteria:** Friction map lists each step with drop-off; time-to-first-ad SLO tracked.
- **Verification:** docs/product/friction-map.md; reliability snapshot time_to_first_ad.
- **Status:** partial
- **Code refs:** docs/product/friction-map.md, src/lib/product-intel/reliability.ts
- **Blocked on real customer data / owner:** Needs funnel volume for drop-off rates.

## 6. Customer-specific intelligence

- **Measurable outcome:** Ads and advice reflect the customer's trade, area and history.
- **Acceptance criteria:** Customer intel profile used in planning; documented in customer-intel.md.
- **Verification:** docs/product/customer-intel.md; tests in src/lib/customer-intel.
- **Status:** partial
- **Code refs:** src/lib/customer-intel/, docs/product/customer-intel.md
- **Blocked on real customer data / owner:** Needs real customers to validate relevance.

## 7. Agency product excellence

- **Measurable outcome:** Agency-grade deliverables (reporting, multi-brand, white-label gaps) identified and closed.
- **Acceptance criteria:** Gap list with evidence and effort; each gap in the product backlog.
- **Verification:** docs/product/agency-gaps.md.
- **Status:** documented
- **Code refs:** docs/product/agency-gaps.md
- **Blocked on real customer data / owner:** Needs agency users to confirm priorities.

## 8. Competitive superiority

- **Measurable outcome:** Transparent scorecard vs alternatives from public facts; differentiators proposed, not claimed.
- **Acceptance criteria:** Every score has URL + checked date; unverified left blank; positioning lists where alternatives win.
- **Verification:** src/lib/product-intel/__tests__/reliability-econ-loop.test.ts (competitive block); npx tsx scripts/competitive-scan.ts.
- **Status:** operational_pending_flag
- **Code refs:** src/lib/product-intel/competitive.ts, scripts/competitive-scan.ts, docs/product/competitive.md, engine/src/productintel/run.ts (competitiveTick)
- **Blocked on real customer data / owner:** Canva, Pencil, Smartly, Meta Advantage+ not yet verified (run scan with --fetch and review); customer-win evidence needs real results.

## 9. Outcome verification

- **Measurable outcome:** Claims about results are verified against measured data before they are shown.
- **Acceptance criteria:** No outcome claim without a source event; failures logged as outcome_failure.
- **Verification:** docs/product/outcomes.md; outcome tests.
- **Status:** partial
- **Code refs:** src/lib/product-intel/outcomes.ts, docs/product/outcomes.md
- **Blocked on real customer data / owner:** Needs measured customer results.

## 10. Autonomous product improvement

- **Measurable outcome:** Weekly ranked backlog and plain-English what-to-build-next; config-only auto-apply within an allow-list.
- **Acceptance criteria:** Ranker + allow-list validator tested; auto actions logged with previous value; code changes stay proposals.
- **Verification:** vitest: product loop block; AdsEvent product_backlog / product_digest / product_auto_applied.
- **Status:** built_flag_off
- **Code refs:** src/lib/product-intel/backlog.ts, engine/src/productintel/run.ts (productLoopCycle), src/app/admin/ads/product/_cards/backlog-card.tsx
- **Blocked on real customer data / owner:** Ranking quality needs real signals; turn on sys_product_loop after deploy. Owner approves backlog status changes.

## 11. Reliability

- **Measurable outcome:** SLO: >= 97% of standard packs finish with >= 8 ads within 10 minutes; outages and stuck jobs detected same day.
- **Acceptance criteria:** Daily reliability_snapshot; breach emails deduped per day; findings deduped; read-only provider-order guidance.
- **Verification:** vitest: reliability block; admin card /admin/ads/product.
- **Status:** built_flag_off
- **Code refs:** src/lib/product-intel/reliability.ts, engine/src/productintel/run.ts (reliabilityTick), src/app/admin/ads/product/_cards/reliability-card.tsx
- **Blocked on real customer data / owner:** SLO needs >= 10 finished packs per window; provider/model split needs the engine to record provider in AdJob result (today often 'unknown').

## 12. Delivery economics

- **Measurable outcome:** Known cost to deliver per pack/ad/video/Studio turn and gross margin per plan and offer ($9 unlock, $97 first month, $297 plan, free pack as acquisition cost).
- **Acceptance criteria:** Daily delivery_econ snapshot; hotspots; savings proposals with explicit assumptions; no automatic model or price change.
- **Verification:** vitest: delivery economics block; admin card.
- **Status:** built_flag_off
- **Code refs:** src/lib/product-intel/delivery-econ.ts, engine/src/productintel/run.ts (deliveryEconTick), engine/src/providers/cost.ts
- **Blocked on real customer data / owner:** Costs are API-list equivalents (Codex is flat-rate): margins conservative. Utilisation (share of credits used) needs real subscriber data.

## 13. Collective intelligence

- **Measurable outcome:** Patterns learned across customers (trade, template, hook) improve everyone's output without leaking one customer's data.
- **Acceptance criteria:** Aggregated, anonymised learnings with minimum sample size.
- **Verification:** Not yet built here.
- **Status:** awaiting_prerequisite
- **Code refs:** docs/growth-ecosystem/learnings.md
- **Blocked on real customer data / owner:** Needs many customers; privacy review before any cross-customer use.

## 14. Autonomous operation

- **Measurable outcome:** Systems run, heartbeat, alert on failure and stop safely without the founder.
- **Acceptance criteria:** Each system has a kill-switch flag, heartbeat and alert; product_loop auto-pause not yet added.
- **Verification:** src/lib/growth/systems.ts health; flags page.
- **Status:** partial
- **Code refs:** src/lib/growth/systems.ts, engine/src/jobs/monitor.ts, engine/src/productintel/run.ts
- **Blocked on real customer data / owner:** Needs a deployed engine and flags turned on by the owner.

## Known gaps

- Provider/model are not stored on AdJob (read tolerantly from payload/result; else 'unknown'). Proposal: have the engine write `provider`/`model` into AdJob.result (engine/src/runner.ts is another worker's).
- Auto-apply is limited to turning read-only systems ON and SLO thresholds within bounds; everything else is a proposal.
- Competitive scores for Canva, Pencil, Smartly, Meta Advantage+, freelancers and DIY are unverified by design until the scan is run and a human reviews it.
