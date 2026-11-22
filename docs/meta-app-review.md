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

## 7. Progress (2026-11-19)

- Deployed (commit 2a32051): `ads_read` dropped; `pages_manage_ads` added next to `pages_read_engagement` (keep whichever the live test needs);
  Disconnect now also revokes the grant (`DELETE /me/permissions`); `/privacy#meta-data` added (data deletion URL).
- `meta_publish` can now be turned on per workspace (`AdsFeatureFlag` key `meta_publish:<workspaceId>`). On for Nolan's paid
  workspace (cmw9fdw0d000242a5fejcaew5) and the reviewer workspace; the global flag stays off.
- Reviewer login: `meta-reviewer@komendly.com`, password in `~/.config/meta-ads/reviewer.env` (not in git). Workspace
  cmwnwiwri0001hx2yclsixavx, comped `ad_department`/active, no runs yet. Generate its run right before submitting:
  run files are deleted after 7 days.
- Prod app is Prestyjco (1118842096830576).
- Live test passed 2026-11-19 18:49 UTC: Nolan's workspace connected (act_838454441892655, Page 1382429758290116) and
  published 5 ads (4:5 Feed) to campaign 120251462914270262. Campaign, ad set and ads are all PAUSED; ads are in Meta's ad
  review. The stored token is a USER token for app 1118842096830576 and is valid. It also carries older grants from this
  app (instagram_*, publish_video...), so it can't show whether `pages_read_engagement` or `pages_manage_ads` is the one
  that's needed. Keep both.
- Redirect URI `https://www.komendly.com/api/ads/meta/callback` is whitelisted in Facebook Login settings.
- **Blocker: app branding.** The app is Display name "Prestyjco", privacy policy `prestyj.com/privacy`, terms
  `prestyj.com/tos`, site `prestyj.com`, no data deletion URL. The consent screen and the app's policies must match the
  product in the screencast (Komendly), so the submission must not go out like this.
- App Basic settings switched to Komendly (verified via Graph API): display name Komendly, privacy
  `https://www.komendly.com/privacy`, terms `https://www.komendly.com/terms`, data deletion URL
  `https://www.komendly.com/privacy#meta-data`, app domain `komendly.com` added (ai.prestyj.com kept), site URL
  `https://www.komendly.com/`. Prestyj logins on this app now show Komendly branding too.
- Still to do in the dashboard: app icon (file at `~/Desktop/komendly-meta-icon-1024.png`; the upload needs a native file
  picker), category ("Business and pages", optional), testing instructions (§4).
- Access levels (Permissions and Features): ads_management, ads_read, business_management, pages_manage_ads: Standard,
  never reviewed. **pages_show_list and pages_read_engagement: "App Review rejected"** (an earlier submission), and so is
  Page Public Metadata Access. Check App Review → Requests for the rejection reason before resubmitting. Marketing API
  Access Tier: Limited (5.2K calls), needs Upgrade. These sit in the "Tech Provider" table, and Meta requires Business
  Verification for it. Business "Home Sales TV" (850028653548456) is Verified.
- The first recording can't be submitted: it was made while the app was still named Prestyjco. Re-record after the icon
  is set. Click Disconnect first, which revokes the grant, so the consent screen lists every permission fresh.

## 8. Submitted (2026-11-19 ~15:05 ET)

- Status: Review in progress (Meta says most reviews take up to 20 days). Requests: ads_management, business_management,
  pages_show_list, pages_read_engagement, pages_manage_ads (+ public_profile renewal). App icon set to the Komendly mark.
- Each permission has its own description and the screencast `meta komendly ad publishing.mp4` (H.264 copy:
  `~/Desktop/komendly-meta-review.mp4`). The OAuth request asks for exactly these 5 permissions (checked live).
- Data handling: processors Vercel Inc. and Railway Corporation (IT/cloud, United States); controller Grout Global LLC (US).
  The other answers kept the earlier Prestyj submission's choices.
- Reviewer account: `meta-reviewer@komendly.com` (password in `~/.config/meta-ads/reviewer.env`), Ad Department plan
  (comped), 1,000 credits (ledger `admin:meta-app-review-2026-11-19`), `meta_publish:<ws>` flag on, finished run
  cmwnyauy300074v2oolsn8bz5 for komendly.com (4 ads). Its files are deleted after 7 days; the instructions tell the reviewer
  to generate a new run if needed.
- Privacy policy: effective 19 November 2026, contact nolan@komendly.com, `#meta-data` deletion section.
- Not requested yet: Marketing API Access Tier upgrade (currently Limited). Request it after this approval.
- After approval: turn `meta_publish` on globally (or for each workspace) and remove the reviewer flag/credits when done.

## 9. Second submission (team service): NOT SUBMITTED

> **Status: NOT SUBMITTED** (draft, 2026-11-22). Submit only after §8 is approved. Until then these permissions work only
> for app-role users, via `META_EXTRA_SCOPES` (see below).

**Permissions to request (exactly these three):** `ads_read`, `leads_retrieval`, `pages_manage_metadata`.
The §8 permissions stay as they are. Don't add anything else (unused permissions get rejected).

**OAuth setup before recording:** set `META_EXTRA_SCOPES=ads_read,leads_retrieval,pages_manage_metadata` on the
environment used for the screencast (appended to the dialog `scope`; read on each connect). If `META_LOGIN_CONFIG_ID` is
set, the env var is ignored: add the three permissions to that Facebook Login for Business configuration instead. Check
live that the consent screen lists all 8 permissions. Disconnect the reviewer's Meta first so the grant starts fresh.

### Use-case text (paste into the review form)

**ads_read:** Komendly runs Facebook and Instagram lead ads for local service businesses as a managed service ("Ozzy's
AI marketing team"). The business owner connects their own ad account and authorizes a monthly ad budget limit; within
that limit Komendly creates, runs and pauses the ads. Every day we read ad-level insights (spend, impressions, clicks,
leads, cost per lead, ad status) for the ads Komendly created, and only those. We use them to keep the month's spend
under the owner's limit, pause ads that spend without bringing leads, and show the owner honest numbers on their
dashboard and in a weekly email. We never share this data.

**leads_retrieval:** When someone submits the instant form on an ad Komendly runs for a business, Meta sends a `leadgen`
webhook. We read that lead (name, email, phone if asked, ZIP and the answers to the business's questions) with the Page
token, store it once so the owner can see it on their dashboard and it is never sent twice, and email it within a
minute to the lead email the owner chose. Email to the owner only: Komendly never contacts the lead. Leads are deleted
180 days after receipt, or when the owner deletes them or their workspace.

**pages_manage_metadata:** When the managed service launches the owner's first campaign, Komendly subscribes our app to
the `leadgen` field of the Page the owner chose (POST /{page-id}/subscribed_apps). Without it no lead events reach us and
the owner's leads would not be delivered. We subscribe only the Page the owner selected, and only to `leadgen`.

### Screencast (one video covering all three)
1. Log in as the reviewer test account (Ad Department plan). Open `/ads/team`.
2. Connect Meta: show the consent screen listing ads_read, leads_retrieval and pages_manage_metadata; pick the ad account
   and Page.
3. Set ZIP codes, a monthly limit (e.g. $300) and the lead email; tick the authorization box (show the exact text).
4. Show the team page after launch: the campaign, the activity feed ("Launch & Budget Desk" lines), spend vs limit.
5. Graph API Explorer: GET /{page-id}/subscribed_apps shows Komendly with `subscribed_fields: leadgen`
   (pages_manage_metadata).
6. Lead Ads Testing Tool (developers.facebook.com/tools/lead-ads-testing): submit a test lead on the Page/form. Show the
   lead email inbox receiving "New lead from your Meta ad: <name>" within a minute, and the "New lead: <name> from <ZIP>"
   line on the dashboard (leads_retrieval).
7. Resubmit or let Meta retry: no second email, no second dashboard row.
8. Show Ads Manager's numbers for the Komendly ads next to the dashboard's spend/impressions/clicks/leads (ads_read).
9. Pause from the team page and show the campaign paused in Ads Manager.

### Webhook setup checklist (do before recording)
- [ ] App dashboard → Webhooks → object **Page** → callback URL `https://www.komendly.com/api/meta-webhooks/leadgen`,
      verify token = `META_WEBHOOK_VERIFY_TOKEN` (set in Vercel production env first; the GET handshake returns 403
      without it).
- [ ] Subscribe the Page object to field **`leadgen`**.
- [ ] `META_APP_SECRET` set in Vercel (POSTs without a valid `X-Hub-Signature-256` get 401).
- [ ] `LIFECYCLE_EMAIL_SECRET` set (alerts are skipped without an unsubscribe link) and AdsFeatureFlag
      `sys_lead_alerts` enabled (off = webhook accepted, nothing stored or sent).
- [ ] The Page is subscribed to the app (`subscribePageToLeadgen`, needs pages_manage_metadata); verify with
      GET /{page-id}/subscribed_apps.
- [ ] Meta's Webhooks "Test" button for `leadgen` returns 200.
