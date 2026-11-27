# Agency workflow audit (read from code, 26 Nov 2026)

Model today: **one AdsWorkspace per account, one `BrandProfile` per client website inside it** (`prisma BrandProfile @@unique(workspaceId, domain)`). "Clients" are brands, not workspaces. Agency plan = `agency` ($497, `billing-config.ts`): 50x Starter credits in one pool, `unlimitedBrands: 10`, `concurrent: 3`, `weeklyDrop`, 4 gift packs. No Agency subscriber has existed yet.

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| 1 | No single view of all clients (latest pack, approval, credits, next step). `/ads/brands` is a profile editor only | High | **Built**: `/ads/agency` (flag `sys_agency_ops`, Agency plan only) |
| 2 | No bulk "make this week's drop for all clients"; each client needs its own start | High | **Built**: `POST /api/ads/agency/drop` (<=10 clients, idempotent per brand per ISO week via AdsEvent `agency_drop`, pool pre-check, every run still via `startRun` so reserve/brand-limit/concurrency stay enforced) |
| 3 | Per-client credit view: the pool is one number; no per-client spend | High | **Built**: credits used in last 30 days per client + pool on the dashboard (from `AdRun.creditsCharged`) |
| 4 | Approval page (`/approve/<token>`) showed a "Make your own free ads" Komendly promo to the agency's client | High | **Fixed** for Agency-plan owners (hidden) |
| 5 | Approval status not derivable: link creation left no trace | Medium | **Built**: `/api/ads/approve-link` now records AdsEvent `approve_link_created` -> "Waiting for client" |
| 6 | `startRun` rate limit is 10 runs/user/hour; a 12-client agency can't drop all at once | Medium | Not changed (abuse control). Bulk is capped at 10; failures are reported per client. Raise for Agency only if wanted |
| 7 | Roles: `AdsWorkspaceMember.role` exists but only `owner` is created; no client-viewer/editor, no invites | Medium | Not built (needs product decision + auth surface). Interim: approve links are the client's read/approve channel |
| 8 | Export ZIP is named `<domain>-ads.zip` with `ad-01-<awareness>-<ratio>`; includes `ad-text.txt`. Branding mark is removable (`AdsBrandingSetting.removeBranding`) | Medium | Naming helper `exportFileName()` in `src/lib/customer-intel/agency.ts` (`<client>_<week>_<nn>-<ratio>.png`, no Komendly) is ready but **not wired** into the download route (touches paid download path; wire when wanted) |
| 9 | Per-client performance report: Meta connection is workspace-level (one ad account); results emails aren't split per client | Medium | Not built; `adsLive` per client shown from `MetaPublish` |
| 10 | Brand switching: no "active brand" concept; start/generate-more take a `brandProfileId` | Low | Dashboard links to each client's latest pack; no global switcher |
| 11 | Weekly drop (`engine/src/jobs/weekly.ts`) runs per workspace, not per brand, so agencies get one drop | Medium | Dashboard bulk action covers it manually; per-brand autopilot is a follow-up |
| 12 | Client logo/colours on exports: brand kit colours/logo feed generation; no separate client-branded export cover | Low | Not built |
