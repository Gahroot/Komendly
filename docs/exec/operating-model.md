# Executive layer operating model
**Phase:** commercial validation. Default decision: `hold_and_measure` (keep channels running, gather evidence). That is a valid outcome; development goals are never manufactured.

**Weekly (engine, `sys_exec_strategy`, `engine/src/exec/strategy.ts` -> `src/lib/exec/cycle.ts`):** governance self-check (fail closed) -> owner overrides -> idempotent per ISO week -> business context -> stage -> 17-constraint diagnosis -> AI proposes objectives (max 3), rules decide -> decisions and reviews of past decisions -> handoff. Below evidence thresholds only hold_and_measure/evidence_gathering is accepted; zero-spend reversible ones are auto-approved, builds/spend need the owner. Only this cycle creates objectives.

**Daily (`sys_exec_coordinator`, `engine/src/exec/coordinate.ts` -> `strategic-cycle.ts`):** dispatches approved objectives' allow-listed reversible actions, moves due checkpoints to verifying, closes verified objectives with measured outcome, writes performance, allocation (always $0), risks, org findings, weekly opportunity pass.

**Brief (`sys_exec_brief`):** one Monday email after 12:00 UTC, only if something changed or a decision is needed.

**Authority:** `governance.ts` matrix (autonomous / needs approval / forbidden), fingerprint-pinned; mismatch halts cycles. Forbidden: prices, caps, billing, legal text, editing governance, writing `exec_override`, messaging customers directly, disabling the emergency stop. Only the owner can change governance.

**Owner controls:** AdsEvent `exec_override` kinds pause_all, resume_all, pause_objective, resume_objective, veto, redirect; ops emergency stop also halts. Everything is append-only and auditable (hash-chained `exec_audit`).

**Build requests:** objective type build -> `build_request` AdsEvent (status pending). Nothing executes code. The human/coordinator runs `npx tsx scripts/exec-build-queue.ts` to get paste-ready worker briefs, then `--start <id>` / `--done <id> "result"`.

**Reading the page** `/admin/ads/executive`: banner (stage/mode and evidence gaps), First-10 card, Needs you (approve/reject), objectives with phase and owner, allocation, risks, org findings. **Brief:** what changed, what was learned, decisions, next, evidence still missing.

**Dry run:** `set -a; . ./.env.local; set +a; npx tsx scripts/exec-dry-run.ts` (read-only proxy; writes nothing).
