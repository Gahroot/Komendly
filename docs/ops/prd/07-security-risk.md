# Security, privacy and risk

**Goal:** Keep customer and prospect data safe, honour opt-outs, and catch exposure before attackers or regulators do.

**Built:** docs/ops/security-audit.md, docs/ops/privacy-compliance.md, src/lib/ops/security/*, scripts/privacy-purge-user.ts, src/lib/ops/__tests__/email-guard.test.ts

**Success measures:** Open critical/high findings; senders without suppression (target 0 known gaps); purge dry-run completes on a test user; privacy policy drift items (target 0).

**Operating rules:** call `recordOwnerIntervention(db, kind, note)` (src/lib/ops/qa/owner-intervention.ts) whenever the owner does by hand something the system should have done; never for planned reviews. Run `npx tsx scripts/process-review.ts` weekly (add `--apply` to record `process_finding` events); the card on /admin/ads/ops (`_cards/process-card.tsx`, not yet wired into the page) shows the result.

**Open items:** see docs/ops/security-audit.md and docs/ops/privacy-compliance.md.
