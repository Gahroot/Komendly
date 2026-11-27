# 1. Business understanding (whole-business context)

**Code:** `src/lib/exec/context.ts` (`buildBusinessContext`), engine `engine/src/exec/strategy.ts` (`gather`, `storeDailyContext`). **Event:** `exec_context` (daily + each weekly cycle).

## What it does
One pure builder assembles products, money model, segments, channels with real activity and outcomes, revenue/customers (internal/test accounts already excluded by `revenue_snapshot`), economics, outcomes, competitive position, finance/ops health, spend authority, commitments and decision/experiment history into one object.

## Evidence grading
Every section carries `level`: measured | inferred | assumed, and `source`. A missing input becomes `data: null`, level `assumed`, never a guess. The designed money model is graded `assumed` because no step-to-step conversion is proven. `evidenceSummary` counts sections per level; `mode` is `commercial_validation` at stage 0.

## Limits
- Competitive data (`docs/product/competitive.json`) is not in the engine image; it is null until the product worker emits an AdsEvent.
- Reply classification (`reply_classified`) is read if present; otherwise customerVoice is null.
- Products/segments/hard rules are a static registry in `context.ts`; update it when the offer changes.
