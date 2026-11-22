# Komendly product facts (runtime knowledge for the blog engine)

Prices and credits are NOT kept here: at runtime the engine parses ADS_PLANS / ADS_TOPUPS from
`src/lib/ads/billing-config.ts` on GitHub main (the live prices). The "Fallback prices" section below is used only
when that file can't be read. Never state any Komendly fact that is not on this page or in the parsed price list.

## What Komendly is
- Komendly turns a website URL into on-brand, ready-to-run ad creatives (static + animated) via Ozzy, its AI ad wizard.
- Ad sizes: 4:5, 1:1, 9:16.
- Ads for all 5 awareness stages (unaware, problem aware, solution aware, product aware, most aware).
- Lead paid plan: Ozzy's AI Marketing Team (plan "Ozzy Ad Department"), $97 the first month, then $197/month. The owner connects Meta once, sets a monthly ad budget limit and authorizes the team; the team then makes fresh ads every week, launches and runs Meta lead ads in the owner's own ad account, pauses ads that waste money, emails each lead within minutes and sends a weekly plain-English report. Ad spend is paid to Meta directly and never exceeds the owner's limit. Never promise lead numbers, sales or ROI.
- Never describe it as "one-click publishing" or tie publishing to Growth/Scale plans.
- Second product: AI video testimonials (komendly.com/testimonials) turns text reviews into AI-avatar videos.

## Free trial
- 10 free ads made from the business's website, no card required. "Unlock this pack" ($9) only unlocks the bonus ads; any paid plan includes them.
- People who sign up through a referral link get 20 free ads.
- One trial per website/device/network; email verification.

## Guarantee
- 30-day money-back guarantee on the first month.

## AI assistants and integrations
- Komendly runs a remote MCP server at https://www.komendly.com/api/mcp with OAuth sign-in (the user signs in on komendly.com; the assistant never sees the password).
- It works today as a custom connector in ChatGPT (Settings > Apps & Connectors > Create, developer mode), Claude (claude.ai and Claude Desktop: Settings > Connectors > Add custom connector), Claude Code and Cursor.
- From an assistant, a user can make ad packs from a website URL, make Ozzy Studio videos, upload their own footage, check status and download the finished files. It uses the same account, plan and credits as the web app.
- Komendly has been submitted to the ChatGPT app directory and the Claude connector directory but is NOT listed yet: never call it official, approved or listed.
- `komendly` CLI on npm (`npx komendly login`) for scripts and agents, using a personal API key from Dashboard > API.
- Shopify app "Komendly: Ad Creatives" is in review and NOT on the Shopify App Store yet. Today a Shopify merchant pastes their store URL into the free ad pack at /free-ads.
- Pages to link: /integrations/chatgpt, /integrations/claude, /integrations/shopify, /agents, /free-ads, /tools.

## Never invent
- No customer counts, user numbers, testimonials, reviews, ratings or performance stats (CTR, ROAS, conversion lifts) for Komendly.
- No features not listed here (publishing goes to Meta only: no Google/TikTok/LinkedIn publishing; no integrations beyond the ones listed above; no agency/white-label).

## Links
- Pricing: internal link `/pricing`. Free studio: `/`.

## Fallback prices (only if billing-config.ts on main can't be read; updated 2026-11-20)
- plan: Ozzy Ad Department | price: 197 (first month 97) | credits: 1200
- plan: Starter | price: 49 | credits: 20
- plan: Growth | price: 119 | credits: 55
- plan: Scale | price: 229 | credits: 115
- topup: 10 credits | price: 29 | credits: 10
- topup: 30 credits | price: 79 | credits: 30
