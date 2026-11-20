---
title: "How to Use ChatGPT to Create Facebook Ads: 2026 Guide"
slug: "how-to-use-chatgpt-to-create-facebook-ads"
description: "Learn how to use ChatGPT to create Facebook ads with practical prompts, image checks, a Komendly connector walkthrough, and clear publishing steps."
date: 2026-11-20
updated: 2026-11-20
author: "Nolan Grout"
type: "guide"
tags:
  - "ChatGPT"
  - "Facebook ads"
  - "AI ad creatives"
  - "Ad copywriting"
published: false
status: "draft"
primary_keyword: "how to use chatgpt to create facebook ads"
secondary_keywords:
  - "using chatgpt for facebook ads"
  - "can chatgpt create facebook ads"
  - "chatgpt facebook ads"
answer: "To use ChatGPT to create Facebook ads, supply business facts, request angles and copy, then generate images for review.[^1][^2] Alternatively, connect Komendly to create finished ad packs from a website URL inside ChatGPT, subject to account permissions.[^3] Review the files, then publish through Meta Ads Manager or use Komendly’s one-click Meta publishing on Growth and Scale."
key_takeaways:
  - "Build your brief from verified website facts, approved offers and real evidence."
  - "Choose an audience and angle before polishing individual headlines."
  - "ChatGPT can generate and edit images, including images in requested aspect ratios.[^2]"
  - "Komendly’s custom connector lets you make ad packs from a website URL, check status and download finished files."
  - "Review brand accuracy, exported files, destination and spending decisions before launch."
cta: "ads"
faq:
  - q: "Can ChatGPT create Facebook ads?"
    a: "Yes. ChatGPT can draft ad copy and creative concepts, while ChatGPT Images can generate and edit visuals.[^1][^2] Supply verified business facts, review the outputs and complete the publishing step separately."
  - q: "Can ChatGPT make ad images?"
    a: "Yes. ChatGPT Images supports text prompts, uploaded images for editing and requested aspect ratios.[^2] Provide approved references, then inspect the result for accurate branding, product appearance, spelling and dimensions."
  - q: "Can ChatGPT post ads to Facebook?"
    a: "ChatGPT can use write actions exposed by custom MCP servers, subject to permissions.[^3] Check whether your connected tool actually provides publishing. For this guide, use Meta Ads Manager or Komendly’s one-click Meta publishing on Growth and Scale."
  - q: "What ChatGPT access do I need for the connector route?"
    a: "As of November 2026, OpenAI documents full custom MCP support for ChatGPT Business and Enterprise/Edu on the web, subject to workspace permissions.[^3] Check your eligibility before setup."
  - q: "How many free ads can I make with Komendly?"
    a: "Komendly’s free trial includes 10 static ads + 1 animated ad, no card required. Email verification is required, and the trial is limited to one per website/device/network."
sources:
  - id: 1
    title: "ChatGPT for marketing teams"
    publisher: "OpenAI"
    url: "https://openai.com/academy/marketing/"
    accessed: 2026-11-20
  - id: 2
    title: "Images in ChatGPT"
    publisher: "OpenAI Help Center"
    url: "https://help.openai.com/en/articles/11084440-images-in-chatgpt"
    accessed: 2026-11-20
  - id: 3
    title: "Connecting custom MCP servers in ChatGPT"
    publisher: "OpenAI Help Center"
    url: "https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt"
    accessed: 2026-11-20
  - id: 4
    title: "Marketing API Reference"
    publisher: "Meta for Developers"
    url: "https://developers.facebook.com/docs/marketing-api/reference/v27.0/"
    accessed: 2026-11-20
  - id: 5
    title: "Graph API Reference: Ad"
    publisher: "Meta for Developers"
    url: "https://developers.facebook.com/docs/graph-api/reference/adgroup/"
    accessed: 2026-11-20
  - id: 6
    title: "Creating images with ChatGPT"
    publisher: "OpenAI"
    url: "https://openai.com/academy/image-generation/"
    accessed: 2026-11-20
  - id: 7
    title: "Brainstorming with ChatGPT"
    publisher: "OpenAI"
    url: "https://openai.com/academy/brainstorming/"
    accessed: 2026-11-20
  - id: 8
    title: "Connect and test your plugin"
    publisher: "OpenAI Developers"
    url: "https://developers.openai.com/plugins/deploy/connect-chatgpt"
    accessed: 2026-11-20
claims:
  - text: "ChatGPT can draft ad copy."
    source: 1
  - text: "ChatGPT can generate headline ideas and creative concepts."
    source: 1
  - text: "ChatGPT Images can generate new images and edit existing images."
    source: 2
  - text: "ChatGPT Images accepts text prompts and uploaded images for editing."
    source: 2
  - text: "ChatGPT Images supports generating images in a requested aspect ratio."
    source: 2
  - text: "Users can download generated images from ChatGPT."
    source: 2
  - text: "ChatGPT image edits can extend beyond the selected area."
    source: 2
  - text: "ChatGPT can propose angles and group ideas into themes."
    source: 7
  - text: "OpenAI recommends adding constraints and separating idea generation from evaluation when brainstorming with ChatGPT."
    source: 7
  - text: "OpenAI recommends specifying an image’s subject, purpose, visual style and constraints, including what should remain unchanged during edits."
    source: 6
  - text: "As of November 2026, OpenAI documents full custom MCP support for ChatGPT Business and Enterprise/Edu on the web."
    source: 3
  - text: "As of November 2026, OpenAI describes Pro custom MCP access as read/fetch only."
    source: 3
  - text: "Account and workspace permissions apply to custom MCP connections in ChatGPT."
    source: 3
  - text: "ChatGPT can use write actions exposed by custom MCP servers, subject to permissions."
    source: 3
  - text: "OpenAI documents adding a custom MCP server from ChatGPT Plugins using the plus button and Add custom MCP server."
    source: 8
  - text: "OpenAI’s setup instructions include creating the connection and reviewing discovered tools."
    source: 8
  - text: "OpenAI’s testing instructions include installing the resulting plugin, starting a new conversation and selecting the plugin with an @ mention."
    source: 8
  - text: "Meta identifies Ads Manager as a tool for creating ads."
    source: 5
  - text: "A Meta campaign defines the advertising objective."
    source: 4
  - text: "A Meta ad set groups ads that share budget, schedule and targeting."
    source: 4
  - text: "A Meta ad creative defines the ad’s appearance and content."
    source: 4
  - text: "Meta documents that newly created ads enter a pending state and require approval before running."
    source: 5
---

Give ChatGPT a factual business brief, ask for distinct Facebook ad angles and copy, then generate images or use a connected creative tool to make the files. ChatGPT supports ad-copy drafts and image creation.[^1][^2] Review the assets before publishing. Below, you’ll follow a prompt-only workflow first, then use Komendly’s custom connector to create finished ad packs from a website URL.

## Can ChatGPT create Facebook ads?

Yes. OpenAI documents ad-copy drafting, headline ideas and creative concepts as ChatGPT marketing uses.[^1] ChatGPT Images can also generate and edit images.[^2] For this guide, separate the work into three deliverables:

- **Message:** the audience, angle, hook, offer and call to action.
- **Creative:** the actual image or animated file you will use.
- **Campaign:** the publishing setup and spending decisions.

Keep those deliverables separate in your brief. Approving a headline should not count as approving an image, budget or launch.

I’m Nolan Grout, founder of Komendly, so the connector example below uses my product. My recommendation: start with prompts if you want to explore messaging; choose the connector route when your immediate goal is turning your website into finished ad creatives.

## What should you give ChatGPT before writing Facebook ads?

### Step 1: Write a brief that contains only verified facts

Start using ChatGPT for Facebook ads with a source sheet. Include your landing-page copy, actual offer, intended customer, brand voice and available evidence. Paste the relevant text so the assignment has explicit inputs.

Use this prompt:

*Help me prepare a Facebook ad brief. Use only the business facts below. Identify the audience, offer, customer problem, approved evidence and intended next action. List missing information separately. Do not invent discounts, results, reviews, guarantees or product capabilities. Business facts: [paste approved website copy and offer details].*

Then correct the brief yourself. Mark assumptions as assumptions and remove invented advantages before requesting creative work.

For a running example, imagine a fictional bicycle repair shop. Its approved facts are mobile repairs, online appointment requests and a named service area. Its proposed message is convenience. Unless supplied, same-day availability, repair prices and customer ratings stay out of the ads.

Add brand instructions with concrete examples:

*Use straightforward, helpful language. Prefer “Book a bike repair” to “Transform your cycling experience.” Avoid pressure, exaggerated promises and technical jargon. The next action is requesting an appointment.*

That gives the next prompts a clear standard for evaluating the writing.

## How do you turn the brief into angles, hooks and copy?

### Step 2: Choose the customer’s starting point

Choose an awareness stage for this exercise: unaware, problem aware, solution aware, product aware or most aware. Use our [awareness-stage ad examples](/blog/awareness-stages-ad-examples) to work through the messaging options.

For the fictional repair shop, try these starting points:

- **Problem aware:** focus on the inconvenience of arranging a repair.
- **Solution aware:** introduce mobile bicycle repair as an option.
- **Product aware:** explain the shop’s service area and appointment process.

These are proposed creative directions, not findings about actual customers.

Ask for angles before sentences:

*Using the approved brief, propose three distinct angles for a problem-aware customer. For each, identify the customer situation, central message, evidence needed and a possible visual. Reject any angle that depends on an unsupported claim.*

ChatGPT can propose angles and group ideas into themes; OpenAI recommends adding constraints and separating idea generation from evaluation.[^7]

Choose the direction that best matches your offer. Do not ask the model to predict a winning ad without campaign evidence.

### Step 3: Write the copy around one chosen angle

Now request a specific output:

*For the convenience angle, write three Facebook ad drafts. Give each a hook, primary text, headline and call to action. Keep the message focused on requesting a mobile bike repair appointment. Use only the approved facts. Label each draft by the idea it tests. Explain any assumption separately.*

Treat length instructions as your writing preferences. For example, ask for a short opening and a brief headline, then review the actual presentation later.

A hypothetical draft might read:

**Hook:** Bike repair without the shop trip.

**Primary text:** Request a mobile bicycle repair appointment in [approved service area]. Choose your preferred time when you contact us.

**Headline:** Request a mobile bike repair.

Only keep the scheduling sentence if it matches the business’s real appointment process. That check matters more than how polished the sentence sounds.

Finish with an editorial pass:

*Audit these drafts against the approved brief. Identify unsupported claims, unclear wording and mismatches with the landing page. Suggest revisions, but do not add new facts.*

My editing rule: keep the strongest concrete detail and delete any sentence that could advertise almost any business.

## Can ChatGPT make ad images?

Yes. ChatGPT Images accepts text prompts and uploaded images for editing, supports requested aspect ratios and lets you download generated images.[^2] The prompt-only route can therefore include the visual asset.

### Step 4: Generate a visual, then inspect the actual file

Prepare a product photo, logo or other approved reference. OpenAI recommends specifying the subject, purpose, visual style and constraints, including what should remain unchanged during edits.[^6]

Try this image brief:

*Create an ad image for the fictional mobile bicycle repair business in the approved brief. Show a bicycle being repaired outside a home. Use the attached reference for the bicycle’s appearance. Keep the composition simple, with room for a short headline. Use our approved brand colors. Do not add prices, ratings, badges or extra services. Make a 4:5 version.*

Then ask for separate 1:1 and 9:16 versions if those are part of your creative plan. These are requested deliverables, not a claim that every placement accepts every file.

For placement specifications, consult our [Facebook and Instagram ad sizes guide](/blog/facebook-instagram-ad-sizes).

Inspect the logo, product appearance, spelling, composition and exported dimensions yourself. Ask for targeted changes instead of rewriting the entire brief. OpenAI notes that image edits can extend beyond the selected area.[^2]

The practical limitation is the review work. My recommendation is to treat brand fidelity and sizing as acceptance checks, even when the image looks convincing at first glance. You still need to decide whether each file represents your actual business accurately.

For strict brand requirements, keep approved assets available for final assembly and compare the result against them. A generated image deserves the same review as any other creative draft.

## How do you create finished ads inside ChatGPT with Komendly?

### Step 5: Connect the creative tool and request an ad pack

Komendly turns a website URL into on-brand, ready-to-run static and animated ad creatives through Ozzy, its AI ad wizard. Its ad sizes are 4:5, 1:1 and 9:16, and it supports all 5 awareness stages.

Through the assistant connection, you can make an ad pack from a website URL, check its status and download finished files. The connection uses the same Komendly account, plan and credits as the web app.

**Check ChatGPT access first.** As of November 2026, OpenAI documents full custom MCP support for ChatGPT Business and Enterprise/Edu on the web, and Pro custom MCP access as read/fetch only. Workspace permissions apply.[^3] Check your eligibility before attempting creative generation.

For an eligible account:

1. Open ChatGPT’s Plugins interface and choose the plus button, then Add custom MCP server.[^8]
2. Enter Komendly’s endpoint: `https://www.komendly.com/api/mcp`.
3. Choose OAuth and complete sign-in on komendly.com. The assistant never sees your password.
4. Create the connection, review the discovered tools and install the resulting plugin. Start a new conversation and select it with an @ mention.[^8]
5. Request the pack, then check status and download the completed files.

Use the [Komendly ChatGPT integration guide](/integrations/chatgpt) for setup. Komendly is a custom connector; it has been submitted to the ChatGPT app directory but is not listed yet.

Start with a request that stays within the documented ad-pack workflow:

*Use Komendly to make an ad pack from [my website URL]. Show me the status and provide download links when the finished files are ready.*

Keep your approved messaging brief nearby for review. Do not assume every instruction in a chat is a supported tool input; inspect what the connected tool actually offers.

Komendly’s free trial includes **10 static ads + 1 animated ad, no card required**. Email verification is required, and the trial is limited to one per website/device/network. You can also use the [free ad studio](/) directly.

Choose this route when website-to-creative production is the immediate job. Stay with the prompt-only route when you mainly want to debate angles, revise existing copy or develop a visual direction yourself. For a broader URL workflow, see [how to make Facebook ads from website URLs](/blog/make-facebook-ads-from-website).

## Can ChatGPT post ads to Facebook?

ChatGPT can use write actions exposed by custom MCP servers, subject to permissions.[^3] For this walkthrough, publish through Meta Ads Manager. Check the actual connected tool list before expecting an assistant to publish anything.

Komendly offers one-click publish to Meta on Growth and Scale plans. See [pricing](/pricing) for plan details. The assistant workflow described here covers creating packs, checking status and downloading files; use that workflow to prepare your assets.

For a manual launch, organize the setup around Meta’s campaign structure: the campaign defines the objective, the ad set groups budget, schedule and targeting, and the creative defines the ad’s appearance and content.[^4]

Before submitting:

- Choose the business outcome you intend to measure.
- Confirm the destination URL and the offer on that page.
- Add the approved creative and matching copy.
- Review presentation, audience, spending settings and schedule.
- Check the submitted ad’s status before calling the launch complete.

Meta documents that newly created ads enter a pending state and require its approval before running.[^5] Treat file creation, submission and delivery as separate checkpoints.

## How can you check whether your ads are ready to test?

Use my **BRIEF-to-Launch checklist**. This is an editorial review method, not a performance prediction or a platform requirement.

| Check | Question to answer before launch |
| --- | --- |
| B — Business truth | Can I trace every promise to an approved business fact? |
| R — Reader | Have I chosen a specific customer situation and awareness stage? |
| I — Idea | Does this ad communicate one clear angle? |
| E — Evidence | Have I removed claims I cannot support? |
| F — Format | Have I inspected each exported file and its presentation? |
| Launch | Have I checked destination, spending settings and submission status? |

Require a clear answer for every row. If the format check fails, revise the file. If the evidence check fails, revise the claim. Avoid using attractive design as a reason to overlook an inaccurate promise.

For your first test, write down the question each creative should help answer. For example: “Does convenience or service clarity produce more appointment requests?” Keep other decisions as consistent as practical so the comparison remains interpretable.

After launch, record the creative, offer, dates, spend and relevant business outcome together. Resist rewriting everything after an isolated result. If you suspect creative fatigue, compare the message and visual with your earlier versions before deciding what to change.

The useful finish line for this workflow is a reviewed creative with a clear test purpose, a verified destination and an intentional launch decision.
