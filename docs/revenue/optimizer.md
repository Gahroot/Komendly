# Autonomous optimiser

Weekly business loop. Engine job `engine/src/optimizer/run.ts`; pure logic in `src/lib/optimizer/` (unit-tested).
Flags (AdsFeatureFlag, missing = OFF): `sys_optimizer` (the job and kill switch), `sys_optimizer_digest` (owner email).
AI only through the Codex subscription provider (`createProvider("codex")`). No new vendors.

## The loop
1. **Gather**: latest `revenue_snapshot`, sign-ups/payments by first touch per growth system, registry/flag state, Kly arms, reel rankings, `offer_proposal`, `customer_success_finding`, experiments, hypothesis ledger.
2. **Diagnose (code, no AI)**: stage by paying customers; the one constraint = largest funnel shortfall vs benchmark (steps with < 30 upstream people are ignored; with a tiny top of funnel the constraint is "volume"); evidence tagging (measured / inferred / assumed); paid-scale gate (payback < 30d and LTGP:CAC >= 3, measured only).
3. **Decide (Codex, strict JSON)**: max 5 actions from the allow-list, Hormozi principles in the prompt (one constraint, More-Better-New, Rule of 100, client-financed acquisition, give-before-ask, value equation, small-sample caution).
4. **Validate + execute**: each action is checked by code (`validateActions`) and run in its own try/catch.
5. **Learn**: `optimizer_learning` events (read by `src/lib/optimizer/knowledge.ts`). Markdown form of an entry: `learningMarkdown()` in run.ts (repo format, `formatLearning`); the engine cannot write the repo, so an operator appends to `docs/revenue/learnings.md` with `src/lib/growth/learnings-file.ts`.
6. **Report**: plain-English digest to nolan@prestyj.com (override `OPTIMIZER_DIGEST_TO`) if `sys_optimizer_digest` is ON.

## Allow-list (everything else is rejected and logged)
| type | runs when | undo |
|---|---|---|
| `conclude_experiment` | experiment running, every variant >= 100 observations, >= 10 conversions total, winner = leading variant | define a new experiment |
| `start_experiment` | validated `offer_proposal`, < 1 running experiment on that surface, hypothesis not in the failed ledger | conclude/pause in /admin/ads/revenue |
| `retire_arm` | active Kly arm, >= 200 sends, mean + 2sd below the leader, >= 2 arms stay active | set `KlyArm.status` back to `active` |
| `shift_emphasis` | surface `reels` or `content_queue` | newer `optimizer_emphasis` event with empty lists |
| `suspend_system` | `decideChannel` says suspend (500+ actions, 0 sign-ups) and the flag is ON | switch the flag back ON |
| `owner_decision` | always | n/a, adds `optimizer_owner_decision` (status open) to the needs-you list |

Never automatic: price/billing, new spend, new guarantees, customer-facing copy that is not pre-approved, deleting data, raising caps, un-pausing governor stops. These can only appear as `owner_decision`.
`optimizer_emphasis` is a signal row: the reels/content-queue pickers read the latest one when wired to it (follow-up; today the digest reports it and nothing else changes).

## Safety
- Budget: `OPTIMIZER_MAX_CALLS` (default 12) Codex calls per cycle; one retry on malformed output, then fail closed with zero actions.
- Idempotent: one OK cycle per ISO week. Run now: insert AdsEvent `optimizer_run_request` (forced). A dry run counts as the week's run, so force a run after turning dry run off.
- `OPTIMIZER_DRY_RUN=1`: actions are validated and logged as `DRY RUN: would ...`, nothing changes.
- 3 consecutive failed cycles: the job switches `sys_optimizer` OFF, writes `optimizer_paused`, emails `ADS_ALERT_EMAIL`.
- Hypothesis ledger (`optimizer_ledger`, hash of surface + hypothesis): failed/suspended ideas are not retried for 60 days, or sooner if `conditionsKey` changes.

## Reading and undoing actions
AdsEvent `optimizer_action` props: `type, reason, evidence, evidence_level, sample_size, params, reversible, ok, result, week, dryRun` (rejected ideas have `rejected: true`). `optimizer_cycle` = one row per cycle (ok/error, calls). The `reversible` field says exactly how to undo.

## Knowledge base
`getRelevantKnowledge(db, topic)` (`src/lib/optimizer/knowledge.ts`) merges findings from `optimizer_learning`, `customer_success_finding`, `offer_proposal`, `reel_learning`, `growth_learning` into `{source, claim, level, date, sampleSize}`, de-duplicates and marks conflicting claims `contested`. Wired into `kly/src/strategist.ts` (prompt gets a "Known findings" block; failure = empty). Other agents: import it and use `knowledgeForPrompt()`.

## Assumptions to confirm when rev-core lands
- `src/lib/revenue/experiments.ts` is loaded lazily (no Dockerfile COPY yet): until the engine image copies it, experiment actions fail per-action with "experiments module unavailable". Add `COPY src/lib/revenue/experiments.ts ...` (plus its imports) once stable.
- Experiment keys come from AdsEvent `experiment_defined` (props.key) and experiments this job started; result shape is read tolerantly in `toExperimentView`.
- `revenue_snapshot` is read tolerantly by `parseSnapshot` (funnel steps named visit/signup/free_ad/checkout/paid; constraints; economics with confidence labels).
