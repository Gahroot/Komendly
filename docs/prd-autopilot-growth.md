# PRD: Autopilot Growth

## Goal

Komendly finds, converts and keeps paying customers on its own. New acquisition systems, abandoned-checkout recovery and churn win-back run unattended in production, and each paying customer is traced to the system that brought them in. Results show on one admin dashboard. The founder's only job is to open it and see today's paying customers.

## Why

- Meta ads are the only acquisition channel. They have cost about $395 for about 52 sign-ups and $0 revenue.
- 22 people downloaded free ads and 0 paid. 3 people abandoned a $97 checkout and nobody followed up.
- The founder can't do calls, onboarding, setup work or inbox checking. Growth that needs the founder's time doesn't scale and won't happen.
- Each system has to keep working after it's built, without being run again by hand.

## Who it serves

- **Small business owners** who need ads and customers. They're mostly non-technical, find tools through search, AI assistants, app stores, email and word of mouth, and buy self-serve.
- **The founder**, who wants proof that the business is growing without being involved in it.

## What it must accomplish

### Acquire: new channels that bring in buyers without ad spend

1. **Free tools:** people searching for help with ads find free, no-signup tools that give real value and lead them into Komendly.
2. **AI assistants:** people asking ChatGPT or Claude to make ads can use Komendly from inside the assistant.
3. **Industry ad examples:** people looking for ad ideas in their industry find real examples and can make their own from their website.
4. **Free output spreads Komendly:** every free ad or video someone shares brings new visitors back. Paying customers can remove the branding.
5. **Review-video gifts:** businesses get a personal, unrequested gift made from their own public customer reviews. The gift shows Komendly's value before any ask.
6. **New-business timing:** businesses are reached within days of their new website going live, when they most need customers.
7. **Shopify App Store:** store owners can find and use Komendly there.

### Convert and keep

8. **Abandoned checkouts:** anyone who starts a checkout and doesn't finish is followed up until they buy, say no, or opt out.
9. **Churn and failed payments:** customers who cancel or whose payments fail are recovered or won back over time.

### See it

10. **Money dashboard:** one admin view answers these questions:
    - How many paying customers today, this week and in total?
    - How much revenue, and how much recurring revenue?
    - Which system produced each lead, trial and paying customer?
    - What does each paying customer cost per channel, including Meta?
    - How many checkouts were recovered, and how many customers were lost or won back?
    - Is every system healthy and running?
11. **Alerts:** the founder gets an alert when a new customer pays and when a system breaks or stops producing results.

## Requirements for every system

- **Zero founder work.** Every system runs on a schedule or a trigger, writes its own content, sends its own messages and recovers from its own errors. If something truly needs a person (an account sign-up, a payment, a legal acceptance), ask the founder once, with exact steps.
- **Traceable.** Every visitor, sign-up and payment can be traced to its source system.
- **Self-serve only.** No calls, demos, done-for-you setup or human onboarding.
- **No approval-heavy dependencies.** Nothing that relies on Meta app review or customers' ad-account setup. Prefer channels that can go live without third-party gatekeeping. Where a light review is unavoidable (an app directory, an app store), the system handles the submission itself.
- **Real value first.** Every touch gives something useful before it asks for anything.
- **Legal and reputation-safe.** Outreach follows email and privacy law, honors opt-outs immediately, and never spams, scrapes in ways a platform forbids, impersonates, or risks domain or account bans. Customer data stays private.
- **Spend is capped.** Any system that spends money has a hard cap the founder sets. AI can never raise a cap.
- **Kill switch.** Each system can be turned off on its own from the admin panel.
- **Doesn't break what works.** Existing billing, sign-up, cold email, lifecycle email, Studio, the CLI and agent access keep working. Shared database changes ship safely across every service.
- **Replies come in.** Any reply to any outreach lands in the existing admin inbox.

## Out of scope

- Publishing ads to customers' Meta accounts, or any ad-account setup for them.
- Calls, onboarding or done-for-you services.
- Phone and SMS outreach.
- Faceless social channels, forum or Reddit posting, gig marketplaces, Product Hunt-style launches, and new ad platforms.
- New Ozzy Studio features, unless a system above needs them.

## Success metrics

- **North star:** new paying customers per day, and cost per paying customer.
- **Per channel:** visitors, then sign-ups, then free ads made, then checkouts, then paid customers.
- **Recovery:** the share of abandoned checkouts that convert, and of churned or failed-payment customers that come back.
- **Autonomy:** founder hours per week spent operating growth. The target is zero.

## Definition of done ("running")

A system counts as running only when all of these are true:

- It's live in production on the real domain and real data.
- It has run on its own over several cycles with no manual trigger.
- It has produced at least one traced result (a lead, sign-up or recovery) that shows on the dashboard.
- Its health and output show on the dashboard, and a failure produces an alert.
- It's been tested end to end, and the existing test suites still pass.
- It can be switched off from admin.

The whole project is done when every system above is running, and the dashboard shows the full funnel and today's paying customers without the founder doing anything.

## Priority

The order is set by expected paying customers per unit of effort, and checked against dashboard data as results come in:

1. Abandoned-checkout recovery, the money dashboard and payment alerts
2. Free tools, plus industry ad examples
3. AI assistant availability
4. Branding on free output
5. Review-video gifts and new-business timing
6. Churn and failed-payment win-back
7. Shopify App Store
