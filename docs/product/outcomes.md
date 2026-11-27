# Product intel: creative quality, effectiveness ledger, outcome verification

Code: `src/lib/product-intel/*` (pure, tested), `engine/src/productintel/*` (jobs), admin page `/admin/ads/outcomes`.
Flags (AdsFeatureFlag, default OFF): `sys_creative_qa`, `sys_outcome_verify`. Everything is report-only: AdsEvent rows and one alert email. Nothing blocks a pack, edits a prompt or contacts a customer.

## 1. Creative quality scorer (`sys_creative_qa`)
- `scorePack(deps, runId, {critique})` in `engine/src/productintel/score.ts` (callable from the render pipeline later). Each ready static ad gets 0-100 from severity-weighted checks (high 25, medium 12, low 5).
- Copy checks: headline length/readability, call-out in the first six words, CTA present/not vague, banned claims (guarantees, multiplier results, fake scarcity), numbers without a sourced claim, offer present, trade/city mentioned.
- Image checks (sharp, tiny downscaled proxies): resolution, flat/empty image, contrast range, edge crowding (safe zone), brand colours present, logo on file, near-duplicate images (average hash) and headlines across the pack. These flag likely problems; they do not read the text.
- AI critique (Codex provider, strict zod JSON): ~1 in 3 packs, 3 sampled ads, first ad image attached (vision is supported by `TextRequest.images`). Rubric: call-out, value, CTA, likelihood of achievement, time/effort, first 5 seconds. Blends 70% programmatic / 30% rubric. Failure keeps the programmatic score.
- Stored as AdsEvent `creative_score` (runId; props: packScore, ads[{adId, score, issues}], packIssues, trade, template, model, promptVersion). Model is the provider name and prompt version is "unversioned" today (the plan prompt has no version stamp); trade comes from `trade_tagged`.
- Weekly: `creative_finding` rows per (cause x trade/template/model/promptVersion) when 3+ ads and 8+ ads in the group and the rate is >=25% and 1.5x the overall rate; each carries count, example runIds, suggested fix and a `proposal` (target prompt/template/render, evidence). Proposals are for the owner to accept; there is no auto-edit.

## 2. Effectiveness ledger (`sys_outcome_verify`, weekly)
`buildLedger` joins `AdPerformanceDay.adId` to ad attributes (trade, angle, hook type, format/ratio, headline length, offer, template). An attribute value is `measured` only at 1000+ impressions across 2+ ads, else `insufficient`; CTR is shrunk toward the overall CTR (prior 500 impressions); CPL only with 1+ lead. With no delivered ads it says so and claims nothing (true today: no live customer ads). `hookLibrary` lists measured hook types/angles that beat the average; empty until data exists. Weekly row: AdsEvent `creative_effectiveness`.

## 3. Outcome verification (`sys_outcome_verify`, hourly)
Tiers: pack finished, opened, downloaded, unlocked, ads published, first impression, first click, first lead, lead contacted, week-2 performing. A tier is `reached` (a row exists), `not_yet`, or `not_tracked` (no event exists: lead contacted, until a `lead_contacted` event is written). Week-2 performing = leads in days 8-14 after first impression, evaluated only once day 14 has passed. Health: `on_track | at_risk | failed | unknown` with reasons; "too early" is shown when data is thin.
Preventable failures: `pack_failed`, `pack_partial`, `publish_failed`, `meta_rejected` (DISAPPROVED/REJECTED/WITH_ISSUES), `zero_delivery_3d`, `spend_no_leads` (>=50.00 spend in 7+ days, no lead). Each becomes one `outcome_failure` row keyed by `workspace:code:ref` (deduped) and a digest email to nolan@prestyj.com (deleted and retried if the send fails). `CS_DRY_RUN=1` suppresses email. Test accounts excluded.

## Not done / limits
- Opened is observed via `launch_guide_opened`/`pack_opened` only; if the web never writes them, "opened" stays not-yet. Lead contacted is not tracked yet.
- Image metrics are cheap proxies; an unreadable-text finding needs the vision critique (sampled).
- Currency: `spendMinor` is in the ad account's currency (not converted).
