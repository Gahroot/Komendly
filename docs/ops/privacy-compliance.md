# Privacy & compliance (engineering view, not legal advice)

## Data inventory
| Data | Where | Basis / note |
|---|---|---|
| Account: email, name, password hash | `User` | contract |
| Sessions, API keys (`kmd_`), OAuth grants | `Session`, `AgentApiKey`, `OAuthGrant` | contract |
| Payments: Stripe customer/payment ids, ledger | `CreditPurchase`, `CreditLedger`, `AdsRefund`, workspace fields | legal obligation: **retained** on purge |
| Product events (may carry email/name/ip in `props`) | `AdsEvent` | legitimate interest; scrubbed on purge |
| Abuse fingerprints (hashed IP/device/email) | `AdsTrialClaim`, `AbuseFlag`, `FreeToolJob.ipHash` | legitimate interest |
| Customer content: reviews, videos, ads, brand profiles, Studio chats | `Review`, `GeneratedVideo`, `Ad*`, `BrandProfile`, `Studio*` | contract; deleted on request with `--delete-content` |
| Meta token (encrypted), ad account ids, leads (`MetaLead`) | `MetaConnection`, `MetaLead` | customer-owned lead data |
| Cold outreach: scraped business contacts, send log, replies | `KlyPlace`, `OutboundLead`, `OutboundSend`, `OutboundVoiceEvent`, `OutboundSuppression` | legitimate interest B2B; suppression is permanent |
| Public submissions (makeover, nominate, vote, consent, ad-watch) | hub tables / `AdsEvent` | consent; opt-out links signed |

## Deletion path
`scripts/privacy-purge-user.ts --email x` is a **dry run** (counts per table). `--apply --confirm x` anonymises; `--delete-content` also removes testimonial content. Take `pg_dump` first and expire that dump under the retention policy. Plan lives in `src/lib/ops/security/privacy-purge.ts` (tested). It also adds the address to `OutboundSuppression`. There is **no self-serve delete-account** yet: requests go to nolan@komendly.com.
Not covered by the script: S3 objects (`S3_BUCKET` keys of runs/assets), FAL/vendor-hosted media, Stripe customer deletion, Meta-side data, Resend logs. Do those by hand.

## Suppression / unsubscribe coverage
Enforced by `src/lib/ops/__tests__/email-guard.test.ts` (every file calling `sendAdsMail`/`sendMail` must be classified; marketing senders must reference unsubscribe + suppression; engine lifecycle must attach `List-Unsubscribe`; cold email must use `OUTBOUND_POSTAL_ADDRESS`). Known gap: studio invite (S-09). Note `kly/src/sender.ts` falls back to `DEFAULT_POSTAL_ADDRESS` in `src/lib/ads/outbound/copy.ts` when the env is unset; set the env in Railway so the address is intentional.

## Privacy policy drift (`src/app/privacy/page.tsx` vs inventory)
Policy covers: account, payment, Meta token, usage/IP/UA, cookies (kmd_aid/exp/ft/lt, fbp/fbc), Meta CAPI hashed data, processors, no sale.
**Drift to fix (or have counsel review):**
1. No mention of cold outreach data: business contacts collected from public sources, how they were found, the unsubscribe right, retention. (Highest risk.)
2. No mention of public submissions (makeover/nominate/vote/showcase) and the signed opt-out.
3. No mention of customer ad-performance and lead data (`MetaLead`) held on the customer's behalf (controller/processor split).
4. No stated retention periods for `AdsEvent`, outbound logs, S3 media; no automatic expiry exists in code either.
5. Policy cookie list should include `kmd_vid` (offer experiments) if still set.
6. No self-serve deletion; policy says contact us: matches practice, but add the purge SLA.
