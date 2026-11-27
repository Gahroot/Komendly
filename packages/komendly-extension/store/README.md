# Submitting to the Chrome Web Store

Everything is ready. Files are also copied to `~/Downloads/komendly-chrome-store/`.

Owner checklist:
1. Deploy the web app so https://www.komendly.com/privacy#extension is live (new "Our Chrome extension" section).
2. Go to https://chrome.google.com/webstore/devconsole and sign in with the Google account that will own the listing.
3. Enable 2-step verification on that account if prompted.
4. Pay the one-time $5 developer registration fee. Verify your email/contact info if asked.
5. Click "New item", upload `komendly-extension.zip`.
6. Store listing tab: paste name, summary, description, category (Productivity), language from `store/listing.md`. Upload the icon `icons/icon-128.png`, screenshots `screenshot-1-ad-library-1280x800.png` and `screenshot-2-popup-1280x800.png`, small promo tile `promo-tile-440x280.png`, marquee `marquee-1400x560.png`. Homepage/support URL: https://www.komendly.com/tools/chrome-extension
7. Privacy practices tab: paste every answer from `store/privacy-practices.md` (single purpose, permission justifications, remote code = No, Website content only, 3 certifications, privacy policy URL).
8. Distribution: Public, all regions, Free.
9. Click "Submit for review" (review usually takes a few days).
10. After approval, copy the listing URL into `CHROME_EXTENSION_URL` in `src/lib/growth/chrome-extension.ts` and deploy.

Rebuild (only if source changes): `npm run build` (zip -> `dist/komendly-extension.zip`). Assets: `CHROMIUM_PATH=<chromium/brave> node scripts/e2e.mjs --fixture && npm run store-assets`.
