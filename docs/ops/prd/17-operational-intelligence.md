# 17. Operational intelligence

Owner: ops control worker (part 3).

One screen that answers: is the business functioning; are customers getting outcomes; is acquisition producing activity; is it profitable; what consumes resources; what threatens performance; the #1 constraint; what was resolved autonomously; what needs the owner.

**Acceptance:** `/admin/ads/ops` shows each of the nine from existing snapshots (revenue_snapshot, finance_snapshot, funnel_check, infra_check, incident, reliability_snapshot, optimizer events) and a graceful 'Not available yet' when a snapshot has not been written. No notifications from the page.

**Honest status:** snapshot event names for incident / infra_check are the agreed names; if a worker uses a different name that tile shows 'not available' until aligned. Page is untested at runtime (typechecked only).
