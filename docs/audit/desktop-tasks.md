# Desktop / logged-in-browser tasks (opportunities 61-100)

For the coordinator. Rules for every task: never solve or bypass a captcha, passkey or 2FA (stop and hand that one step to Nolan); disclose "Komendly" and "Ozzy, AI" on anything that talks as the brand; no fake reviews; follow each site's rules; stop on any warning. Use Brave (signed in as ngrout70 Google), helpers in `~/.ezcoder/goals/paying-custys/` (`ad.sh`, `bs.sh`, `mclick.sh`, `ftype.sh`); secrets in `secret/` there. Hidden folders are not pickable in file dialogs: copy files to `~/Downloads` first. Verification email codes: `node outreach/inbox.mjs <filter> [n]` (hello@getkomendly.com).

Brand copy (use everywhere): **Komendly: paste your website, get a free pack of ready-to-run Facebook and Instagram ads. Made by Ozzy, our AI.** URL with UTM per site: `https://www.komendly.com/free-ads?utm_source=<site>&utm_medium=listing`. Logo: `~/.ezcoder/goals/paying-custys/listing/komendly-logo-512.png`.

## Ready now
1. **Chrome Web Store ($5).** chrome.google.com/webstore/devconsole as the Google account that owns the developer registration (ask Nolan which; MEMORY says ngrout70). Pay the $5 (payment = Nolan if card entry is needed). Upload `~/Downloads/komendly-chrome-store/komendly-extension.zip`; paste `listing.md` and `privacy-practices.md`; images: marquee-1400x560.png, promo-tile-440x280.png, screenshot-2-popup-1280x800.png; **retake screenshot 1** (third-party brands visible) before submitting. Privacy URL `https://www.komendly.com/privacy#extension` (deploy web first). After approval: set `CHROME_EXTENSION_URL` in `src/lib/growth/chrome-extension.ts`, deploy.
2. **Shopify App Store.** partners.shopify.com > Apps > Komendly > Distribution. Paste `docs/shopify/listing.md`; test steps `docs/shopify/review-test-instructions.md`; privacy `docs/shopify/privacy-gdpr.md`. Submit for review. 2FA = Nolan.
3. **Claude directory status.** claude.ai/directory/manage (contact nolan@komendly.com): read connector 'Komendly' and plugin bundle status, write it to `docs/ai-assistants/claude-directory.md`.
4. **LinkedIn.** First check whether a Komendly Company Page exists and which logged-in profile administers it (MM browser account `db07e32d...` / `77876970...` are Nolan's). If none: ask Nolan to create the Page (or approve posting from his profile with "Founder of Komendly" disclosed). Then post the weekly draft from `docs/growth-ecosystem/build-in-public/<date>.md` (run `npx tsx --env-file=.env.local scripts/build-in-public.ts` first).
5. **X.** Needs a human to create the account (phone verify). Then post the `x` draft from the same file; <=280 chars incl. the AI note.
6. **YouTube Shorts.** Account decision first (existing channel is "Agentic AI with Nolan Grout", not Komendly). In YouTube Studio > Create > Upload: file = a reel from `~/.ezcoder/goals/paying-custys/reels-samples/*.mp4` (or `GET /api/reels/queue` videoUrl with `REELS_AGENT_TOKEN`); title ends `#Shorts`; tick "altered or synthetic content"; description = queue caption.
7. **TikTok.** Komendly account first. Upload via tiktok.com/upload; turn on the AI-generated content label; no links in the caption; bio link `https://www.komendly.com/free-ads?utm_source=tiktok&utm_medium=reel&utm_campaign=bio`.
8. **Reddit.** Only after Nolan checks u/Ozzy_da_wizard in his own browser (it blocked our automated one 20 Nov; do not retry automation there). Then either Nolan creates the app at reddit.com/prefs/apps (captcha) and the id/secret go into MM's APIs page, or post by hand: answers only, disclose "I'm from Komendly", obey each subreddit's rules.
9. **Facebook groups.** Only with Nolan's approval: from his personal profile, join 3-5 small-business/trade groups, read the rules, answer questions with disclosure, no links unless the rules allow. Never from the Komendly Page.

## Launches (free only; pick one day)
10. **Product Hunt.** Maker account needs to be aged. Tagline "Free Facebook ads from your website"; first comment disclose it's built by Komendly with an AI called Ozzy; link with `utm_source=producthunt`. Do not ask for upvotes.
11. **Hacker News "Show HN"** only if the Show HN rules fit (something people can try without sign-up: the free-ads page qualifies). One post, no voting rings.
12. **Indie Hackers + BetaList**: create product pages with the brand copy.

## Directories (free tiers only; skip any form with a captcha or payment)
13. AI tool directories with free submission (e.g. Toolify, TopAI.tools, Futurepedia free tier, aitoolsdirectory). Use brand copy; record each submission in `outreach/sent.jsonl` style notes at `docs/audit/submissions.md`.
14. Comparison/software directories: AlternativeTo (free), G2 and Capterra free vendor profile, SourceForge, GetApp. Confirm vendor email via hello@getkomendly.com. Never request or write reviews for ourselves.

## Outreach research (send only via `outreach/send.mjs`, dedup in `sent.jsonl`)
15. Journalists: find 10 reporters who recently wrote about local-business advertising or small-business marketing (search news, read bylines); one personal line each + `https://www.komendly.com/reports/local-service-meta-ads` + `docs/data-report-pitch.md`. No invented contacts; skip if no public address.
16. Podcasts: 15 shows for local-business owners/marketers; pitch topic "What 1,529 local advertisers' Facebook ads show" (the report). Recording needs Nolan.
17. Guest posts: 5 marketing/small-business blogs that accept guests; offer one data-backed piece (numbers from the report only).

## Checks
18. **Pinterest verify.** pinterest.com logged in as PRESTYJ: open the 5 boards (ids in `pin-boards.json`), count live pins (expect ~28 by 27 Nov at 4/day from 21 Nov), check each links with `utm_source=pinterest`. Report count; if pins failed, re-upload `Komendly-Pinterest-bulk-upload.csv` rows for the missed dates.
19. **WordPress plugin.** Install PHP locally or on a throwaway WP site, run `php -l packages/komendly-wordpress/komendly-free-ads.php`, test `[komendly_ads]`, zip the folder, submit at wordpress.org/plugins/developers/add (WordPress.org account; review takes weeks).
