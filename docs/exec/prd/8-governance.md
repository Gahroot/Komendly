# 8. Governance

**Code:** `src/lib/exec/governance.ts`. Authority matrix (autonomous / needs approval / forbidden) is code, pinned by a fingerprint.

- **Self-check fails closed** on a missing/changed matrix, a broken audit chain or an active ops emergency stop; the cycle halts.
- **Owner overrides** (`exec_override`, owner-written only; agents cannot write it): pause_all, resume_all, pause_objective, resume_objective, redirect, veto. Read before every cycle.
- **Audit:** every exec write appends a hash-chained `exec_audit` record; `verifyAuditChain` finds tampering.
- The executive layer cannot raise its own authority, change prices, caps, billing or legal text. Changing the matrix needs a human to edit it and re-pin `EXPECTED_MATRIX_FINGERPRINT`.
