# Growth ecosystem: how to update

Files: `prd.md` (the plan), `registry.json` (one object per opportunity, ids 1-100 fixed, 101+ discovered), `learnings.md` (append-only log).

## Updating the registry (every worker, when your item lands or changes)
1. Edit your items in `registry.json` only. Do not renumber or rename #1-100.
2. Set `status` to one of: `operational`, `experimenting`, `awaiting_prerequisite`, `suspended`, `unviable`. Rules in `prd.md` section 7: `operational` needs evidence of a live run.
3. Fill `evidence` with file paths and counts (not intentions), `code_refs` with real paths, `flag` with the `sys_<key>` (or `outbound`) that switches it. New outward-facing systems must register in `src/lib/growth/systems.ts` and default OFF.
4. Put anything only the owner can do in `owner_action` (it appears on the "Needs you" list). Clear it when done.
5. New idea: append a new object with the next id (121+), same fields, category from the existing set.
6. Run `npx vitest run src/lib/growth/__tests__/ecosystem.test.ts`; it validates the registry (ids, statuses, required fields).

## Adding a learning
Add to `learnings.md` using the format `## YYYY-MM-DD [EVIDENCE|ASSUMPTION] Title (#ids)`, a body, and `Source:` (required for EVIDENCE). From code use `appendLearningToFile` in `src/lib/growth/learnings-file.ts`. Never edit old entries; add a superseding one.

## Where it shows
- `/admin/ads/growth` (command center), reads these files at build/request time.
- `/api/cron/growth-review` weekly email (AdsFeatureFlag `growth_weekly_review`, default OFF).
