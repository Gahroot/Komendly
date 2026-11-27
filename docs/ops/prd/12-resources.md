# 12. Resource and capacity

Owner: ops control worker (part 3).

Know which finite resource runs out first.

**Measurable outcomes:** the ops page shows queue depth, AI calls by system and the first binding constraint.

**Acceptance:** `capacityModel` is pure and tested; ops page renders it.

**Honest status:** the model's inputs are assumptions (e.g. 600 s per pack, 5000 AI calls/week) until measured values replace them (delivery_econ, `ai_call` events). Output is labelled as assumption-based.
