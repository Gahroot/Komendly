# 2. Business-wide coordination

Owner: ops control worker (part 3).

Detect and resolve conflicts between autonomous systems before they hurt customers or each other.

**Measurable outcomes:** zero contacts to the same person within 3 days across channels (contact guard); queue wait for paying packs never worsened by reels; weekly AI calls within budget; no two experiments on one surface.

**Acceptance:** `canContact`, `detectContention`, `aiBudgetThrottle`, `conflictingExperiments`, `priorityWeights` are pure and tested; proposals show on `/admin/ads/ops`; every decision is logged as `ops_decision`.

**Verification:** `npx vitest run src/lib/ops/control`.

**Honest status:** the contact guard is NOT yet wired into the Kly sender or lifecycle senders (Kly image whitelists shared files; wiring needs a Kly deploy). `ai_call` events do not exist yet, so AI budget shows 'not tracked yet' until a system emits them. Proposals only: nothing here switches flags.
