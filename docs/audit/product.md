# Product-intelligence audit (26 Nov 2026)

Method: code read, live read-only SELECTs (no writes), `scripts/audit-product-live.ts` (read-only), tests. "Implemented" is not "operational": **every product/customer-intel flag is OFF in prod (no `AdsFeatureFlag` rows exist), so none of it has produced a row yet.** Nothing was committed or deployed.

## Live facts (30-day window)
- Standard packs confirmed: 60 (59 eligible >=8 statics). Free packs avg cost $5.40 (n=48), paid $3.69 (n=12), gift $0.23 (n=441); per ad $0.199; per video $0.79; per credit $0.303. Independent SQL: standard completed/partial avg $5.056 (n=60), job-cost total $466 vs run total $444 (jobs include retries/non-run work).
- Percentiles: SQL and analyzer match exactly (TTFA p50/p90/p99 = 168.3s/297.0s/477.6s; time-to-completed p50/p90/p99 = 477.3s/1722s/3772s, n=60).
- **Discrepancy found and fixed:** the SLO measured `completedAt`, which also waits for motion/bonus ads. Independent SQL: 22/58 packs >10 min by completedAt but only 7/58 by the 8th ready static (median 342s). SLO now uses the 8th ready static's `Ad.updatedAt` (fallback completedAt). Result: 57.6% -> 79.7% (47/59 ok; failed 1, short 4, slow 7). **Still below the 97% target: a real breach, not noise.** Caveat: `updatedAt` can move on revisions.
- Stage failures: extract 12/565 dead (2.1%), render_motion 13/297 (4.4%), review_quote_video 3/29, render_static 1/3292.
- Creative copy checks (pure scorer over 25 real recent non-gift packs, 255 ads; image checks skipped: need S3): pack score 73-82 (median 77). Issues: no_callout 204/255 (medium), cta_missing 3 (high), headline_long 4, duplicate_copy 2, offer_absent 1. Scorer is calibrated on nothing yet: no customer ratings exist.
- Outcome timeline for mtplanton@comcast.net (the one real payer): pack finished 18 Nov 02:55, downloaded 18 Nov 03:13, unlocked ($9) 25 Nov 18:18; opened = not_yet (nothing wrote the event before), published/impression/click/lead = not_yet, lead_contacted = not_tracked; health on_track, no failures. Correct against the rows (matches 25 Nov `purchased`).
- 49 customers loaded by `loadOutcomes`.

## Matrix
| # | Outcome | Status | Evidence | Fix this audit | Remaining |
|---|---|---|---|---|---|
| 1 | Creative quality | partial | creative.ts scorer + critique; real run above | none needed; findings: 80% of ads lack a callout | Flag `sys_creative_qa` off; needs image metrics run + customer ratings to calibrate |
| 2 | Ad effectiveness | partial | effectiveness.ts ledger, perf rows | none | Needs paying customers with Meta spend (0 today) |
| 3 | Self-learning | partial | memory.ts / learning.ts built | Added daily refresh tick (`engine/src/customerintel/tick.ts`, wired in main.ts), flag `sys_customer_memory`, default OFF | Memory never populated; no evidence it helps |
| 4 | Complete problem solving | partial | customer-success findings feed backlog | none | Needs real replies |
| 5 | Radical simplicity | partial | friction-map.md | none | Funnel volume too low |
| 6 | Customer-specific intel | partial | memory + weekly learned | Planner use is now style-only + 50% deterministic holdout, logged as `memory_ab`, behind a second flag `sys_customer_memory_planner` (default OFF) | Compare `creative_score` by arm before trusting |
| 7 | Agency excellence | partial | /ads/agency gated (login redirect, notFound unless flag+agency plan); tsc clean (prop mismatch no longer present) | Download ZIP uses `exportFileName` for agency workspaces (flag `sys_agency_ops`) | No agency users; white-label/reporting gaps in agency-gaps.md |
| 8 | Competitive | partial | 5 entrants verified earlier | Pencil partly scored from its home page (URL + 2026-11-26); Canva (403), Smartly (no content), Meta Advantage+ (400) left blank with reason: **not fabricated** | Verify Canva/Meta in a browser |
| 9 | Outcome verification | partial | outcomes.ts, correct on real customer | `pack_opened` now written (pack page, once per run, members only); `launch_guide_opened` already tracked client-side | `lead_contacted` has no writer (no lead-status UI exists); stays "not tracked" |
| 10 | Autonomous improvement | built, unscheduled | backlog.ts, run.ts | `startProductEngineLoop` is started once in engine/src/main.ts (I added a duplicate and removed it); backlog card exists | Flags off; no signals yet |
| 11 | Reliability | partial | analyzers match SQL | SLO fix above; provider/model stamping (below) | SLO breach 79.7% vs 97%: extract/motion time is the lever |
| 12 | Delivery economics | partial | $ figures above | none | utilisation unknown (no subscribers); costs are API-list equivalents |
| 13 | Collective intelligence | not | no cross-customer aggregation (by design: privacy) | none | Needs anonymised aggregate design + sample-size floor |
| 14 | Autonomy boundaries | met | config-only allow-list (`AUTO_FLAG_ALLOW`), report-only scoring, privacy purge, all flags default OFF | `purgeCustomerMemory` hooked into `scripts/privacy-purge-user.ts` (counts in dry run; deletes only with --apply) | Account-deletion UI path not found; only the script |

## Known gaps, status
- refreshCustomerMemory scheduling: done (flag-gated, `CM_DRY_RUN=1` logs only, max 10 workspaces/tick, >=24h per workspace).
- Provider/model on AdJob: `runner.ts` off-limits, so the reliability tick stamps LLM stage jobs in memory with the engine-configured provider/model labelled "(engine-configured)" and writes one `engine_provider` AdsEvent per day. It is a configuration fact, not a per-job measurement; true per-job recording needs a runner/AdJob change.
- exportFileName: wired (agency only). purgeCustomerMemory: wired in script only.
- Product-loop admin card + backlog: card exists (`/admin/ads/product`); it will read "No backlog rows" until `sys_product_loop` runs.
- Engine Docker whitelist: new `engine/test/dockerfile-transitive.test.ts` walks the full import closure of shared src/lib (product-intel, customer-intel included) and fails on a missing COPY or `@/`/next imports. Passes.

## Checks run
- `npx tsc --noEmit -p .`: clean. `cd engine && npm run typecheck`: clean.
- `npx vitest run src/lib`: 1505 pass, 3 fail, none in my files: funnel.test (classifyTouch returns `sys_newsletter`), email-guard (sender classification), ops/control (`/api/cron/newsletter` not in ledger). They belong to another worker's in-flight newsletter change.
- `cd engine && npm test`: 567 pass, 4 skipped; failures only `render/static/{image,static}.test.ts` (missing Playwright browser, environmental).
- New tests: `src/lib/product-intel/__tests__/slo-ready-time.test.ts`, `engine/test/customer-memory-hook.test.ts`, `engine/test/dockerfile-transitive.test.ts`.

## Files changed
engine/src/customerintel/{hook,tick}.ts, engine/src/main.ts, engine/src/productintel/run.ts, src/lib/customer-intel/memory.ts, src/lib/product-intel/{reliability,competitive}.ts, docs/product/competitive.{md,json} (regenerated), src/app/ads/runs/[id]/page.tsx, src/app/api/ads/runs/[id]/download/route.ts, scripts/privacy-purge-user.ts, scripts/audit-product-live.ts (new, read-only), tests above, product-intel test slug fix.
