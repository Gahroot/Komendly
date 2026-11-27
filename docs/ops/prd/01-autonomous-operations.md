# 1. Autonomous operational management

**Requirement.** Operations run on their own and are switchable: every part has a kill switch, a heartbeat, and no owner step except P1 or an out-of-bounds action.

**Built (part 1).** One engine loop (`engine/src/ops/loop.ts`, every 10 min, single replica, started in `engine/src/main.ts`) runs support ticket sync, infra watch and incident engine, each behind its own flag in `src/lib/growth/systems.ts`: `sys_support_ops`, `sys_incidents`, `sys_infra_watch` (all default OFF; missing row = OFF). Each writes its `system:<key>` heartbeat via `recordSystemRun`, so the existing monitor alerts if a system stalls or fails. The engine Dockerfile copies `src/lib/ops/`. Areas: [3 support](03-support.md), [5 infrastructure](05-infrastructure.md), [11 incidents](11-incidents.md).

**Rollout (owner, when ready).** Turn on `sys_support_ops` and `sys_infra_watch`, watch `/admin/ads/support` and `/admin/ads/incidents` for a few days, then `sys_incidents`. Deploy web first (cron + pages), then the engine.

**Acceptance.** Flags OFF = no writes. `npx tsc --noEmit -p .`, `cd engine && npm run typecheck`, `npx vitest run src/lib/ops` pass.
