# Komendly blog content contract (shared by site, blog-engine, research)

Posts live in `content/blog/<slug>.md` (existing posts may be `.mdx`; keep them working).
URL: `https://komendly.com/blog/<slug>`. Engine-written posts are plain Markdown (GFM tables allowed),
MDX-safe: no raw HTML/JSX, no `<` or `{` outside code spans/blocks.

## Frontmatter (YAML)
```yaml
title: "Komendly vs AdCreative.ai: which AI ad generator fits a small business? (2026)"   # <= 65 chars ideal
slug: komendly-vs-adcreative-ai            # = filename without extension
description: "120-160 char meta description with the primary keyword"
date: 2026-11-07                           # first published
updated: 2026-11-07                        # last meaningful update (drives sitemap lastmod, dateModified, "Updated" label)
author: Nolan Grout                        # all posts; site maps the name to /blog/author/nolan-grout
type: comparison                           # guide | comparison | alternatives | question | listicle | glossary (default guide)
tags: ["AI ad generator", "comparison"]
published: true                            # false = draft (not rendered, not in sitemap)
status: approved                           # engine bookkeeping: draft | approved
approved_by: "auto-review (Komendly blog engine)"
primary_keyword: "komendly vs adcreative.ai"
secondary_keywords: ["adcreative.ai review", "adcreative.ai pricing"]
answer: "40-70 word direct answer to the title question. Rendered as a 'Quick answer' box at the top; used by AI answer engines."
key_takeaways: ["optional bullet", "optional bullet"]
competitors: ["AdCreative.ai"]             # comparison/alternatives only
cta: ads                                   # ads (10 free static ads + 1 animated, no card) | motion (lead with the animated video ad)
faq:
  - q: "Question people ask?"
    a: "Short, self-contained answer.[^1]"
sources:
  - id: 1
    title: "AdCreative.ai pricing"
    publisher: "AdCreative.ai"
    url: "https://www.adcreative.ai/pricing"
    accessed: 2026-11-07
claims:                                    # engine/gate bookkeeping, not rendered
  - text: "AdCreative.ai's Starter plan costs $X/month (as of November 2026)."
    source: 1
```
- Body cites sources with `[^n]` where n = a `sources[].id`. No footnote definitions in the body: the site renders
  `[^n]` as a superscript link to `#source-n` in a "Sources" list built from frontmatter.
- Internal links: `/blog/<slug>`, `/pricing`, `/` (the free-ads studio). The site adds CTAs itself; posts don't need CTA blocks.

## Product facts (single source of truth: `src/lib/ads/billing-config.ts` on main, read by the engine at runtime; the prices below are examples only, never invent others)
- Komendly turns a website URL into on-brand, ready-to-run ad creatives (static + animated) via Ozzy, its AI ad wizard.
- Free trial: 10 static ads + 1 animated ad, no card required (one trial per website/device/network; email verification).
- Sizes 4:5, 1:1, 9:16; ads for all 5 awareness stages; one-click publish to Meta on Growth+.
- Plans (monthly): Starter $49 (20 credits), Growth $119 (55 credits), Scale $229 (115 credits). Top-ups: 10 credits $29, 30 credits $79.
- 30-day money-back guarantee on the first month.
- Second product: AI video testimonials (komendly.com/testimonials) turns text reviews into AI-avatar videos.
- No customer counts, testimonials, ratings or performance stats for Komendly may be invented.

## CTA links (conversion tracking)
`/?utm_source=blog&utm_medium=article&utm_campaign=<slug>&utm_content=<position>#studio-url`

## IndexNow
Key `78c8478292a52ad65d0087edc113df99`, key file served at `https://komendly.com/78c8478292a52ad65d0087edc113df99.txt`
(file `public/78c8478292a52ad65d0087edc113df99.txt` containing just the key). Engine pings IndexNow after a merge goes live.

## Seed files (research -> engine)
- `blog-engine/seed/competitors.json`: `[{name, slug, url, category, pricing:[{plan, price, period, notes}], free_trial, key_features:[], best_for, weaknesses:[], sources:[{title,url,accessed}]}]`
- `blog-engine/seed/topics.json`: `[{slug, title, type, primary_keyword, secondary_keywords:[], intent, funnel: tofu|mofu|bofu, priority: 1-5 (1 = write first), cta, competitors:[], angle, questions:[]}]`
