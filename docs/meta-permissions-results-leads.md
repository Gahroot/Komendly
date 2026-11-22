# Meta App Review: weekly results + instant lead alerts

Features: weekly "Are my ads working?" report (`sys_meta_results`) and instant lead alerts (`sys_lead_alerts`).
Code: `src/lib/ads/results/`, `engine/src/growth/meta-results.ts`, `src/lib/ads/leads/`, `src/app/api/meta-webhooks/leadgen/route.ts`.
Both are off until their AdsFeatureFlag is enabled. Komendly only reads data for ads it published for the customer.

Env needed: `META_APP_SECRET` (signature check), `META_WEBHOOK_VERIFY_TOKEN` (GET handshake), `ADS_TOKEN_KEY`, `LIFECYCLE_EMAIL_SECRET`.
Webhook URL for the app's Page subscription (field `leadgen`): `https://www.komendly.com/api/meta-webhooks/leadgen`.

## ads_read

**Use case text:** Komendly creates ads in the business owner's own ad account. Each week we read the last 7 days of ad-level insights for those ads only: spend, impressions, link clicks, CTR, leads and cost per lead, plus each ad's status. We show these numbers in plain English on the owner's Komendly dashboard and in their weekly email, along with which ads stayed on and which were swapped out. We do not change anything with this permission, and we do not share the data.

**Screencast:**
1. Log in to Komendly as a test Ad Department customer and open the dashboard.
2. Show the Meta connection (ad account and page already chosen) and the ads Komendly published to it.
3. Show those ads in Meta Ads Manager with their spend, impressions and clicks for the last 7 days.
4. Back in Komendly, show the "Are my ads working?" box on the Ozzy Autopilot card. Point out that its spend, views, clicks and leads match Ads Manager, and show the kept/swapped lines.
5. Show the weekly email with the same section.

## leads_retrieval

**Use case text:** When someone submits the instant form on an ad Komendly runs for a business, Meta sends us a `leadgen` webhook. We read that one lead (name, email, ZIP and the answers to the business's qualifying questions) with the Page token, and within a minute we email it to the business owner who connected the Page (or the lead email they set for Komendly's marketing team service). We send an email only: Komendly never calls or texts the lead. Each lead is stored once (so the owner can see it on their dashboard and it is never emailed twice) and deleted 180 days after receipt, or right away when the owner deletes it. The lead stays in Meta's Leads Center.

**Screencast:**
1. Show the connected Page in Komendly (test business).
2. Open Meta's Lead Ads Testing Tool (developers.facebook.com/tools/lead-ads-testing), choose the Page and form, and submit a test lead.
3. Show the owner's inbox: "New lead from your Meta ad: <name>" arrives within a minute with the answers (homeowner, timeline, ZIP, service needed).
4. Submit the same test again, or have Meta retry it, and show that no second email arrives.
5. Click "Open Leads Center" in the email to show the same lead in Meta.

## pages_manage_metadata

**Use case text:** We need this so Komendly's app can subscribe the business owner's Page to the `leadgen` webhook field (POST /{page-id}/subscribed_apps). Without it, no lead events are delivered and we can't send the instant lead alerts described above. We subscribe only to `leadgen` on Pages the owner chose in Komendly.

**Screencast:**
1. In Komendly, connect Meta and pick the Page in the connect flow.
2. Show (in Graph API Explorer, GET /{page-id}/subscribed_apps) that the Komendly app is now subscribed with `subscribed_fields: leadgen`.
3. Continue with the leads_retrieval test lead above to show the alert arriving.

## Requesting the scopes before approval

`GRAPH_SCOPES` (`src/lib/ads/meta/core/oauth.ts`) is exactly the first, pending submission. The three permissions above
are added per environment with `META_EXTRA_SCOPES=ads_read,leads_retrieval,pages_manage_metadata` (comma list, read on
each connect, appended to the `scope` of the OAuth dialog). This only applies when `META_LOGIN_CONFIG_ID` is unset: with a
Facebook Login for Business configuration the permissions come from that configuration, so add them there instead.
Until App Review #2 is approved only app-role users (admins, developers, testers) can grant them. Owners who connected
before the scopes were added must reconnect Meta to grant them.

## Lead storage (MetaLead)

Each lead is created in `MetaLead` before any email (`leadgenId` unique, so a replayed webhook stops there). The email
sets `notifiedAt`; if sending fails it is reset to null and Meta's retry sends it without a second row. Team-service
pages (a `MarketingMandate` with this `pageId`) also get a Lead Desk `MarketingAction` (`lead:<leadgenId>`) and, once per
workspace, the `team_first_lead` AdsEvent. Retention: `purgeOldLeads(now, db)` in `src/lib/ads/leads/retention.ts`
(engine: `engine/src/jobs/lead-retention.ts`).

## Notes for the coordinator
- The Page subscription call is `subscribePageToLeadgen` (`src/lib/ads/leads/alert.ts`); it needs `pages_manage_metadata` and must be called at team launch (prd.md R6). Not wired yet (as of 2026-11-22): that belongs to the launch code.
- Lead-form questions for the publish code: `leadFormQuestions(niche)` in `src/lib/ads/leads/questions.ts`.
