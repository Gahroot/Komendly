# Objective: First 10 Independent Paying Customers

Follow-on commercial objective of the Commercial Validation phase. Code: `src/lib/exec/first10.ts` (`loadFirst10Progress`, `decideFirst10`), shown as a card on `/admin/ads/executive` and one line in the Monday brief.

## Definition
A customer counts when a real person or business, independent of the team, paid with their own money, evidenced by a **live Stripe reference** (`cs_live_`/`sub_`/`pi_`/`in_`) on an AdsEvent `purchased|renewed|paid_converted`. A $9 unlock buyer counts if independent. Counting is per person (email aliases collapse: dots and `+tags`).

## Exclusions (listed, never counted)
internal/team/test addresses (`isInternalAccount`); test-mode ids (`_test_`); no Stripe reference; zero/negative amount; refunded; comped or 100%-discounted/incentivised; duplicate workspace or same person; anything the owner writes as AdsEvent `first10_exclusion` ({workspaceId|email, reason}) for friends/family. Every exclusion is shown with its reason. When the ledger cannot be read the result is 0 verified, never a guess.

## Boundaries
No paid ads unless separately authorised by the owner (Meta stays off; allocation spend is $0). No spam, deception, fake scarcity or irrational discounts. Cold email stays inside the Kly governor. No incentivised purchases. The exec layer never changes prices, caps or billing, and never raises its own authority.

## Measurement tables (read from existing ledgers; unknown stays unknown)
| Table | Source |
|---|---|
| Verified payers (+ excluded with reason) | `first10.ts` |
| Revenue and contribution margin (revenue minus AdRun generation cost; null if unknown) | `first10.ts` |
| Prospects reached | `KlyDaily.sent`, signed_up by first touch |
| Conversion by step (visit, sign-up, pack finished, $9, subscription) | `revenue_snapshot.economics.funnel` |
| Source of each payer | `signed_up.firstTouch` (`bySource`) |
| Offers tested | `exec_experiment`/experiments, `offer_proposal` |
| Feedback | customer replies, `customer_success_finding` |
| Costs | `finance_snapshot`, `ad_spend`, Kly cost |
| Constraints and lessons | `exec_context`, `exec_decision_review` |

## Current progress (read-only production check, 26-27 Nov 2026)
1/10 verified: one $9 unlock (25 Nov, comcast.net, live Stripe session). 0 subscribers. 73 sign-ups/30d, 536 packs finished, 1 cold-email reply. Stage pre_revenue, mode commercial_validation, strategy hold_and_measure.

## Execution plan (commercial-validation mode)
1. Keep existing channels running (cold email within governor, Quora, content, SEO); build nothing new by default.
2. Reply to every real reply and every buyer personally; ask the $9 buyer why they bought and what they would pay for next (owner-approved template).
3. Read the funnel weekly: the weekly strategy cycle names the constraint only once a step has 30+ observations; until then the objective stays hold_and_measure.
4. A build request is allowed only when a measured primary constraint exists and the owner approves.
5. Weekly brief carries "First 10: n/10".

## Completion evidence
10 entries in `loadFirst10Progress().customers`, each with a live Stripe ref, plus bySource, revenue and contribution, the exclusion list, and customer interviews/lessons recorded as `exec_decision_review`. Owner confirms. Then the next strategy cycle reassesses the stage (first_customers -> repeatable at 10 payers).

## What NOT to do
Do not count test, internal, friends/family, refunded or comped purchases. Do not run paid ads, discount to hit the number, buy lists, mass-email outside the governor, invent testimonials or social proof, or build features to "look busy".
