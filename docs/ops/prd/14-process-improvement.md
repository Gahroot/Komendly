# Continuous process improvement

**Goal:** Fix recurring causes permanently, and measure it by outcomes, not by the number of automations.

**Built:** src/lib/ops/qa/process-improvement.ts, owner-intervention.ts, process-load.ts, scripts/process-review.ts, src/app/admin/ads/ops/_cards/process-card.tsx

**Success measures:** Recurrence rate of incident keys; owner interventions per week; mean time to detect and to resolve (compare last 28 days with the 28 before).

**Operating rules:** call `recordOwnerIntervention(db, kind, note)` (src/lib/ops/qa/owner-intervention.ts) whenever the owner does by hand something the system should have done; never for planned reviews. Run `npx tsx scripts/process-review.ts` weekly (add `--apply` to record `process_finding` events); the card on /admin/ads/ops (`_cards/process-card.tsx`, not yet wired into the page) shows the result.

**Open items:** see docs/ops/security-audit.md and docs/ops/privacy-compliance.md.
