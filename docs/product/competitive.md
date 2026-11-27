# Competitive scorecard

Generated 2026-11-27 by `scripts/competitive-scan.ts` from `src/lib/product-intel/competitive.ts`. Facts: the compare-page data (verified 2026-11-26) and public vendor pages only. Blank = not verified, left out of totals.
Totals are weighted averages over the **scored** dimensions only (coverage shows how much of the rubric that is). Scores are 0-3 on the rule below, not a statement about overall product quality. Prices change: check the linked page.

## Rubric

- **Time to first ad** (weight 3): 3 = finished ads from a link with no setup; 2 = guided setup, minutes to hours; 1 = build in an editor; 0 = days (brief + turnaround).
- **Effort for a non-designer** (weight 3): 3 = none beyond pasting a link; 2 = light review; 1 = operate a design/ads tool; 0 = manage people or learn the platform.
- **Entry price** (weight 2): 3 = free first result or <= $50/mo; 2 = <= $200/mo; 1 = <= $500/mo; 0 = above.
- **Publishes to Meta** (weight 2): 3 = publishes to Facebook/Instagram ads from the tool; 1 = exports only; 0 = no.
- **Learns / optimises from results** (weight 2): 3 = automated optimisation on live results; 2 = insights/reporting or rule-based pauses; 1 = manual A/B only; 0 = none.
- **Local-business focus** (weight 2): 3 = built for local service businesses; 2 = SMB generalist; 1 = ecommerce/agency oriented; 0 = enterprise.
- **Public proof of results** (weight 1): 3 = published, verifiable customer results; 2 = vendor-stated aggregate claims; 1 = testimonials only; 0 = none.

## Scores

| | Time to first ad | Effort for a non-designer | Entry price | Publishes to Meta | Learns / optimises from results | Local-business focus | Public proof of results | Total | Coverage |
|---|---|---|---|---|---|---|---|---|---|
| Komendly | 3 | 3 | 2 | 3 | 2 | 3 | 1 | 87 | 100% |
| Creatopy | n/v | 1 | 3 | 3 | n/v | n/v | n/v | 71 | 47% |
| Madgicx | n/v | n/v | 3 | 3 | 3 | 1 | n/v | 83 | 53% |
| Predis.ai | n/v | n/v | 3 | 3 | n/v | n/v | n/v | 100 | 27% |
| AdCreative.ai | n/v | n/v | n/v | n/v | 2 | 1 | 2 | 53 | 33% |
| Canva Magic Studio | n/v | n/v | n/v | n/v | n/v | n/v | n/v | n/v | 0% |
| Pencil | n/v | n/v | n/v | n/v | n/v | 0 | 2 | 22 | 20% |
| Smartly | n/v | n/v | n/v | n/v | n/v | n/v | n/v | n/v | 0% |
| Meta Advantage+ creative | n/v | n/v | n/v | n/v | n/v | n/v | n/v | n/v | 0% |
| Hiring a freelancer or agency | n/v | n/v | n/v | n/v | n/v | n/v | n/v | n/v | 0% |
| Doing it yourself | n/v | n/v | n/v | n/v | n/v | n/v | n/v | n/v | 0% |

n/v = not verified.

## Where we win

- Effort for a non-designer: 3/3 vs best verified alternative 1/3.
- Local-business focus: 3/3 vs best verified alternative 1/3.

## Where alternatives win

- Entry price: Creatopy, Madgicx, Predis.ai score higher than us (2/3) on the verified facts.
- Learns / optimises from results: Madgicx score higher than us (2/3) on the verified facts.
- Public proof of results: AdCreative.ai, Pencil score higher than us (1/3) on the verified facts.

## Underserved

- Time to first ad: no competitor verified yet (we score 3/3, unverified against others).
- Effort for a non-designer: every verified alternative scores <= 1/3.
- Local-business focus: every verified alternative scores <= 1/3.

## Differentiator proposals (owner decides)

- **Publish consented, measured customer results (no invented numbers)** [M] (evidence): Evidence is our lowest-scored rubric line; competitors cite aggregate claims we cannot honestly match yet. Needs: Real customer data and consent (proof system exists: sys_proof).
- **Make the first paid step cheaper than the lowest verified tool plan** [S] (price): Several verified tools list entry plans well under our plan prices. Needs: Owner pricing decision (never automatic); the $9 unlock already exists.
- **Show the closed loop: which ad won, what we changed next week** [L] (learns_optimises): Optimisation platforms score 3; we are 2 until the loop is proven on real spend. Needs: Real Meta spend data from paying customers.
- **Double down on local-trade presets (roofers, plumbers, dentists...)** [S] (local_focus): No verified alternative is built for local service businesses; this is the segment gap. Needs: None: reuse /free-ads trade pages and Ad Library data.

## Evidence

- Komendly / Time to first ad: Own product (10 free ads from a pasted website link); see src/lib/ads/public-offer.ts (https://www.komendly.com/pricing, checked 2026-11-26)
- Komendly / Effort for a non-designer: Own product (no editor; paste a link, review); see src/lib/ads/public-offer.ts (https://www.komendly.com/pricing, checked 2026-11-26)
- Komendly / Entry price: Own product (free first pack, then $197/mo or $297/mo; dearer than several tools at entry); see src/lib/ads/public-offer.ts (https://www.komendly.com/pricing, checked 2026-11-26)
- Komendly / Publishes to Meta: Own product (launches Facebook/Instagram lead ads in the owner's own Meta account); see src/lib/ads/public-offer.ts (https://www.komendly.com/pricing, checked 2026-11-26)
- Komendly / Learns / optimises from results: Own product (daily checks pause ads wasting money; closed-loop learning not yet proven on real customer data); see src/lib/ads/public-offer.ts (https://www.komendly.com/pricing, checked 2026-11-26)
- Komendly / Local-business focus: Own product (built for local service businesses); see src/lib/ads/public-offer.ts (https://www.komendly.com/pricing, checked 2026-11-26)
- Komendly / Public proof of results: Own product (no published customer results yet: not claimed); see src/lib/ads/public-offer.ts (https://www.komendly.com/pricing, checked 2026-11-26)
- Creatopy / Effort for a non-designer: Ad Studio and canvas with 5,000+ templates: you operate a design tool (https://www.creatopy.com/pricing/, checked 2026-11-26)
- Creatopy / Entry price: Pro listed at $39/month billed monthly (https://www.creatopy.com/pricing/, checked 2026-11-26)
- Creatopy / Publishes to Meta: Ultra plan lists publishing to Meta and Google Ads (https://www.creatopy.com/pricing/, checked 2026-11-26)
- Madgicx / Entry price: From $45/month for spend under $1K (billed monthly) (https://madgicx.com/pricing, checked 2026-11-26)
- Madgicx / Publishes to Meta: Built around Meta campaigns (per its pricing and positioning) (https://madgicx.com/pricing, checked 2026-11-26)
- Madgicx / Learns / optimises from results: Meta-ads optimisation and analytics platform with AI features (https://madgicx.com/pricing, checked 2026-11-26)
- Madgicx / Local-business focus: Positioned for ecommerce and ad-spend-based tiers (https://madgicx.com/pricing, checked 2026-11-26)
- Predis.ai / Entry price: Advertises ads, videos and UGC for less than $1/day; 3-day free trial (https://predis.ai/pricing/, checked 2026-11-26)
- Predis.ai / Publishes to Meta: Can publish to Facebook, Instagram and others (https://predis.ai/pricing/, checked 2026-11-26)
- AdCreative.ai / Learns / optimises from results: Lists creative insights and competitor insights (https://www.adcreative.ai/, checked 2026-11-26)
- AdCreative.ai / Local-business focus: Home page leans to ecommerce brands and agencies (https://www.adcreative.ai/, checked 2026-11-26)
- AdCreative.ai / Public proof of results: States 4.2M+ businesses and $35B+ ad-spend training data (vendor's own claims) (https://www.adcreative.ai/, checked 2026-11-26)
- Pencil / Local-business focus: Home page: "AI Operating System for Marketing" with enterprise governance; named customers L'Oreal, Unilever, Diageo, Salomon; CTA is Book a Demo (https://www.trypencil.com/, checked 2026-11-26)
- Pencil / Public proof of results: Vendor-stated results with named brands (e.g. 33% cost cut producing 46K AI assets); not independently verified (https://www.trypencil.com/, checked 2026-11-26)

## Not yet verified

- Creatopy: 3/7 dimensions scored.
- Madgicx: 4/7 dimensions scored.
- Predis.ai: 2/7 dimensions scored.
- AdCreative.ai: 3/7 dimensions scored.
- Canva Magic Studio: 0/7 dimensions scored. Not verified: canva.com/pricing returned HTTP 403 to automated fetch on 26 Nov 2026. Check in a browser; do not fill from memory.
- Pencil: 2/7 dimensions scored. Partly verified 26 Nov 2026 from the home page only. No public price (demo-led), so price is left unscored. Other dimensions not verified.
- Smartly: 0/7 dimensions scored. Not verified: 26 Nov 2026 fetch of smartly.io returned only a short marketing page ("AI Advertising Platform") with no price, segment or result claims to cite. Likely a different segment, but that is not a sourced claim.
- Meta Advantage+ creative: 0/7 dimensions scored. Not verified: facebook.com/business/ads/meta-advantage-plus returned HTTP 400 to automated fetch on 26 Nov 2026. It is the platform's own tooling, so any claim needs the current Meta page opened in a browser.
- Hiring a freelancer or agency: 0/7 dimensions scored. No single public page; typical price and turnaround would be assumptions, so unscored.
- Doing it yourself: 0/7 dimensions scored. Unscored: depends entirely on the owner's skill and time.
