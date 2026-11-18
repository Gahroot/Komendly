# Privacy & data protection answers (Partner Dashboard > App > API access / Protected customer data + listing questionnaire)

- **Scopes:** `read_products` only. No orders, customers, or protected customer data. Answer "No" to "Does your app access protected customer data?".
- **Data we store per shop:** shop domain, shop name and contact email, storefront URL, an encrypted (AES-256-GCM) expiring offline access token + refresh token, install/uninstall dates, Billing API charge ids and status.
- **Data we process:** public storefront/product pages and product titles/images to make ad creatives; the generated ads live in the merchant's Komendly workspace.
- **Purpose:** making ad creatives the merchant asks for; billing; support.
- **Retention:** tokens deleted on `app/uninstalled`. On `shop/redact` (48h after uninstall) shop name, email, tokens and scopes are erased; charge records are kept for accounting/tax.
- **customers/data_request:** we hold no data about the store's customers; the webhook is acknowledged (200) and nothing is returned.
- **customers/redact:** same: nothing to erase.
- **Webhook security:** HMAC-SHA256 verified on the raw body; invalid HMAC = 401.
- **Sub-processors:** Vercel (hosting), Neon/Postgres host, AWS S3 (ad files, presigned URLs ≤10 min), AI model providers used to write and render ads (no Shopify customer data sent).
- **Data location:** United States.
- **Contact for privacy requests:** the support email in the listing.
