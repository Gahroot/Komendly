# 17. Executive communication
Outcome: ONE short Monday owner brief, only when something changed or a decision is needed.
Acceptance: at most 15 lines, plain English; first-10 line is context and never triggers a send alone; revenue/optimiser/ops digests are absorbed when `sys_exec_brief` is ON (`digest-dedupe.ts`); one send per ISO week (`digest_sent`).
Status: met in code; sender is `execTick` in `engine/src/exec/coordinate.ts`; no email has been sent yet (flags OFF). Code: `brief.ts`, `digest-dedupe.ts`.
