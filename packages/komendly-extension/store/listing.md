# Chrome Web Store listing: Komendly: Remake this ad

Upload: `dist/komendly-extension.zip` (`npm run build`). Assets: `npm run build && node scripts/e2e.mjs && npm run store-assets`.

## Store listing

**Name:** Komendly: Remake this ad

**Summary (≤132 chars):**
Adds a "Remake for my business" button to Meta Ad Library ads. One click opens the ad in Komendly. Free. Not affiliated with Meta.

**Category:** Productivity (Tools)

**Language:** English (United States)

**Description:**

See an ad in the Meta Ad Library that you wish you'd made? Remake it for your business in one click.

Komendly: Remake this ad adds a "Remake for my business" button to every ad card in the Meta Ad Library (facebook.com/ads/library). Click it and Komendly opens with that ad and your business website filled in, so Ozzy, Komendly's ad maker, can rebuild the idea and style for your business. Your version uses your own wording, logo and photos. Nothing is copied word for word.

How it works
1. Open the extension once and type your business website. It's saved in your Chrome profile.
2. Search the Meta Ad Library for any business or keyword.
3. Click "Remake for my business" on an ad you like.

Also in the popup: a shortcut to Komendly's free Meta ad check for the advertiser you're looking at.

Made for local service businesses (plumbers, roofers, cleaners, salons, contractors and more) that want Facebook and Instagram ads without a designer. Making ads on Komendly starts with a free pack of 10 ads, no card. If you want Komendly to run your ads in your own Meta account, the Ozzy Ad Department is $97 the first month, then $197/month, cancel anytime. The extension itself is free.

Privacy: no tracking, no analytics, no account. The extension only runs on Meta Ad Library pages and only sends the ad you click (and the website you saved) when you click the button.

Komendly is not affiliated with, endorsed by or sponsored by Meta. Facebook, Instagram and Meta are trademarks of Meta Platforms, Inc.

**Homepage URL:** https://www.komendly.com/tools/chrome-extension
**Support URL:** https://www.komendly.com/tools/chrome-extension

**Graphic assets:**
- Icon 128x128: `icons/icon-128.png`
- Screenshot 1 (1280x800): `store/screenshot-1-ad-library-1280x800.png`
- Screenshot 2 (1280x800): `store/screenshot-2-popup-1280x800.png`
- Small promo tile (440x280): `store/promo-tile-440x280.png`

## Privacy practices tab

**Single purpose:**
Adds a "Remake for my business" button to ads in the Meta Ad Library that opens komendly.com with that ad's public details and the user's saved website, so the user can make their own version of the ad.

**Permission justifications:**
- `storage`: Saves the one setting the user types in the popup, their business website, in chrome.storage.sync so they don't retype it for every ad. Nothing else is stored.
- Host permission `https://www.facebook.com/ads/library/*`: The content script runs only on Meta Ad Library pages to read the public details of each ad card (Library ID, Page name, headline, text, image link) and place the "Remake for my business" button on it. It also lets the popup list the advertisers on the open Ad Library tab for the ad check shortcut. No other site is accessed.

**Remote code:** No, I am not using remote code. All JavaScript is bundled in the package.

**Data usage (what the extension collects):**
- Personally identifiable information: No
- Health information: No
- Financial and payment information: No
- Authentication information: No
- Personal communications: No
- Location: No
- Web history: No
- User activity: No
- Website content: Yes, only when the user clicks "Remake for my business": the public details of that one Ad Library ad (Ad Library link, headline, text, image link, Page name) are put in the komendly.com link the button opens, together with the website the user saved. When the user clicks "Check ads" in the popup, the Facebook Page link or ID they chose is put in the komendly.com/tools/meta-ad-check link it opens. Nothing is collected in the background.

**Certifications (all checked):**
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://www.komendly.com/tools/chrome-extension#privacy

## Distribution
- Visibility: Public. Regions: all (the product targets US businesses).
- Pricing: Free.
