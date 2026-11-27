# 11. Cross-departmental alignment
Outcome: optimiser, ops, revenue, product-intel and Kly work toward the one current constraint, not separate agendas.
Acceptance: coordinator and strategy engine read the same constraint (17-constraint diagnosis via `gather.ts`) and stage (`stageIndexOf`); objectives route to existing systems only; conflicting objectives flagged.
Status: partial: shared reader and stage fixed in this audit; other systems consume objectives only via dispatches (optimizer_run_request), not yet reading objectives directly.
Code: `gather.ts`, `load.ts`, `validation-mode.ts`, `coordinator.ts` (`conflictingObjectives`).
