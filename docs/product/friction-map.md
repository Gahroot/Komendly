# Customer journey friction map (from code, 26 Nov 2026)

Counts = things the customer must decide, type or click before the step is done.

| Step | Where | Decisions / fields / clicks | Friction | Action |
|------|-------|------------------------------|----------|--------|
| 1 Free-ads form | `free-ads-url-form.tsx` | 1 field (URL), 1 click; +1 trade select on generic `/free-ads` | Already minimal; `?url=` prefill exists | Keep |
| 2 Sign-up | `ads-auth-form.tsx` | 3 fields (name, email, password) + 1 click | **Name was required**, yet the API treats it optional | **Done**: Name optional, plain error fallback |
| 3 Confirm / extraction review | `extraction-review.tsx` | review + goal (auto default) + 1 click | Goal defaults to `auto` | Keep; next step banner points here |
| 4 Pack ready, unlock/download | run screen | pick ads, download (1-2 clicks); upsell after | Customer can finish a pack and not know what to do | **Done**: "Your next step" banner on `/ads/runs/<id>` (flag `sys_simplicity`) |
| 5 Upsell / checkout | pricing, Stripe | plan choice (4 for sale), Stripe form | Plan choice is the main decision | Banner names one step ("See plans") only after download |
| 6 Meta connect | `/ads/team` | OAuth + choose ad account + Page | Account/Page pickers | Banner shows "Connect Meta" as the one step; pickers already default when one option |
| 7 Ads live | `team-setup.tsx` | monthly budget (default `SUGGESTED_MONTHLY_LIMIT`), ZIPs, lead email (prefilled), privacy URL | 4 fields, 2 prefilled | **Candidate**: derive ZIPs from the brand's locations (customer memory `location:*` facts) |
| 8 Weekly | `weekly.ts` | 0 (automatic) | Email asked "upload results" | Adds measured "what we learned" paragraph when `sys_customer_memory` is on |

## Prioritised removals
1. Required Name at sign-up (done).
2. No guidance after a pack finishes (done: one next step, `src/lib/customer-intel/next-action.ts`).
3. Prefill ZIPs from memory locations (next; needs brand locations extraction to be persisted).
4. Show plain-language error copy on auth fallback (done); sweep other generic "Something went wrong" strings (open).
5. Merge goal picker into auto everywhere (already default).

Nothing here promises results; banners say what to do, not what it will earn.
