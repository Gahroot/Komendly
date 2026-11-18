# Founder steps (only you can do these; ~45 minutes total)

Everything else (code, webhooks, billing, listing copy) is built. Do these in order.

## 1. Create the Shopify Partner account
1. Go to https://www.shopify.com/partners and click **Join now**.
2. Sign up with the business email, fill in the business details (Komendly), accept the Partner Program Agreement.
3. In the Partner Dashboard click **Settings** > **Contacts**, add yourself as **Emergency developer contact** (required for review).
4. **Settings** > **Payouts**: add the payout bank account and tax form (needed to receive Billing API revenue).

## 2. Create the app
1. Partner Dashboard > **Apps** > **Create app** > **Create app manually** (this opens the Dev Dashboard).
2. Name: `Komendly: Ad Creatives`. Click **Create**.
3. Open the app > **Settings**: copy the **Client ID** and **Client secret**.
4. On your computer, in the repo: `cd docs/shopify`, edit `shopify.app.toml` and paste the Client ID into `client_id`.
5. Run `npx @shopify/cli@latest app deploy --config shopify.app.toml` from `docs/shopify` (log in when the browser opens, pick your Partner org and this app). This sets the app URL, `read_products` scope, managed install and all webhooks. Answer **Yes** to release the version.
   If the CLI refuses (e.g. it wants a project folder): Dev Dashboard > your app > **Versions** > **Create version** and enter the same values by hand: App URL `https://www.komendly.com/shopify`, embedded on, scopes `read_products`, redirect URL `https://www.komendly.com/shopify`, webhooks API version `2026-10`, subscriptions `app/uninstalled` + `app_subscriptions/update` and the three compliance topics, all to `https://www.komendly.com/api/shopify/webhooks`. Then **Release**.

## 3. Paste env vars (Vercel project, Production)
`vercel env add <NAME> production` for each (or Vercel dashboard > Settings > Environment Variables):
- `SHOPIFY_API_KEY` = Client ID
- `SHOPIFY_API_SECRET` = Client secret
- `SHOPIFY_API_VERSION` = `2026-10` (optional; default)
- `SHOPIFY_BILLING_TEST` = leave unset in production (set `1` only to force test charges)
- `ADS_TOKEN_KEY` already exists (used to encrypt Shopify tokens).
Then redeploy. Engine (Railway) needs nothing new; optional `SHOPIFY_APP_URL` if the app is not on www.komendly.com.

## 4. Turn it on
Admin > growth systems: switch **Shopify App Store** on (flag `sys_shopify`). Off = new stores see "temporarily unavailable".

## 5. Create a development store and test
1. Partner Dashboard > **Stores** > **Add store** > **Create development store** > "Create a store to test and build", any name. Add 2-3 products (published to Online Store).
2. Dev Dashboard > your app > **Install app** (or open `https://www.komendly.com/api/shopify/install?shop=<store>.myshopify.com`), pick the dev store, accept.
3. Follow `review-test-instructions.md` end to end (charges are test charges on dev stores).
4. Record the 2-3 min demo screencast described in `listing.md` while doing it.

## 6. Listing and submission
1. Partner Dashboard > **Apps** > Komendly > **Distribution** > **Shopify App Store** > **Select**.
2. **App listing** > **Create listing** (English): paste copy, features, pricing, category and search terms from `listing.md`; upload icon, feature image and 3-5 screenshots (plan in `listing.md`); privacy policy https://www.komendly.com/privacy; support email (pick the inbox you read, e.g. the one Kly replies land in).
3. **Pricing**: choose "Recurring charges" via Billing API; add Free (first pack), Starter $49/30 days, Ozzy Ad Department $197/30 days.
4. **App submission** > **Testing instructions**: paste `review-test-instructions.md`; add the screencast link (unlisted YouTube/Loom).
5. Privacy questions: answer from `privacy-gdpr.md` (no protected customer data).
6. Click **Run automated checks** (fix nothing expected: compliance webhooks return 401 on bad HMAC, app is embedded, uses session tokens). Then **Submit for review**.
7. Review takes about 1-2 weeks; Shopify emails the Partner address. If they ask for changes, forward the email to the coordinator.
