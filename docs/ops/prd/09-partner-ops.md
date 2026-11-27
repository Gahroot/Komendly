# 9. Partner operations

Flag: `sys_partner_ops` (default OFF). Builds on the existing partner program (`AdsPartner`, `AdsCommission`, `/partners`, `/admin/ads/partners`); nothing public changes.

## Terms
Ops terms (`src/lib/ops/partners/commission.ts`): 20% recurring for 12 months, only on payments that cleared the 30-day refund window and were not refunded; no test/internal accounts; self-referral blocked (workspace, user or email). **The live program (`PARTNER_TERMS`, `AdsPartner.commissionPct` default) is 30%.** Statements show a "terms differ" flag; the owner must pick one rate before paying anyone.

## Built
- Pure calculator + clawback, monthly statement builder (`statement.ts`), health classifier + templated emails (`health.ts`), loader (`load.ts`).
- Engine job: monthly `partner_statement` AdsEvent per partner (day >= 2, last full month, idempotent per partner+month); activation email (approved, 14+ days, zero referrals; once per partner, max 5/day); thank-you to top performers (max every 90 days, 2/day). Markers `partner_activation_sent`, `partner_thanks_sent`.
- Partner support: `partnerSupportRoute()` maps onto existing auto-responder categories (payout questions = `billing` = human; link/terms = `how_to` = auto).
- Admin: statements / pending payouts / health section on `/admin/ads/partners` (only when flag ON).

## Manual payout flow (Stripe Connect is NOT built)
1. Open `/admin/ads/partners`, read the statement (status `pending owner approval`, payable >= $50).
2. Owner approves, then pays by PayPal/Wise from their own account.
3. Click the existing "mark paid" with the payment reference; it records `AdsCommission.paid` + `admin_partner_paid`. The system never sends money. Under $50 carries over.

## Acceptance criteria
1. Commission only on cleared, non-refunded, non-test, non-internal, non-self payments within 12 months. Tested.
2. Refund after payout is clawed back in the refund month, payable never negative. Tested.
3. Status is `paid` only with a recorded reference. Tested.
4. Activation email once per partner; no email when flag OFF. 
- Status: built, unverified with real partners (none approved yet).
