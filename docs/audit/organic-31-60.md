# Audit: acquisition opportunities 31-60 (26 Nov 2026)

Method: read code, curled live www.komendly.com (status, robots, JSON-LD, sitemap, llms.txt), POSTed invalid payloads only (all returned 400), read prod flags and event counts with read-only SELECTs. Counts: **met 3 / partial 25 / not 2** (met = live, correct and exercised; partial = built and reachable but unproven, hand-fulfilled or flag-gated; not = nothing usable).

Cross-cutting findings
- **Intake had no fulfilment.** /makeover, /rescue, /launch-gifts, /nonprofits, /reviews-to-ads wrote an AdsEvent and promised an email, but nothing reads those rows. Fixed: each such submission now emails ADS_ALERT_EMAIL, and the confirmation copy promises "a person, within 2 business days" plus the instant /free-ads path (`creative-hubs-server.ts`, `creative-hubs.ts`, /makeover page).
- Flags in prod: `sys_creative_hubs` ON; `sys_creative_outreach` and `sys_creative_publish` absent (OFF); `sys_review_gifts` OFF; `sys_new_business` ON but 0 events. 0 hub submissions, 0 votes, 0 giveaway entries, 0 ad_watch events. GIVEAWAY_PRIZE unset (page says closed).
- Empty hub pages were index,follow thin pages. Now noindex while empty: /giveaways, /vote, /showcase, /business-of-the-day.
- Missing from sitemap and llms.txt: /tools/competitor-ad-watch, /seasonal(+6 seasons). Fixed (`sitemap.ts`, `organic/llms.ts`, test added).
- Registry was stale (53,54,56,57,60 said "not built" but are live; 31's code ref was a non-existent file). Updated 31-60.
- Consent: makeover public use needs a claimed gift or the business's own public source; take-down checks at render; nominee email has opt-out + postal address + review gate; reactions only publish with ticked consent. No fabricated testimonials found. Weak spot: the take-down form records an opt-out event but kly cold email does not read it (the owner alert covers it manually).
- "| Komendly" in live titles comes from the root template, not page strings (checked: no doubled suffix).

| # | Item | Status | Evidence | Remaining |
|---|---|---|---|---|
| 31 | Personalized gifts | met | 468 ready gifts, 6 viewed, 0 claimed; governor; /gift noindex | 0 claims: offer/copy question, not plumbing |
| 32 | Public makeovers | partial | form + take-down live, publish flag OFF, manual | enable creative_publish, fulfil by hand |
| 33 | Business of the day | partial | page + daily cron (401 unauth), flag OFF, 0 opt-ins | flag + opt-ins |
| 34 | Makeover competitions | not | nothing built | owner decision on prize/rules |
| 35 | 100 in 100 days | partial | /100-businesses real DB counts | no automated social posting |
| 36 | Giveaways | partial | page + rules, no prize | set GIVEAWAY_PRIZE |
| 37 | Nominations | partial | form live, 400 on bad input, nominee email flag OFF | enable outreach flag |
| 38 | Seasonal releases | partial | 7 pages hand-written, now in sitemap/llms | no traffic data |
| 39 | Launch gifts | partial | form live; new_business flag ON, 0 runs | verify kly tick; manual fulfil |
| 40 | Review transformations | partial | flag OFF; form live | dry run, enable |
| 41 | Competitions/voting | partial | /vote live, empty, noindex | needs featured ads |
| 42 | Website-to-ad challenge | partial | /challenge live, API validates | 0 results |
| 43 | Ad rescue | partial | form live, manual reply | someone must answer |
| 44 | Nonprofits | partial | EIN/domain check, manual approval | approve applicants |
| 45 | Reaction content | partial | /react consent-gated, nothing auto-published | 0 submissions |
| 46 | Industry generators | partial | 21 tool pages + /free-ads/<trade>; 13 AI jobs, 12 done | usage tiny |
| 47 | Industry galleries | met | 16 trades ~1,800 words each, hand-written, sitemap | |
| 48 | Competitor comparisons | met | 4 pages, every fact sourced, verified 2026-11-26 | re-verify monthly; adcreative blog post is a draft |
| 49 | Alternatives | partial | 4 pages + 2 posts, sourced | no traffic data |
| 50 | Ad creative assessment | partial | runs end to end (4 done) | little traffic |
| 51 | Website readiness | not | only partial neighbours (/remix, meta-ad-check) | build site-readiness checklist |
| 52 | Competitor ad intelligence | partial | page + API ok; 0 subscribers, never sent | test-subscribe (checklist 7) |
| 53 | Offer generation | partial | live, placeholders only | usage |
| 54 | Calendar generation | partial | live, CSV/.ics | usage |
| 55 | Budget resources | partial | calculator live, tested | usage |
| 56 | Image resizing | partial | resizer + size guide live | usage |
| 57 | Downloadable templates | partial | live | usage |
| 58 | Copy libraries | partial | live; hub page thin (~260 words) | enrich hub |
| 59 | Searchable inspiration | partial | live search over hand-written lines | not real-ad gallery |
| 60 | Interactive playbooks | partial | quiz + trade playbooks live | usage |

Files changed: sitemap.ts, organic/llms.ts, creative-hubs.ts, creative-hubs-server.ts, giveaways/vote/showcase/business-of-the-day/makeover pages, organic.test.ts, registry.json (31-60), these two docs.
