# Money model audit + Black Friday offer (27 Nov 2026)

## Should paid ads sell the full offer, or the free 10 ads?
**Lead with the free 10 ads, and present the paid offer inside the funnel.** Komendly's buyers are cold local-business owners on Facebook who don't know us yet. Hormozi's $100M Leads says paid ads should send strangers to a lead magnet. The magnet should be so valuable that it is worth more than the core offer costs, and it should prove the product works. The sale comes after they have used it. $100M Money Models says the attraction offer should then turn that trust into cash quickly: a small first payment, then an upsell, a downsell and continuity, with acquisition cost recovered within 30 days. So the ad says "paste your website, get 10 free ads", and the $9 unlock, the upsells and annual prepay come after the pack is ready.
- $100M Leads summary: https://www.scalabl.com/literature/100m-leads/
- $100M Money Models summary: https://businessbookclub.substack.com/p/100m-money-models-by-alex-hormozi

Ad landing URL: `https://www.komendly.com/black-friday?utm_source=facebook&utm_medium=paid&utm_campaign=bfcm2026`

## Funnel vs the books
| Step (Money Models) | Komendly | Status |
|---|---|---|
| Attraction offer | Free pack of 10 ads (no card), then **$9 "Unlock this pack"**. During BFCM the $9 also comes with 10 credits instead of 3 | Existed. BFCM bonus added |
| Card on file | The $9 checkout now saves the card (`setup_future_usage: off_session`), and later checkouts show the saved card | **Gap, fixed** |
| Upsell | After the $9: Growth Autopilot first month $97, then $297/mo (10 founding spots; 0 taken today). Ad Department first month $97, then $197/mo | Existed (shipped 26 Nov) |
| Pull cash forward | **BFCM-only annual prepay**: Ad Department $1,497/yr (12 monthly payments = $2,364) and Growth Autopilot $2,497/yr (12 monthly payments = $3,564), each with +720 bonus credits. Autopilot also gets priority setup | **New** |
| Downsell | Declining Autopilot offers the DIY Ad Department. Cancelling checkout offers the $9 unlock or Starter | Existed |
| Continuity | Monthly or yearly subscriptions. The BFCM yearly price stays the same when it renews | Existed |

$100M Offers check:
- **Dream outcome:** "customers asking for quotes without running ads yourself".
- **Likelihood:** they see their own ads first.
- **Time delay:** ads in minutes.
- **Effort:** paste a URL.
- **Named offer and bonuses:** yes.
- **Real scarcity:** 10 founding spots, counted from the DB.
- **Real urgency:** a fixed deadline of **Mon 30 Nov 2026, 11:59:59 pm PT**, enforced at checkout. After it the offer disappears, and nothing resets.
- **Guarantee:** ads live within 7 days of you connecting Meta, or your first month is refunded, plus a 30-day full refund. No promises of leads, sales or ROI.

## What fires Meta Purchase
- **Before this change:** only subscription checkouts sent Purchase, so the $9 first payment was invisible to a campaign optimising for Purchase.
- **Now:**
  - Every paid ads checkout sends Purchase with its value and currency from the server (CAPI, Stripe webhook `purchased`).
  - The browser pixel sends the same event ID, so Meta counts it once. It fires on `/ads/billing`, `/ads/team` and, for the $9 unlock, on the unlocked pack page.
  - Subscribe still fires only for subscriptions.

## Gaps left
- One-click upsell that charges the saved card without Checkout is not built. The upsell opens Stripe Checkout, which shows the saved card.
- The BFCM annual price IDs must stay in env after the offer ends, because renewals map through them.
