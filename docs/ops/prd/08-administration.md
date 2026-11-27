# 8. Business administration

Flag: `sys_biz_admin` (default OFF). Registry: `docs/ops/obligations.json` (owner-editable; null date = unknown). Logic: `src/lib/ops/admin/obligations.ts`.

## Built
- Seeded obligations: sales-tax/nexus (after revenue, professional), Stripe tax settings, Meta business verification + app review (~9 Dec 2026, approximate), Chrome Web Store $5, Zapier/Jobber marketplace steps, domain renewals, SSL, privacy/ToS review, CAN-SPAM address, GDPR/CCPA requests, trademark, insurance, LLC annual report (the last four flagged `needsProfessional`), accountant pack, vendor inventory review, partner payouts.
- Weekly job (`engine/src/ops/business.ts`, Monday after 15:00 UTC): ONE email to `ADS_ALERT_EMAIL` with only overdue + next-30-days items; nothing is sent when nothing is due. Marker `obligations_digest_sent` per ISO week.
- Page: obligations table inside `/admin/ads/finance`.
- Records for the accountant: `scripts/ops-export-records.ts [YYYY-MM]` (revenue, refunds, ad-spend, partner-payouts, costs CSV + summary.md).

## Acceptance criteria
1. Unknown dates stay `unscheduled` and show "needs your input"; never guessed. Tested.
2. Overdue / due-soon (<= 30 d) / upcoming / done / revenue-triggered "waiting" states. Tested.
3. Recurring items roll forward from `lastDone`. Tested.
4. Digest contains only overdue + <= 30 d items and flags "needs a professional"; no legal or tax advice is given.
5. CSV export escapes quotes and guards spreadsheet formulas. Tested.

## Gaps
- Domain expiry from RDAP: `parseRdapExpiry` exists in `src/lib/ops/infra.ts`; `evaluate()` accepts `overrides` but no job feeds them yet.
- Status: built, unverified in production.
