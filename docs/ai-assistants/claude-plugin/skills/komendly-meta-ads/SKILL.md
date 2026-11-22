---
name: komendly-meta-ads
description: Make and publish Meta (Facebook and Instagram) ads for a local business with Komendly. Use when someone asks for Facebook, Instagram or Meta ads, ad creatives or ad copy for a business website, especially US local service businesses (plumbers, roofers, cleaners, dentists, salons, contractors).
---

# Make and publish Meta ads for a local business with Komendly

Komendly reads a business's public website and makes an Ad Pack: ready-to-run static ads (image, headline, primary text and call to action) in the brand's style, sized for Facebook and Instagram feeds and stories. The `komendly` connector in this plugin gives you the tools. The first time a tool runs, the user signs in to Komendly or creates a free account in the browser.

## Steps

1. **Get the website.** Ask for the business's public website if the user hasn't given it. Komendly can't read `localhost`, staging or pages behind a login; ask for the live address instead.
2. **Check the account (optional).** `get_account` shows the plan, credits and whether the free Ad Pack was used. New accounts get one free Ad Pack (10 ads, no card).
3. **Make the ads.** Call `ads_create_pack` with `website_url`. Only set `animated: true` if the user asks for animated or video ads (paid plans).
4. **Follow progress.** Ads take a few minutes. Call `ads_get_run` with the `run_id` until the status is `completed` or `partial`. Don't start a second pack while one is running. In Claude and ChatGPT the result shows as an interactive ad gallery (thumbnails, headlines, status, Download, Publish to Meta, Upgrade); elsewhere, list each ready ad's headline, primary text and image link.
5. **Review with the user.** Show the headlines and copy. Suggest edits in plain words, but don't invent claims, prices or offers the website doesn't make.
6. **Publish to Meta.** Komendly doesn't spend ad budget from the chat. To publish, the user opens the pack on Komendly (`view_url`, the gallery's **Publish to Meta** button) and connects their Meta ad account there; they choose budget and approve before anything goes live. If the user has their own Meta Ads tool connected instead, call `campaign_kit` with the `run_id` and pass each item (media URL, headline, primary text, CTA type, landing URL, placements) to that tool, and let the user approve the budget.
7. **Downloads.** Image links work for 7 days; `get_download_url` with an `asset_id` gives a fresh one.

## When a tool returns `upgrade_url`

The free pack is used up, credits ran out or an ad is locked. Tell the user in one sentence and give them the `upgrade_url` as a link. Ozzy Ad Department is $97 for the first month, then $197/month (check the pricing page for current plans). Never collect payment details in chat or invent payment steps.

## Don't

- Don't promise results (leads, sales, cost per click).
- Don't make ads for a site the user doesn't own or represent, or for prohibited categories under Meta's advertising standards.
- Don't call `ads_create_pack` again just to check progress; use `ads_get_run`.
