# Privacy practices tab: exact answers

Developer console > the item > Privacy practices. Copy-paste these.

**Single purpose description:**
Adds a "Remake for my business" button to ads in the Meta Ad Library that opens komendly.com with that ad's public details and the user's saved website, so the user can make their own version of the ad.

**storage justification:**
Saves the one setting the user types in the popup, their business website, in chrome.storage.sync so they do not retype it for every ad. Nothing else is stored.

**Host permission justification (https://www.facebook.com/ads/library/*):**
The content script runs only on Meta Ad Library pages to read the public details of each ad card (Library ID, Page name, headline, text, image link) and place the "Remake for my business" button on it. It also lets the popup list the advertisers on the open Ad Library tab for the ad check shortcut. No other site is accessed.

**Remote code:** No, I am not using remote code. All JavaScript is bundled in the package (no eval, no remote scripts).

**Data usage checkboxes:** tick ONLY "Website content". Leave unticked: Personally identifiable information, Health information, Financial and payment information, Authentication information, Personal communications, Location, Web history, User activity.
Why website content: when the user clicks "Remake for my business", the public details of that one ad and the saved website go in the komendly.com link that opens. Nothing is collected in the background.

**Certifications (tick all three):**
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://www.komendly.com/privacy#extension
(Deploy the web app first so this section is live before submitting.)

Permissions in manifest: `storage` + host `https://www.facebook.com/ads/library/*` only. No tabs, scripting, activeTab, cookies or remote hosts.
