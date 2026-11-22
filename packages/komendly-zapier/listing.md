# Komendly on Zapier: listing package

## App
- **Title:** Komendly
- **Description (133 chars):** Turn any website into ready-to-run Facebook and Instagram ads for local service businesses: images, headlines and ad copy in minutes.
- **Category:** Ads & Conversion (secondary: Marketing Automation)
- **Homepage:** https://www.komendly.com/?utm_source=zapier&utm_medium=integration
- **Logo:** `logo-256.png` (256×256 PNG, copied from `public/brand/komendly-mark-256.png`)
- **Auth:** API key (Settings → API, https://www.komendly.com/dashboard/api). New accounts get a free pack of 10 ads. After that, Ozzy Ad Department costs $97 for the first month, then $197/mo.
- **Upgrade link in every output:** https://www.komendly.com/pricing?utm_source=zapier&utm_medium=integration

## What it does
| Type | Name | Notes |
|---|---|---|
| Action | Generate Ads From a Website | Website URL (required), Goal, Offer, Animated. Returns the Ad Pack ID, status and view/upgrade links. Ads are ready in a few minutes. |
| Search | Find Ad Pack | Finds a pack by ID, or the newest pack for a website. Returns status, the ads and their image links. |
| Trigger | Ads Ready | Polls for new ready ads (one per ad) with the image URL, headline, primary text, CTA and landing URL. |
| Trigger | New Ad Pack | Polls for new packs, whether started from Komendly, Zapier, an AI agent or Autopilot. |

Image links are presigned links that anyone can fetch, so Slack, Sheets and Meta can use them. They last 7 days (`links_expire_at`); "Find Ad Pack" returns fresh ones. `view_url` is the permanent page on Komendly.

## Zap templates
1. **New HubSpot customer → make Meta ads for their website**
   HubSpot "New Company" → Komendly "Generate Ads From a Website" (Website URL = company domain, Goal = Get leads).
2. **New Jobber client → Meta ads ready for their launch**
   Jobber "New Client" → Komendly "Generate Ads From a Website" → Gmail "Send Email" with the pack's `view_url`.
3. **New Google Sheets row (website) → ads → Slack**
   Google Sheets "New Spreadsheet Row" → Komendly "Generate Ads From a Website". A second Zap, Komendly "Ads Ready" → Slack "Send Channel Message" with `image_url`, `headline` and `primary_text`.
4. **Ads ready → save to Google Drive**
   Komendly "Ads Ready" → Google Drive "Upload File" (File = `image_url`, name = `headline`).
5. **New Typeform lead → ad pack for their business**
   Typeform "New Entry" (website question) → Komendly "Generate Ads From a Website" (Offer = answer to "Current offer?").

## For AI agents (Zapier MCP)
Every action has a plain-language label and help text, so agents on Zapier MCP can call "Generate Ads From a Website" and then "Find Ad Pack" until `done` is true. Errors come back as one sentence. Out-of-credit errors include the upgrade link.

## Publishing steps (coordinator; not done here)
```bash
cd packages/komendly-zapier
npm install
npx zapier-platform login             # Komendly's Zapier developer account
npx zapier-platform register "Komendly" \
  --desc "Turn any website into ready-to-run Facebook and Instagram ads for local service businesses: images, headlines and ad copy in minutes." \
  --url "https://www.komendly.com/?utm_source=zapier" --audience global --role employee --category ads-conversion
npx zapier-platform push              # uploads 1.0.0
npx zapier-platform promote 1.0.0     # after testing with a real kmd_ key
```
Then in the Zapier developer UI: upload `logo-256.png`, add the templates above, and submit for public review. The web app must be deployed first: the integration calls `/api/zapier/runs/:id` and `/api/zapier/ads`.
