# Activation checklist, opportunities 1-30 (audit 27 Nov 2026)

Nothing here was run by the audit. Verified live: `kly_partner_segments`, `outbound`, `sys_new_business` flags are ON; `KLY_SIGNALS_ENABLED` and `KLY_INTENT_ENABLED` are NOT set on kly (railway variables, names only).

## 1. Site signals (#6, #7, #8, #12, #15): new domain, new Shopify store, grand opening, redesign
Read-only public fetches (robots.txt obeyed, 1.5-2 s gap), never sends by itself; hits become KlyPlace `signal:*` rows that go through the normal gates.
```
railway variables --service kly --set KLY_SIGNALS_ENABLED=1
```
Verify after 2-4 h: `select source,count(*) from "KlyPlace" where source like 'signal:%' group by 1;` and `AdsEvent` names `signal_scan`, `lead_signal`.

## 2. Intent opportunities (#9, #13)
Queues public posts asking for ad help (HN Algolia, jobs RSS). Posts nothing.
```
railway variables --service kly --set KLY_INTENT_ENABLED=1
TOKEN=$(openssl rand -hex 24)   # then add INTENT_AGENT_TOKEN to Vercel prod (vercel env add INTENT_AGENT_TOKEN production) and to Media Master
```
Verify: `/admin/ads/intent` lists rows; `select count(*) from "AdsEvent" where name='intent_opportunity';`

## 3. Deploy kly (new partner niches #21, #24, #29)
`kly/src/targets.ts` now adds `gohighlevel agencies`, `virtual assistant agencies`, `business coaches` to PARTNER_NICHES. They are seeded as segment arms because flag `kly_partner_segments` is already ON, so deploying starts discovery for them (sends still need outbound + KlySettings.enabled + OUTBOUND_ENABLED, all on, plus the governor). Deploy from a clean worktree of the commit: `railway up --service kly --detach`.
To keep them dark instead: turn the flag off first (`update "AdsFeatureFlag" set enabled=false where key='kly_partner_segments'`); partner arms retire on the next tick.

## 4. #5/#6 new_business produces nothing (diagnose, no switch)
EngineHeartbeat `system:new_business`: 198 runs, 0 outputs, silent alert. Check: `railway logs --service kly | grep "kly new_business"`; likely crt.sh availability or the strict filters (first cert <=10 days, US postal address on site). Needs an engineer decision to loosen.

## 5. Owner-only (not switches)
- #4 Google Ads Transparency: paid licensed provider, otherwise excluded.
- #26 Freelance marketplaces: owner's seller account + ID verification.
- #25, #28: lead-source decision. #27: white-label pricing decision.
