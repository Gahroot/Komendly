# Customer intelligence (memory, self-learning, agency, simplicity)

All new behaviour is behind additive flags (`src/lib/growth/systems.ts`, AdsFeatureFlag, missing = OFF): `sys_customer_memory`, `sys_agency_ops`, `sys_simplicity`. No schema changes.

## 1. Customer memory
- `src/lib/customer-intel/memory.ts` (pure): `buildMemory`, `mergeFacts`, `formatPromptContext` (hard cap 1,200 chars), `parseMemory`. Each fact: key, value, `source`, `confidence`, `at`, `ref` (provenance). Customer edits (0.95) outrank scraped website facts (0.65).
- `server.ts`: `getCustomerMemory(db, workspaceId, brandId?)`, `refreshCustomerMemory`, `purgeCustomerMemory(db, workspaceId)`, `recordWeeklyLearned`. Stored as AdsEvent `customer_memory` (one row per workspace+brand, updated in place, latest wins) and `customer_learned` (weekly).
- Inputs come only from the workspace's own rows: brand profile (+ `userEdited`), trade tag, ads (downloaded / published / failed QC), `ad_approval` events. Performance is accepted as an input (Meta numbers are fetched live by the results job); it is not yet pulled automatically.
- **Wired**: `engine/src/jobs/plan.ts` appends `memoryPromptForRun()` to the existing untrusted-wrapped brand-history block. Returns "" when the flag is off or on any error. Memory is built by `refreshCustomerMemory` (no scheduler calls it yet: call it from a tick or the weekly job when you enable the flag; until then the prompt block is empty).
- Note: `BRAND_MEMORY_PLAN` tests showed planner-side memory can lower quality; this block is short and style-only, but A/B it before enabling widely.
- **Privacy**: reads and writes are keyed by `workspaceId` and double-checked on read; nothing is aggregated across customers; emails and phone numbers are stripped from stored text; no free-text from visitors beyond client change-request notes (500 chars, PII-stripped). **Deletion**: call `purgeCustomerMemory(db, workspaceId)` from account/data deletion flows (not auto-wired to deletion; AdsEvent rows with a workspace FK-less id are not cascaded).

## 2. Self-learning (`learning.ts`)
Compares kept vs not-kept ads for short headlines, offer-led and photo preference. Needs >= 6 signal ads, >= 2 per group, and a 20-point gap. Strength: weak (<12 ads, recorded but never put in prompts), moderate (>=12), strong (>=15 and a 35-point gap). Photo guidance is off until photo use is recorded per ad. `weeklyLearned` outputs measured lines only (kept/made, guidance with its evidence, Meta-measured leads, approvals); the weekly email adds them via `engine/src/customerintel/hook.ts` when the flag is on.

## 3. Agency
See `agency-gaps.md`. Page `/ads/agency`, API `/api/ads/agency/drop`, rules in `agency.ts`/`agency-server.ts`.

## 4. Simplicity
`next-action.ts` `nextBestAction(state)`: one step per state; `NextStepBanner` on `/ads/runs/<id>` and `/ads/team` when `sys_simplicity` is on. See `friction-map.md`.

## Engine image
`engine/Dockerfile` copies `src/lib/customer-intel/` (server.ts uses structural types only; no Next/Prisma imports). Not built locally with docker.
