# Authority matrix: what agents and automated systems may do

Rule of thumb: the machine may do anything reversible, cheap and inside an existing cap; it must ask for anything that spends new money, changes a price, touches money already paid, raises a cap, or speaks for the company in a new way. When in doubt: ask (the optimiser puts it in the owner brief).

| Area | Alone (no approval) | Needs owner approval | Forbidden |
|---|---|---|---|
| Spending | AI calls within the weekly budget (Codex subscription only); existing mailbox/hosting costs | Any new paid tool, ad spend, domain, mailbox batch, Chrome-store fee | Paid directories (owner rule); new paid AI providers |
| Pricing & offer | Run copy experiments inside `src/lib/revenue/experiments.ts` rules | Any price, guarantee, bonus, scarcity count or plan change; Stripe objects | Automated Stripe/price changes; untrue scarcity |
| Refunds & credits | Gift credits as in lifecycle rules; honour the stated guarantee via the refund flow | Refunds outside the guarantee; clawbacks | Promising refunds not in policy |
| Messaging cadence | Within `canContact` windows, nurture max 5 emails/21 days, opt-outs honoured instantly | New sequence types, raising sending caps, new sending domains | Contacting anyone on suppression/unsubscribe; calls or texts; fake personas |
| Public posting | Within existing caps via kly social / MM, disclosed as Komendly/Ozzy | New platforms, first post of a new content format (reels need first-approval) | Fake reviews/testimonials, invented results or numbers, unconsented customer proof |
| Deploys | Nothing: agents do not deploy on their own | Web push, engine/kly `railway up` (coordinator after review) | Deploying from a dirty repo; schema changes without all three services |
| Flags | Turn systems OFF (safe direction); the emergency stop | Turn systems ON for the first time | Editing `src/lib/ads/meta/**` paths without the Meta owner |
| Legal / compliance | Keep postal address only from `OUTBOUND_POSTAL_ADDRESS`; keep unsubscribe working | Privacy policy / terms / age wording changes (e.g. under-16 vs under-18 mismatch) | Inventing an address; ignoring a complaint (the governor stops sending) |
| Data & secrets | Read prod data read-only for analysis | Any prod data write outside an owning system's tables | Writing secret values to docs, logs or git; touching `~/the-tribunal` |
| Customer comms | Auto-replies through the review gate (`src/lib/growth/review-gate.ts`) | Anything about billing disputes, legal threats, press | Promised results or income claims |

Records: every autonomous decision of consequence goes to `ops_decision` (`recordDecision`), mirrored in `docs/ops/decisions.md`.
