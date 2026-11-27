# Hormozi frameworks, translated for Komendly

## Sources and how reliable this is
- **Primary, read in full:** Acquisition.com Scaling Roadmap start page (https://www.acquisition.com/training/scalingstart): the 10 stages, their team sizes, owner roles and main constraints (quoted below).
- **Summary-based (secondary, not the books):** $100M Money Models summary (https://thegrowthreads.com/reviews/productivity/100m-money-models-summary/: 3 stages Get Cash / Get More Cash / Get The Most Cash, the "one customer funds the next two inside 30 days" test); $100M Offers value equation (https://conversion.studio/blog/alex-hormozi-value-equation: dream outcome, perceived likelihood, time delay, effort and sacrifice); $100M Leads (https://www.devendavis.com/book-summaries/100m-leads: engaged leads, the Core Four, lead getters, More-Better-New, Rule of 100).
- **Not available:** the Acquisition.com training lessons are video-only and were not read. Anything below not tied to a source above (e.g. the LTGP:CAC >= 3 target, grand-slam-offer components like scarcity/bonuses/guarantees) is from general knowledge of the books and should be treated as such.
- Numbers like benchmarks (3% visit to sign-up, etc.) are **our assumptions**, flagged in `src/lib/revenue/constraints.ts`.

## Translation table
| Principle | What it means for Komendly | Where in code |
|---|---|---|
| **Value equation** (dream outcome x likelihood / time x effort) | Dream = ads live in their own Meta account. Raise likelihood (guarantee on OUR work, shown real results only), cut time (first ad in minutes, live in 7 days), cut effort (we publish and replace losers). Offer tests change one lever at a time. | experiments.ts, offer/CRO worker |
| **Grand Slam Offer** | Ladder: free 10 ads -> $9 unlock -> Growth Autopilot ($97 first month, then $297/mo, founding, 10 real spots) -> DIY Ad Department ($97/$197) -> continuity. Scarcity and guarantee must be true (spots from the real helper). | src/lib/ads/public-offer.ts, root prd.md |
| **Money model: 4 offer types** | Attraction = free pack (lead magnet); Upsell = Autopilot right after the $9; Downsell = DIY Ad Dept; Continuity = monthly plan. Install one play at a time and watch 30-day cash. | economics.ts funnel steps |
| **30-day payback** | Gross profit from a customer's first 30 days should repay CAC (ideally 2 customers' worth). Reported as `payback30.ratio`. | economics.ts |
| **LTGP:CAC >= 3** | Lifetime gross profit over CAC. LTV is labelled `assumption` until 10+ subscribers have 90 days of history. | economics.ts `ASSUMPTIONS` |
| **Constraint / one thing at a time** | Rank steps by how much the funnel improves if that step hit benchmark; fix #1 only, re-measure. | constraints.ts `diagnoseConstraint` |
| **More, Better, New** | More of the working channel, then better creative/offer, then a new channel: only after the constraint says traffic. | constraints.ts action text |
| **Rule of 100** | 100 outreach actions per day on one Core Four channel until it works; we already send cold email at 200-1000/day (tiny) plus content. Do not add channels before one works. | docs/growth-ecosystem |
| **Core Four** | Warm outreach, free content, cold outreach, paid ads: Meta ($15/day, Purchase objective), Kly cold email, content queue/reels/Quora, free tools. | systems.ts |
| **Lead getters** | Customers (referrals), affiliates/partners, agencies/integrations (Shopify, Jobber, Zapier). | growth registry |

## Scaling Roadmap stage: honest placement
The roadmap uses headcount; its first three stages share team size 0-1 and are told apart by the main constraint:
- Stage 0 **Improvise**: "Nothing is happening yet. You don't have a business."
- Stage 1 **Monetize**: "Your business doesn't make money yet."
- Stage 2 **Advertise**: "Your new customers aren't consistent."
- Stage 3 Stabilize (1-4 people): "The workload exceeds your current resources."

**Komendly is at Stage 1, Monetize.** Evidence: 58 real sign-ups all time, one $9 unlock-pack buyer (25 Nov), 0 subscribers, cold email 0 real replies (MEMORY.md, scoreboard). It is past Improvise (a stranger paid once) but nothing sells repeatably. `businessStage()` computes this from live counts and moves to Advertise at 10+ paying customers with 3+ recurring.

## What NOT to do yet
- No scaling of ad spend beyond what the first month of one customer repays; no raising send caps.
- No new products, channels or integrations until the #1 constraint is fixed.
- No price changes or Stripe edits by automation; no hiring.
- No declaring A/B winners on tiny samples (needs minPerVariant, 95% probability best, 5+ conversions).
- No fake proof, invented scarcity, or promised leads/sales.
