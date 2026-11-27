# 3. Support

**Requirement.** Every customer message gets a first response within 15 minutes without the owner; the owner only sees what needs a human decision, with a recommendation attached. Pre-revenue: extend what exists, build nothing new that a database event can carry.

**What exists (built, flags OFF until enabled)**
- Unified inbox model (pure): `src/lib/ops/support.ts`. Derived from existing AdsEvents (`email_replied`, `email_needs_human`, `email_auto_replied`, `email_reply_handled`) plus `support_ticket` (failed-job tickets written by `engine/src/ops/support.ts`, flag `sys_support_ops`). Status: new | auto_resolved | waiting_customer | needs_owner | resolved. SLA: first response 15 min; owner due 4 h (paying) / 24 h.
- Knowledge base: `src/lib/ops/kb.ts` (`kbAnswer(question)`), mirrored in `docs/ops/support-kb.md`. Facts come from `public-offer.ts` / `billing-config.ts`. Wired into the auto-responder (`src/lib/ads/auto-reply-server.ts`): for how_to / interested / objection replies a KB answer is used before the model; the existing review gate still checks the final text.
- Refund recommendation only: `src/lib/ops/refund.ts` (`recommendRefund`). It never refunds. The admin page shows the verdict and the existing `RefundDialog` -> `/api/admin/ads/refunds` -> `issueAdsRefund` (owner confirms every refund).
- Admin page `/admin/ads/support`: open items by status, SLA misses, recurring causes (reuses `customer_success_finding`) with "fix the cause" links, "Mark handled" (existing inbox endpoint).
- Support health feeds incidents: auto-responder silent (>=3 replies past SLA, none with any outcome) -> P2 incident; owner-overdue items -> P3.

**Acceptance criteria**
1. `kbAnswer` returns a cited answer for download, locked ads, billing, refund, Meta setup, cancellation, free pack, results; null for unrelated text; no answer promises leads, sales or results (tests).
2. Ticket status and SLA derive correctly from events (tests); failed-job tickets are never emailed to customers.
3. Refund recommendation is `recommend_refund` inside 30 days, `owner_decides` on repeat refund or our failures outside the window, `recommend_decline` otherwise (tests). No code path refunds without the dialog confirmation.
4. With `sys_support_ops` OFF nothing runs; KB wiring is additive and fails back to the model.

**Verification.** `npx vitest run src/lib/ops/__tests__/support-ops.test.ts`. Live status needs data: enable `sys_support_ops`, then confirm `support_ticket` rows appear and the page lists them.

**Not built / assumptions.** Contact-form / `support_request` events: none are produced by the app today (the backlog reader accepts the name); when a form exists it only needs to write `email_replied`-shaped events. Failed-job tickets do not email the customer (owner approval first). The auto-responder's own model call still uses `OPENAI_API_KEY` (`webText`, pre-existing); moving it to the Codex provider is a separate change.
