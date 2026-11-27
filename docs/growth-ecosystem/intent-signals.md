# Intent signals (Kly)

Pure detectors + wiring. No schema change. Signals live in `OutboundLead.qualification.signals` (JSON) and, for adlib advertisers, as `AdsEvent` rows named `lead_signal` (`props: {domain, release, signals}`), written by `scripts/import-adlib.ts` and read back by `adlibSource` (`kly/src/adlib.ts`). Opportunities from public posts are queued, never posted.

| Signal | Detector | Evidence / rule |
|---|---|---|
| `stale_creative` | `signals.ts detectStaleCreative` | oldest active ad > 45 days AND (newest ad start > 30 days, if the pull records `newest_ad_start`, or exactly 1 active ad). Several ads with no newest date = unknown = no signal |
| `single_ad` | `detectSingleAd` | active_ads 1-2 |
| `creative_gap` | `detectCreativeGap` | sampled ad text lacks offer / proof / CTA; "no video" only if a `formats` array exists. Describes only the sample ("the ad I saw") |
| `new_website` | `site-signals.ts` | RDAP registration within 120 days (rdap.org) |
| `new_shopify_store` | `site-signals.ts` | public `/products.json`, partial page, products created within 90 days |
| `grand_opening` / `new_location` / `site_refresh` | `site-signals.ts` | quoted homepage phrase; sitemap `lastmod` burst. Own-site fetches obey robots.txt |
| `seasonal` | `seasonal.ts` | calendar window (N weeks before a peak until its end) per niche; carries `hook`, no claim about the lead |
| crt.sh new certs | existing `new-business.ts` (growth system `new_business`) | unchanged |

**Prioritisation:** `applySignalBoost` adds up to +20 to the stored lead score (never to 0-scored or below-minimum leads; the minimum is checked on the raw qualifier score). `loop.ts adlibSegment` ranks niches in a seasonal window first.

**Copy:** `sender.ts signalCopy` -> `OutboundCopyContext.signalLine` (one evidence-backed sentence, e.g. "Your longest-running Facebook ad has been live since Jun 2024.") else `seasonalHook`; `copy.ts` prepends it to step-1 bodies only, and the usual compliance gate (one link, 20-90 words) still applies. Fixed growth-system copy is untouched. Sending caps, governor, bounce/complaint and the 2,000-no-reply stop are unchanged.

**Attribution:** quoted signal is in the lead's `qualification.signals`; the `lead_signal` AdsEvent has the domain and release; join to `signed_up` via lead/first-touch as for other adlib leads.

## Intent opportunities (item 5)
`npx tsx scripts/intent-discover.ts [--dry] [--file data/intent-queue.json] [--events]` (run from `kly/`). Sources: Reddit listing JSON (forhire, smallbusiness, Entrepreneur, marketing, facebookads, ecommerce), HN Algolia, a marketing-jobs RSS. Sellers (`[FOR HIRE]`) score 0. Each queue entry: url, text, `intentScore`, `matched`, `replyDraft` (answers first, no link, discloses affiliation). `--events` also writes `AdsEvent intent_opportunity`. A human or Media Master posts; the script posts nothing. Check Reddit's current API terms/rate limits before scheduling it; it makes ~10 requests with a 2 s gap.

## Not implemented (`gated-sources.ts`, status `awaiting_prerequisite`)
- **Google Ads Transparency Center:** JS app, no API, Google ToS bars automated access. Needs a licensed provider.
- **Kickstarter / Indiegogo:** no public listing API; ToS bar scraping; creators are mostly individuals. Option: Webrobots Kickstarter datasets joined to own sites.
- **New Google Business listings:** no free dated source in the repo (Overture/FSQ/OSM lack creation dates).

## Scheduling (Kly loop, default OFF)
`kly/src/signal-tick.ts`, called from `loop.ts` step "signals". Both switches are env on the Kly service (unset = off):
- `KLY_SIGNALS_ENABLED=1`: every 2 h scans up to 8 unused Overture places (not rescanned for 60 days; marker `AdsEvent signal_scan`) with `detectSiteSignals`. A hit writes `KlyPlace id signal:<domain>` (source `signal:new_website|new_shopify|grand_opening|...`, picked up by `adlibSource` like adlib rows, so the lead carries `qualification.signals`) + `AdsEvent lead_signal`, and marks the Overture row used (no double lead).
- `KLY_INTENT_ENABLED=1`: every 6 h runs the intent discovery and writes `AdsEvent intent_opportunity` (`props: url,title,text,score,draft,status:"new"`; deduped by `props.id`, max 50/run).
- Seasonal needs no switch: already applied at discovery (`finder.ts`, `adlibSegment`).
- All fetches go through `polite-fetch.ts`: UA `KomendlyBot/1.0 (+https://www.komendly.com)`, robots.txt per host (disallowed = not fetched), 1.5-2 s gap. Reddit's robots.txt disallows generic bots, so Reddit is skipped automatically; HN Algolia + RSS remain. No login, nothing posted.
- Copy honesty: openers state only evidence ("I noticed your domain was registered in Oct 2026."; Shopify: "products ... all added since <month>"; quoted homepage phrase). Sitemap refresh has no opener; "we're open" hours no longer match.

Queue UI/API: `/admin/ads/intent` (admin); `GET/POST /api/intent/queue` with `Bearer INTENT_AGENT_TOKEN` (or `CRON_SECRET`): GET lists `status:"new"` best score first; POST `{action:"done"|"skip", id, outcome?, replyUrl?}`. Set `INTENT_AGENT_TOKEN` on Vercel and in Media Master.
