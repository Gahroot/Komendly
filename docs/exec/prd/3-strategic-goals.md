# 3. Strategic goal generation

**Code:** `src/lib/exec/objectives.ts`. **Events:** `exec_objective` (spec, approval) + append-only `exec_objective_status`.

## Hard rule: hold_and_measure
When sample sizes are below threshold, build and experiment proposals are rejected and a deterministic `hold_and_measure` objective (spend 0, reversible) is emitted. 'Keep operating and gather evidence' is a first-class objective. Build is allowed only for the primary constraint with measured evidence (30+) and must cite it.

## Validator rejects
implementation details; forbidden areas (prices, caps, legal, governance); no evidence, acceptance, verification or reassessment condition; stage-inappropriate strategy; unstated or unauthorised spend; build without a demonstrated constraint; only-assumed evidence for action types; duplicates of open objectives, experiments and the hypothesis ledger. At most 3 open objectives.

## Approval
Auto-approved only for reversible, zero-spend hold_and_measure / evidence_gathering / experiment objectives whose actions are inside the optimiser allow-list. Everything else is `needs_owner`.

## Handoff
`loadActiveObjectives(db)` and `markObjective(db,id,status,evidence)` for the execution coordinator.
