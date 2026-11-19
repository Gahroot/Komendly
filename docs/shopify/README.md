# Komendly for Shopify (growth system #7, key `shopify`, utm_source `shopify`)

## Requirements researched (Nov 2026) and how the build meets them
| Requirement | Source | Where it's met |
|---|---|---|
| Embedded in the admin, latest App Bridge (`app-bridge.js` script first in `<head>`, `shopify-api-key` meta) | https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements (2.2.3) | `src/lib/shopify/page-html.ts`, served by `src/app/shopify/route.ts` |
| Session tokens for auth (1.1.1), no third-party cookies | same page, https://shopify.dev/docs/apps/build/authentication-authorization/id-tokens | `verifySessionToken` in `src/lib/shopify/core.ts`; every `/api/shopify/app` call sends `Authorization: Bearer <id token>` |
| Shopify managed installation + token exchange | https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens | `exchangeToken` in `src/lib/shopify/admin.ts`; scopes declared in `shopify.app.toml` |
| Expiring offline tokens (required for public apps created after 2026-04-01; non-expiring delisted 2027-01-01) (3.1.2) | https://shopify.dev/changelog/posts/expiring-offline-access-tokens-required-for-public-apps-april-1-2026 | token exchange sends `expiring=1`; token + refresh token stored AES-GCM encrypted (`ShopifyShop`) |
| Mandatory compliance webhooks, 401 on bad HMAC, 200 on success | https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance | `src/app/api/shopify/webhooks/route.ts` (raw body before HMAC) + `handleShopifyWebhook` |
| app/uninstalled clean-up (BFS 3.2.1 clean uninstall) | https://shopify.dev/docs/apps/launch/built-for-shopify/requirements | same handler: tokens cleared, charges cancelled |
| Charges only through Shopify Billing API / App Pricing; plan changes without support (1.2.1-1.2.3) | app-store-requirements, https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices | `appSubscriptionCreate` in `/api/shopify/app` (`subscribe`), `app_subscriptions/update` webhook + in-app `sync` |
| Only necessary scopes | best-practices (3.2) | `read_products` only |
| Listing: unique name, no pricing/reviews/Shopify trademarks in images, unique screenshots, demo screencast, test credentials that work without external auth, emergency developer contact (4.x) | app-store-requirements section 4 | `listing.md`, `review-test-instructions.md`, founder guide `~/Documents/Komendly-Shopify-App-Store-Guide.md` |
| Built for Shopify (ranking/badge): ≥50 net installs on paid shops, ≥5 reviews, min rating; admin LCP ≤2.5s, CLS ≤0.1, INP ≤200ms; embedded, primary workflow inside Shopify, sign-up from Shopify credentials, clean uninstall, helpful onboarding/errors, no pressure | https://shopify.dev/docs/apps/launch/built-for-shopify/requirements | one light HTML page (no framework bundle), install = account (no sign-up form), whole workflow in the admin; installs/reviews come with time |

Note: BFS 5.1 "ads apps" (web pixels, segments) targets ad-platform/pixel apps. Komendly makes ad creatives and doesn't publish to ad accounts; list it under Marketing > Ads/creative, not as an ad-platform app.

## How it works
- `/shopify` (application_url): embedded page. Loads, gets an ID token from App Bridge, POSTs `/api/shopify/app` `{action:"session"}`.
- `session`: verifies the token, token exchange, reads `shop { name email primaryDomain }`, `ensureShop` (new shop = Komendly user + ads workspace, `signed_up` with firstTouch utm_source=shopify, `shopify_installed`). Kill switch `sys_shopify` off: new shops see "temporarily unavailable"; existing shops keep working.
- `products`: Admin GraphQL (read_products), active products with a storefront URL.
- `start`: the existing Website2ads `startRun` (same free-trial and abuse rules) on the store or a product URL (own store only).
- `run`: status + a signed 10-minute link (`/api/shopify/open`) that opens the ads in Komendly in a new tab.
- `subscribe` / `sync`: Billing API recurring subscription (Starter, Ozzy Ad Department; same price + credits as the Stripe plans). Credits through the existing ledger, keys `shopify:<chargeGid>:p1` then `shopify:<chargeGid>:<periodEnd>`. Dev stores and `SHOPIFY_BILLING_TEST=1` use test charges (no revenue events). Renewal credits are granted when the merchant next opens the app (sync sees a later `currentPeriodEnd`).
- Engine `engine/src/growth/shopify.ts` hourly: outputs = installs + paid activations in the last hour; synthetic check (`/api/shopify/health` 200, webhooks answer 401 to a bad HMAC); heartbeat `system:shopify`.
