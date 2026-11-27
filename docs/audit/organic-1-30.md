# Organic ecosystem audit, opportunities 1-30 (27 Nov 2026)

Method: registry vs code vs live prod (read-only SELECTs, `railway variables` names only, curl). "Met" = operational with prod outputs; "Partial" = implemented/segment live but no downstream result, or needs a switch; "Not" = not built or gated.
Live facts: flags ON = outbound, kly_partner_segments, sys_new_business, sys_ad_check; kly env lacks KLY_SIGNALS_ENABLED and KLY_INTENT_ENABLED. Prod: KlyPlace adlib 2,832 (2,804 used), `signal:*` 0; OutboundLead adlib 1,326 (60 real sends, 1 click, 1 reply, 0 sign-ups, 0 paid); lead_signal events 669 (stale_creative 445, single_ad 169, creative_gap 55; all from one 26 Nov import); 1,351 leads carry signals, 181 seasonal, 0 real sends to signal/seasonal leads; intent_opportunity 0; partner_* events 0; system:new_business 198 runs / 0 outputs. Agency arms: marketing agencies 6 sends, web design agencies 5; other partner niches 0 leads. Zero sign-ups from any item in this slice.

| # | Item | Status | Evidence | Fix applied | Remaining owner / prereq |
|---|---|---|---|---|---|
| 1 | Ad Library prospecting | **Met** (operational, no conversions yet) | counts above; kly/src/adlib.ts | registry counts corrected | Throttle between pulls; adlib niche expansion (#120) |
| 2 | Stale creative | Partial | 445 lead_signal; kly/src/signals.ts, sender.ts signalCopy | registry: experimenting, honest | Needs first signal-led sends to prove opener |
| 3 | Single-ad advertisers | Partial | 169 lead_signal single_ad | registry corrected (previously said "no single-ad targeting") | same |
| 4 | Google Ads advertisers | Not (gated) | kly/src/gated-sources.ts (ToS bars automation) | evidence rewritten | Paid licensed provider decision |
| 5 | New business | Partial | sys_new_business ON, 198 runs, 0 outputs, silent alert | registry: built-but-zero-output | Engineer to diagnose CT filters/crt.sh (checklist 4) |
| 6 | New website | Partial | same + site-signals RDAP behind KLY_SIGNALS_ENABLED | registry | Set KLY_SIGNALS_ENABLED=1 |
| 7 | New Shopify store | Partial (not activated) | site-signals.ts new_shopify; env unset, 0 signal places | registry (was wrongly "not built") | KLY_SIGNALS_ENABLED=1 |
| 8 | New product launch | Partial (not activated) | only new_shopify / "just launched" phrase; no launch feed | registry | env switch; no product-launch feed exists |
| 9 | Marketing hiring signals | Partial (not activated) | intent-discover jobs RSS; env unset; 0 events | registry (was "not built") | KLY_INTENT_ENABLED=1, INTENT_AGENT_TOKEN |
| 10 | Seasonal | Partial | seasonal.ts; 181 tagged leads; 0 sends | registry (was "content only") | none; wait for sends |
| 11 | Crowdfunding | Not (gated) | gated-sources.ts | registry | Licensed/CC dataset |
| 12 | Business expansion | Partial (not activated) | grand_opening/new_location in site-signals | registry | KLY_SIGNALS_ENABLED=1 |
| 13 | Purchase-intent monitoring | Partial (not activated) | intent-discover, /admin/ads/intent, /api/intent/queue; 0 events; Reddit skipped by robots | registry (was "nothing monitors") | KLY_INTENT_ENABLED=1; humans/MM post replies |
| 14 | Creative gap | Partial | 55 lead_signal creative_gap; Ad Check 4 runs, silent since 22 Nov | registry | first gap-led sends |
| 15 | Website redesign | Partial (not activated) | site_refresh, weak signal | registry | KLY_SIGNALS_ENABLED=1 |
| 16 | Marketing agencies | Partial | flag ON; 6 real sends, 0 sign-ups, 0 partner applications | registry; verified compliance (below) | await results |
| 17 | Web design agencies | Partial | 5 real sends | registry | await results |
| 18 | Media buyers | Partial | arm active, 0 leads | registry | thin OSM source |
| 19 | Social media managers | Partial | arm active, 0 leads | registry | same |
| 20 | SEO agencies | Partial | arm active, 0 leads | registry | same |
| 21 | GoHighLevel agencies | Partial | niche added this audit | **kly/src/targets.ts** new niche | redeploy kly |
| 22 | Shopify dev agencies | Partial | arm active, 0 leads | registry | thin source |
| 23 | Branding agencies | Partial | arm active, 0 leads | registry | thin source |
| 24 | Business coaches | Partial | niche added | **targets.ts** | redeploy kly |
| 25 | Marketing educators | Not | no channel | registry reason | lead source + pitch decision |
| 26 | Freelancer marketplaces | Not | no channel | registry reason | owner seller account / ID |
| 27 | White-label/reseller | Not | PARTNER_TERMS only | registry | pricing/branding decision |
| 28 | Franchise | Not | nothing built | registry (not unviable: public lists) | lead source + offer |
| 29 | VA agencies | Partial | niche added | **targets.ts** | redeploy kly |
| 30 | Embedded partner experiences | Not/Partial | /free-ads/from/[code] 307, gift pages; no embed | registry | depends on #27 |

**Count: Met 1, Partial 22, Not 7** (4, 11, 25, 26, 27, 28, 30). Zero items have shown a sign-up or payment.

## Segments, compliance, send-blocking (#16-24, 29)
- Copy: kly/src/partner-segments.ts PARTNER_COPY (+ agency-* in src/lib/ads/outbound/copy.ts); kly/test/partner-segments.test.ts validates every variant with `checkVariant` and `checkArmContent` (one link, 20-90 words, no result claims). Agency partner variants state the real program terms (30% for 12 months = PARTNER_TERMS; /partners returns 200). Footer postal address only from OUTBOUND_POSTAL_ADDRESS; unsubscribe unchanged.
- Gating: arms only exist/active while AdsFeatureFlag `kly_partner_segments` is ON (syncPartnerArms retires them when off); sending additionally needs outbound flag, KlySettings.enabled, OUTBOUND_ENABLED=1, and the governor. **Finding: the flag is already ON in prod, so the segments are not blocked now; they are live** (marketing/web-design agencies have real sends). Turn off per checklist 3 if undesired.
- Weakness: OSM name search is thin for small agencies; partner niches have produced 0 leads.

## Additional opportunities #101+
Registry has ids 101-120 = 20 items (>=15): Jobber, checkout recovery, win-back, agent distribution, API docs, lead alerts, Meta results, Meta paid ads, arm strategist, mailbox scaling, places sources, roofer page, auto-responder, $9 unlock, done-for-you offer, Ozzy Lab, testimonial SEO, scoreboard email, blog engine, adlib niche expansion. Their statuses were outside this slice and not re-audited (note: flags sys_lead_alerts and sys_meta_results are ON in prod although registry #106/#107 say OFF; heartbeat shows meta_results 109 runs / 0 outputs; the owner of 101-120 should correct).

## Not met / cannot verify
- Whether kly redeploy included KLY signal copy: deploy acfb7fb1 SUCCESS 26 Nov 21:28 EST post-dates commit 534b1d3, but not confirmed from the image.
- Discovery of additional opportunities and owner visibility are outside this slice.
- Pre-existing failures not touched: src/lib/ads/__tests__/funnel.test.ts (sys_newsletter vs campaign), tsc errors in src/lib/exec/strategic-cycle.ts.
