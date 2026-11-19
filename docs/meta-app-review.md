# Meta App Review package (Komendly Ads: publish to Meta)

Draft, 2026-11-19. Goal: Advanced Access for the Marketing API permissions, so any business (not only people with
a role on our app) can connect their ad account and have Ozzy publish ads. Nothing here has been submitted.

## 1. Fix before submitting (found in prod and code)

| # | Gap | Why it matters | Fix |
|---|---|---|---|
| 1 | `meta_publish` flag is **off** in prod and `MetaConnection` has **0 rows**. The flow has never run in production. | Reviewers fail any step that errors. | As an app admin (Standard Access works for app roles), turn the flag on for testing and publish one real run end to end into the AI Consulting account (act_838454441892655). Check the paused campaign in Ads Manager. |
| 2 | Publishing needs a **paid** workspace (`canPublishToMeta`). | The reviewer would hit "upgrade required". | Make a reviewer login with a comped paid plan and one completed run (see §4). |
| 3 | We request **`ads_read`**, but graph mode never reads insights. The privacy policy says we "read their results". | Meta rejects permissions the screencast doesn't show being used. | Either ship a small "Results" view (spend, CTR, clicks per published ad) first, which outcome pricing needs anyway, or remove `ads_read` from `GRAPH_SCOPES` for this submission. |
| 4 | We request **`business_management`**, but no call uses it. `me/adaccounts` and `me/accounts` work without it for assets the user is assigned to. | Same as #3. | Test the connect flow without it. Request it only if business-owned ad accounts or Pages don't appear in the picker without it, and show that in the video. |
| 5 | **`pages_read_engagement`** vs **`pages_manage_ads`**: the code requests the first. The MCP scope list uses the second. The page-backed creative call (`act_x/adcreatives` with `object_story_spec.page_id`) decides which one is needed. | A wrong Page permission fails the creative step, or the extra one gets rejected. | During the #1 test, try each set and keep the minimum that creates the creative. Update `GRAPH_SCOPES` to match. |
| 6 | There's **no data-deletion URL**. The policy only says "email us". | A Data Deletion Instructions URL (or callback) is required in App Settings → Basic. | Add a `#meta-data` section to `/privacy`: Disconnect in the app deletes the stored token and ad account/Page ids immediately; also remove Komendly at facebook.com/settings → Business integrations; or email us. Use `https://www.komendly.com/privacy#meta-data`. Optional: also call `DELETE /me/permissions` on disconnect. |
| 7 | `META_LOGIN_CONFIG_ID` is unset, so login uses the classic `scope=` param. | Business-type apps are expected to use Facebook Login for Business configurations. | Create a configuration with the final permission list, set `META_LOGIN_CONFIG_ID` in Vercel, and re-test. |

Also, unverified: Meta has historically gated the Marketing API tier upgrade ("Ads Management Standard Access") on
recent successful API call volume and a low error rate. Check the app's Marketing API → Access tier page. If it
applies, the #1 testing builds that volume.

## 2. App settings checklist

- [ ] Business Verification done for the business that owns the app.
- [ ] App type Business; use cases "Create & manage ads with Marketing API" plus Facebook Login for Business.
- [ ] Basic: icon 1024×1024, category "Business and pages", Privacy Policy `https://www.komendly.com/privacy`, Terms `https://www.komendly.com/terms`, data deletion URL (gap #6), app domain `komendly.com`.
- [ ] Valid OAuth redirect URI: `https://www.komendly.com/api/ads/meta/callback` (matches prod `META_REDIRECT_URI`).
- [ ] App mode Live after approval.

## 3. Permission justifications (paste into the review form)

**ads_management**
> Komendly turns a business's website into ad creatives. When the user clicks "Publish to Meta" and connects their
> account, Komendly uses ads_management to upload the ad images and videos to the ad account the user picked
> (/adimages, /advideos), and to create a campaign, ad sets (Feed and Stories/Reels) and ads with those creatives
> (/campaigns, /adsets, /adcreatives, /ads). Everything is created PAUSED: the user reviews and turns it on in Ads
> Manager. We only touch the ad account the user picks, and only when they click Publish.

**ads_read** (only if gap #3 ships)
> After publishing, Komendly shows the user how each published ad performs (spend, impressions, clicks, CTR) so they
> can see which creatives work and ask for new ones. We read insights only for campaigns Komendly created in the ad
> account the user picked.

**pages_show_list**
> Ads must run from a Facebook Page. We list the Pages the user manages so they can pick which Page the ads are
> published from. We store only the chosen Page id.

**pages_read_engagement / pages_manage_ads** (whichever gap #5 shows is required)
> Needed to create ad creatives that run from the Page the user picked (object_story_spec.page_id). We don't post to
> the Page, read its posts or message anyone.

**business_management** (only if gap #4 shows it's needed)
> Many of our users' ad accounts and Pages are owned by their Business portfolio. We need business_management to list
> those business-owned ad accounts and Pages so the user can pick the one to publish to. We don't change business
> settings, users or assets.

## 4. Reviewer test account

Give in "Test instructions":
- URL `https://www.komendly.com/login`, email/password of a reviewer account (create it; don't reuse a real one).
- That workspace: comped paid plan, one completed run with ready ads, `meta_publish` on.
- Steps: open the run → "Publish to Meta" → follow the video. The reviewer uses their own Facebook test account and
  ad account; all ads are created paused, so nothing spends.

## 5. Screencast script (one video per permission is fine; this single flow covers all)

Record at 1080p, English UI, add captions for each step. Show the browser address bar.

1. Logged in to Komendly, open a completed ad run (the gallery of generated ads). Caption: "User's ads are ready."
2. Click **Publish to Meta**. Dialog: "Connect the Meta account that manages your ad account and Facebook Page."
   Click **Connect Meta account**.
3. Facebook login dialog: pause on the permission screen so every requested permission is readable. Approve.
4. Back in Komendly: the **ad account** dropdown (pages_show_list / ads_management, plus business_management if
   requested, with a business-owned account visible) and the **Page** dropdown. Pick both.
5. Select which ads to publish (placements Feed 4:5 / 1:1 and Stories/Reels 9:16 shown). Click **Publish**.
   Caption: "Komendly uploads the creatives and creates a paused campaign."
6. Status shows published. Click the **Ads Manager** link. In Ads Manager show the new campaign, its ad sets and the
   ads with the uploaded images/videos, all **Paused**. Caption: "ads_management: campaign, ad sets, ads, creatives."
7. (ads_read only) Back in Komendly, open the results view for the published ads.
8. Click **Disconnect** in Komendly. Caption: "Token and account ids deleted."

## 6. Not covered here

Running, budgeting or optimizing campaigns for customers (outcome pricing). Request that after this approval, as a
separate use case, once the product does it. Reviewers approve what the video shows, not future plans.
