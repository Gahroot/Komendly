// Search vocabulary for programmatic pages (tools + ad example galleries). Pure data, no imports beyond industries.
// One page per distinct INTENT (key); synonyms and slang never get their own URL: they feed titles/H1 variants,
// the "Also called" line, intros, FAQ (+ FAQ JSON-LD), image alt text, internal anchor text and llms.txt.
//
// Drop-in point for the researcher's PAGE PLAN (ad-vocabulary.md): add or extend entries in TOOL_VOCAB / FORMAT_VOCAB /
// PLATFORM_VOCAB / OCCASION_VOCAB, or patch any key via VOCAB_OVERRIDES (merged last). New format/platform/occasion
// entries automatically become pages (src/lib/growth/ad-pages.ts) and get engine-generated samples; nothing else to edit.
import { INDUSTRIES, type Industry } from "../ads/industries";

export type VocabKind = "tool" | "format" | "platform" | "occasion" | "industry" | "combo";
export interface VocabFaq { q: string; a: string }

export interface VocabEntry {
  /** `<kind>:<slug>` (one per intent). */
  key: string;
  kind: VocabKind;
  slug: string;
  /** The main query this page answers, as people type it. */
  primaryQuery: string;
  /** Page <title> (root template adds " | Komendly"). */
  title: string;
  h1: string;
  /** Same-intent names people search ("tagline generator" for slogan generator). */
  synonyms: string[];
  /** Everyday / slang / "simple version" phrasing. */
  slang: string[];
  /** 1-2 sentences, specific to this intent. */
  intro: string;
  /** Specific, practical guidance for this page (specs, rules, what to do). */
  guidance: string[];
  /** Questions phrased the way people ask them. */
  faq: VocabFaq[];
}

type Raw = Omit<VocabEntry, "key" | "kind">;
const mk = (kind: VocabKind, list: Raw[]): VocabEntry[] => list.map((r) => ({ ...r, key: `${kind}:${r.slug}`, kind }));

// ------------------------------------------------------------------------------------------------ tools

export const TOOL_VOCAB: VocabEntry[] = mk("tool", [
  { slug: "ad-maker", primaryQuery: "free ad maker", title: "Free Ad Maker: AI Ads From Your Website, No Watermark", h1: "Free ad maker: paste your website, get finished ads",
    synonyms: ["free ad maker ai", "ad maker website", "ad creator website", "ai ad generator from website", "free ad maker for social media"], slang: ["ad maker without watermark", "free ad maker for business"],
    intro: "No design app, no templates to fill in: paste your website link and Ozzy, Komendly's AI ad creator, reads your brand, photos and offers and makes ready-to-post Facebook and Instagram ads. Free, no watermark, no card.",
    guidance: ["Use the page that best shows what you sell (your homepage or one product/service page); Ozzy uses its photos, colours and wording.", "You get 10 image ads in feed and Stories sizes plus an animated one, so you can test several angles at once.", "Edit any headline before downloading; the ads stay yours to post anywhere."],
    faq: [{ q: "Is there a free ad maker without watermark?", a: "Yes. The 10 image ads you make here download without a watermark." }, { q: "Can AI make an ad from my website?", a: "Yes. Ozzy reads your site for your brand colours, photos, offers and wording, then designs ads around them." }] },
  { slug: "ad-copy-generator", primaryQuery: "ad copy generator", title: "Free Ad Copy Generator for Facebook, Meta & Google Ads", h1: "Ad copy generator: Facebook, Meta and Google ad text",
    synonyms: ["ad text generator free", "ad copy maker", "facebook ad copy generator", "google ad copy generator", "meta ad copy generator", "headline generator free", "headline generator ai"], slang: ["advertising text generator", "write my facebook ad"],
    intro: "Stuck on what to write? Describe your business in a sentence or two and get ad text you can paste straight in: Facebook and Instagram headlines, primary text and scroll-stopping first lines, or Google search ad headlines that fit the 30-character limit.",
    guidance: ["Specifics (town, price, speed, years in business) give sharper copy than adjectives.", "Test at least three headlines against each other; keep the winner and rewrite the losers.", "Put the benefit in the first 40 characters: that is all mobile feeds show of a Facebook headline."],
    faq: [{ q: "How do I write facebook ad text?", a: "Open with a line that names the customer's problem or wish, add one specific proof point, and end with one clear action. Keep the important part inside the first 125 characters, before 'See more'." }, { q: "Can it write Google Ads headlines too?", a: "Yes. Pick Google in the form and you get headlines of 30 characters or fewer and descriptions under 90, the limits Google enforces." }] },
  { slug: "ad-copy-grader", primaryQuery: "ad copy grader", title: "Free Ad Copy Grader: Score Your Facebook Ad Text", h1: "Ad copy grader: score your ad before you pay for it",
    synonyms: ["facebook ad copy checker", "ad copy analyzer", "ad text score"], slang: ["is my ad any good", "rate my facebook ad"],
    intro: "Wondering if your ad is any good? Paste the headline and text you were about to publish and get a score out of 100 with the exact lines to fix before you spend money.",
    guidance: ["Fix red items in order of points: hook and call to action matter more than tone.", "Grade each variant separately; a 90 and a 60 in the same ad set tells you where budget should go.", "Re-grade after edits: most ads gain 20+ points from a shorter first line."],
    faq: [{ q: "How do I know if my Facebook ad is good?", a: "Before launch: a clear hook in the first line, one specific benefit and one call to action. After launch: compare click-through rate and cost per result against your other ads." }] },
  { slug: "ad-size-guide", primaryQuery: "what size is a facebook ad", title: "What Size Is a Facebook Ad? Ad Sizes for Facebook, Instagram, TikTok (2026)", h1: "What size is a Facebook ad? Every ad size in one guide",
    synonyms: ["what size should a facebook ad image be", "facebook carousel ad size", "instagram ad size 2026", "tiktok ad sizes", "instagram story ad safe zone", "google business post image size", "nextdoor ad specs", "facebook ad size checker"], slang: ["facebook advert size", "facebook ad post size", "will my picture fit a facebook ad", "why is my ad image cut off"],
    intro: "The right picture size for a Facebook ad post, Instagram Story, TikTok, Google Business post or Nextdoor ad, platform by platform. Then drop in your own image to see how each placement will crop it.",
    guidance: ["Design at 1080x1350 (4:5) for feeds and 1080x1920 (9:16) for Stories and Reels.", "Keep logos and text out of the top 14% and bottom 20% of vertical images (the Story safe zone).", "Upload separate crops per placement instead of letting the platform auto-crop one image."],
    faq: [{ q: "What size is a facebook ad image?", a: "1080x1350 pixels (4:5) is best for the feed; 1080x1080 (1:1) works everywhere; 1080x1920 (9:16) for Stories and Reels." }, { q: "What size is best for a facebook ad?", a: "4:5 vertical (1080x1350) takes the most room in the mobile feed, so it usually gets noticed most. Add a 9:16 version for Stories." }, { q: "What size is a facebook carousel ad?", a: "1080x1080 (1:1) per card, 2 to 10 cards, all the same ratio." }] },
  { slug: "ad-budget-calculator", primaryQuery: "ad budget calculator", title: "Ad Budget Calculator: Ad Spend, CPC & ROAS (Facebook, Google, TikTok)", h1: "Ad budget calculator: what will my ad spend get me?",
    synonyms: ["ad spend calculator", "facebook ad budget calculator", "ad budget calculator meta", "google ads budget calculator", "tiktok ad budget calculator", "roas calculator", "cpc calculator"], slang: ["advertising budget calculator", "are my ads making money"],
    intro: "Work out your advertising budget in plain numbers: how many clicks a daily spend buys, how many sales that makes, and whether you are above break-even. Works for Facebook, Google and TikTok ads alike.",
    guidance: ["Use your real margin, not revenue: break-even ROAS is 1 divided by margin.", "If you don't know your conversion rate yet, try 1%, 2% and 4% to see the range.", "Budget for learning: give each new ad enough spend for about 50 clicks before judging it."],
    faq: [{ q: "How much should I spend on facebook ads?", a: "Start with what buys about 50 clicks per ad per week (at a $1 cost per click, around $7 a day per ad), then scale only the ads whose cost per sale is under your break-even." }] },
  { slug: "ad-character-counter", primaryQuery: "ad character counter", title: "Ad Character Counter & Limits: Facebook, Google, TikTok", h1: "Ad character counter for every platform",
    synonyms: ["facebook ad character limit", "google ads character counter", "tiktok ad text length", "ad text length checker"], slang: ["is my ad text too long", "how long can my ad be"],
    intro: "Is your ad text too long? Each platform cuts it at a different point. Check every field against the real limit for the platform you are publishing to.",
    guidance: ["Google Ads rejects text over its limits; Meta and LinkedIn accept it but hide it behind 'See more'.", "Put the offer and call to action inside the visible part, not after the cut.", "Emoji count as one character each here, the way the platforms count them."],
    faq: [{ q: "How long can a facebook ad be?", a: "Primary text can run to thousands of characters, but only about 125 show before 'See more', so the hook and offer must fit there." }] },
  { slug: "slogan-generator", primaryQuery: "slogan generator", title: "Free Slogan Generator for Business (Taglines Too)", h1: "Slogan generator for your business",
    synonyms: ["slogan generator for business", "tagline generator for business", "free slogan generator for business", "tagline generator free"], slang: ["slogan generator no ai", "catchy line for my business"],
    intro: "Need a catchy line for your sign, van, bio or ad? Describe what your business does and get short slogans and taglines in a few different voices, written from what you actually sell.",
    guidance: ["Say it out loud: a slogan that trips your tongue won't stick in anyone's head.", "Under 8 words, about the customer's gain, not your company.", "Try your favourite on a real ad headline before printing it anywhere."],
    faq: [{ q: "What's a good slogan for my business?", a: "One that says what the customer gets in under 8 words and is easy to repeat. Generate a few, read them aloud, and test the best one as an ad headline." }, { q: "Is there a slogan generator without AI?", a: "This one uses AI to draft, but treat every line as a starting point: the best slogans are usually a draft you rewrite in your own words." }] },
  { slug: "hook-generator", primaryQuery: "hook generator", title: "Hook Generator for TikTok & Instagram: Scroll-Stopping Hooks", h1: "Hook generator: scroll-stopping first lines",
    synonyms: ["hook generator for tiktok", "hook generator for instagram", "hook generator ai", "ad hook generator"], slang: ["scroll stopping hooks", "thumb stopping", "scroll stopping ads"],
    intro: "The first line or first second decides if anyone sees the rest. Get scroll-stopping (some say thumb-stopping) hooks for TikTok, Reels and Facebook ads in several styles, so you can test which one makes your buyers stop.",
    guidance: ["Say the hook out loud and show it as on-screen text at the same time: many people watch muted.", "Test hooks, not whole new ads: keep the body, swap the first line.", "A hook that sorts people out ('Only for dog owners in Austin') often beats a broad one."],
    faq: [{ q: "What is a scroll stopping hook?", a: "The opening line, image or first 1-3 seconds of a post or ad that makes the right person pause instead of scrolling past." }, { q: "What does thumb stopping mean?", a: "Same idea: content that makes someone's thumb stop mid-scroll. Advertisers say 'thumb-stopping creative' for ads that win that first second." }] },
  { slug: "caption-generator", primaryQuery: "caption generator for instagram", title: "Caption Generator for Instagram & TikTok Business Posts", h1: "Caption generator for Instagram and TikTok posts",
    synonyms: ["caption generator for tiktok", "caption generator for photo", "scroll stopping captions"], slang: ["what to write under my post", "caption for my product photo"],
    intro: "Not sure what to write under your photo? Say what the post is about and get three captions, each opening with a line that earns the 'more' tap and closing with what to do next.",
    guidance: ["The first line is the caption; the rest is for people who already care.", "End with one clear action: comment, book, visit, tap the link in bio.", "Rotate caption styles (question, story, list) so your feed doesn't read like one template."],
    faq: [{ q: "How long should an Instagram caption be?", a: "The first line matters most: only about 125 characters show before 'more'. After that, length is fine if every line earns its place." }] },
  { slug: "cta-generator", primaryQuery: "cta generator", title: "CTA Generator: Call to Action Words & Ad Buttons", h1: "CTA generator: the right button and call-to-action words",
    synonyms: ["cta generator ai", "cta button generator", "cta words", "call to action examples"], slang: ["what to put on the ad button", "which button should my ad have"],
    intro: "What should the ad button say? Pick your goal and platform and get the button that matches it, plus call-to-action words that say the same thing in your text.",
    guidance: ["The button promise must match the landing page: 'Book Now' needs a booking page.", "Use one action per ad; two asks halve the clicks on both.", "Repeat the action in the text in your own words, since the button itself can't be customised on Meta."],
    faq: [{ q: "How do I write a CTA?", a: "Start with a verb, say exactly what happens next and, if you can, why now: 'Book your free quote this week'. Keep it to one action." }] },
  { slug: "hashtag-generator", primaryQuery: "hashtag generator for small business", title: "Hashtag Generator for Small Business (Instagram & TikTok)", h1: "Hashtag generator for small businesses",
    synonyms: ["instagram hashtag generator", "tiktok hashtag generator", "local hashtags"], slang: ["what hashtags should i use", "hashtags for my shop"],
    intro: "What hashtags should you use? A short, balanced set beats a wall of thirty: one or two local, a couple of niche and one broad, built from your business and your town.",
    guidance: ["Use 3-5 relevant hashtags on organic posts; Instagram recommends few and specific.", "Local tags (#leedsbakery) reach people who can actually visit you.", "Leave hashtags out of paid ads: delivery is set by targeting, and tags pull clicks off your link."],
    faq: [{ q: "How many hashtags should I use on Instagram?", a: "3 to 5 relevant ones. Instagram itself recommends a few specific hashtags over a wall of 30." }] },
  { slug: "testimonial-generator", primaryQuery: "testimonial generator", title: "Testimonial Generator: Turn Real Reviews Into Ads (Free)", h1: "Testimonial generator for real customer reviews",
    synonyms: ["testimonial image generator", "ai video testimonial generator free", "testimonial video template", "ugc ads generator"], slang: ["ugc ads", "testimonial video examples", "make an ad from a customer review"],
    intro: "Paste a review a real customer actually wrote and get testimonial quotes and ad text built only from their words. This tool does not invent reviews: made-up testimonials are deceptive and banned by the FTC and ad platforms.",
    guidance: ["Use real reviews only, with the customer's permission where the platform's terms require it.", "Pick reviews that mention a specific result or moment, not just 'great service'.", "Never edit a quote so it says something the customer didn't say."],
    faq: [{ q: "What is a testimonial video?", a: "A short video where a customer's real words about your business are the message, either filmed by the customer or turned into a video from their written review." }, { q: "What are UGC ads?", a: "User-generated-content ads: ads that look like a real customer's post or review rather than a polished brand ad. They work because they feel honest, so they must be honest." }, { q: "Can I make fake testimonials?", a: "No. Invented reviews break FTC rules and Meta and Google ad policies. This tool only reworks a review you paste." }] },
  { slug: "google-review-reply-generator", primaryQuery: "google review reply generator", title: "Google Review Reply Generator (5-Star & Negative Reviews)", h1: "Google review reply generator",
    synonyms: ["google review reply sample", "google review reply for 5 star", "google review reply message", "reply to negative review"], slang: ["what to say to a bad review", "how to answer a 1 star review"],
    intro: "Not sure what to say back? Paste a Google review, good or bad, and get calm, specific owner replies. The next customer reads your reply more than the reviewer does.",
    guidance: ["Reply within a day or two; speed reads as care.", "Mention one detail from the review so it doesn't sound copy-pasted.", "For complaints: thank, apologise for the experience, and move it offline with a name or number."],
    faq: [{ q: "How do I reply to a 5 star Google review?", a: "Thank them by name, mention the specific thing they liked, and invite them back. Two or three sentences is plenty." }] },
  { slug: "promo-ad-generator", primaryQuery: "promo ad generator", title: "Promo Ad Text Generator: Sale, Grand Opening & Holiday Ads", h1: "Promo ad generator for sales, openings and holidays",
    synonyms: ["sale ad text generator", "promotion ad copy generator", "discount ad copy generator"], slang: ["write an ad for my sale", "promo post for my shop", "sale flyer text"],
    intro: "Got a sale, a grand opening, a holiday deal or a new product? Add the offer and get promo post and ad text ready for Facebook and Instagram, plus short versions that fit a flyer.",
    guidance: ["Say what's on offer, for whom and until when.", "A real deadline and a specific number beat vague 'big savings'.", "Keep dates and prices exactly as they are; never promise more than the offer."],
    faq: [{ q: "What should a sale ad say?", a: "What's on offer, for whom and until when. '20% off all cakes until Sunday' beats 'big savings'." }] },
  { slug: "business-name-generator", primaryQuery: "business name ideas generator", title: "Business Name Ideas Generator (Free, With Reasons)", h1: "Business name ideas generator",
    synonyms: ["free name generator for business", "business name ideas list"], slang: ["what should i call my business"],
    intro: "Trying to name your business? Describe what you do and where, and get a list of business name ideas in different styles with a one-line reason for each.",
    guidance: ["Easy to say and spell after hearing it once.", "Check the company register, trademarks, domain and social handles before you commit.", "Search Google Maps for the same name nearby."],
    faq: [{ q: "How do I come up with a business name?", a: "List what you do, where and how you want to sound, generate options, then shortlist the ones that are easy to say, spell and find online." }] },
]);

// ------------------------------------------------------------------------------------------------ formats

export const FORMAT_VOCAB: VocabEntry[] = mk("format", [
  { slug: "instagram-story", primaryQuery: "instagram story ad examples", title: "Instagram Story Ad Examples: Full-Screen 9:16 Ads That Work", h1: "Instagram Story ad examples", synonyms: ["instagram story ads", "story ad examples", "reels ad examples", "9:16 ad examples"], slang: ["full screen phone ads", "ads between stories", "insta story ads"],
    intro: "Story ads fill the whole phone screen for about five seconds between friends' Stories. The ones that work look native, put the point in the middle of the screen and get there fast.",
    guidance: ["Size 1080x1920 (9:16); keep text and logos out of the top 14% and bottom 20% (the safe zone).", "Show the product or a face in the first second, not a logo.", "Add captions: most Stories are watched with the sound off.", "One message per Story ad; use a 2-3 card sequence if you have more to say."],
    faq: [{ q: "What is the Instagram story ad safe zone?", a: "Leave roughly the top 14% and bottom 20% of a 1080x1920 frame free of text and logos; the profile bar and the button cover them." }, { q: "Can I use a still image as a Story ad?", a: "Yes. Meta shows it for 5 seconds. Design it vertical so it isn't letterboxed." }, { q: "How long should a Story or Reels ad be?", a: "Under 15 seconds for most offers; the first 2 seconds decide whether anyone keeps watching." }] },
  { slug: "carousel", primaryQuery: "carousel ad examples", title: "Carousel Ad Examples: Swipeable Multi-Image Ads That Work", h1: "Carousel ad examples", synonyms: ["multi-image ad examples", "swipe ad examples", "facebook carousel ads"], slang: ["ads you swipe through", "slideshow photo ads"],
    intro: "Carousels give you up to ten cards in one ad. The ones that work treat the swipe as a story: a hook card, cards that pay it off, and a last card that asks.",
    guidance: ["Card 1 must work alone: most people never swipe.", "Use 1080x1080 for every card and keep the same style so it reads as one piece.", "Number the steps or products ('1/5') to invite the swipe.", "Put the offer and call to action on the last card and in the text."],
    faq: [{ q: "How many cards should a carousel ad have?", a: "3 to 5 is plenty for most small businesses. Facebook allows 10, but each extra card needs a reason to exist." }, { q: "What size is a facebook carousel ad?", a: "1080x1080 pixels (1:1) per card. All cards should use the same ratio." }, { q: "When is a carousel better than a single image?", a: "When you have several products, steps or before/after stages to show. For one offer, a single image is usually clearer." }] },
  { slug: "ugc", primaryQuery: "ugc ads examples", title: "UGC Ad Examples: Customer-Style Video Ads for Small Business", h1: "UGC ad examples", synonyms: ["ugc advertising", "ugc ad examples", "user generated content ads"], slang: ["customer video ads", "selfie style ads", "talking head ads"],
    intro: "UGC ads look like a real customer filmed them on a phone: a face, a honest opinion and the product in hand. They work because they look like a post from a person, not an advert.",
    guidance: ["Use real customers or staff, with written permission; never invent a reviewer.", "Open on the face and the problem in the first two seconds.", "Keep it handheld and vertical; over-polished UGC stops looking like UGC.", "End with the exact thing to do next, said out loud and shown as text."],
    faq: [{ q: "What are UGC ads?", a: "Ads made from user-generated content: short, phone-style videos or photos of real customers talking about or using a product." }, { q: "Do I have to pay creators for UGC ads?", a: "Not always. Happy customers and your own staff can film them; get written permission before you run any customer's content as an ad." }, { q: "Can AI make UGC-style ads?", a: "AI presenters can read a real customer review aloud. Label it honestly and only use reviews that customers actually wrote." }] },
  { slug: "promo-video", primaryQuery: "how to make a promo video for free", title: "Promo Video Examples & How to Make One for Free", h1: "Promo video examples and how to make one", synonyms: ["how to make a promo video with ai", "promo video for an event", "promo video examples", "video ad examples"], slang: ["short video ad for my business", "little promo clip"],
    intro: "A promo video is a short clip that sells one thing: an event, an offer or the business itself. You can make a good one free with your own photos, short text and a clear ending.",
    guidance: ["Plan 3-5 shots: hook, what it is, proof, offer, call to action.", "6-15 seconds covers most offers; event promos need the date on screen twice.", "Burn in captions and make the last frame a readable call to action.", "An animated version of your best image ad is a cheap first video test."],
    faq: [{ q: "How do I make a promo video for free?", a: "Use your own photos and short clips, add on-screen text for each point, and export vertical (9:16) and square (1:1) versions. Free editors and AI tools can assemble it in minutes." }, { q: "How long should a promo video be?", a: "6 to 15 seconds for most small-business offers; up to 30 seconds if every second shows something new." }, { q: "What should an event promo video show?", a: "What it is, the date, time and place, and one reason to come, with the date on screen at the start and the end." }] },
]);

// ------------------------------------------------------------------------------------------------ platforms

export const PLATFORM_VOCAB: VocabEntry[] = mk("platform", [
  { slug: "facebook", primaryQuery: "good facebook ad examples", title: "Facebook Ad Examples: Real Small-Business Ads & What Works", h1: "Facebook ad examples", synonyms: ["facebook ad examples", "facebook ad creative examples", "facebook ad format examples", "fb ad examples", "meta ad examples"], slang: ["good fb ads", "facebook ads that work"],
    intro: "Facebook is still where most small businesses run their first ads. These examples show the patterns that keep working in the feed: a clear picture, a specific line and one easy action.",
    guidance: ["Primary text: only about 125 characters show before 'See more'.", "Headline: aim for 27-40 characters so it isn't cut off on mobile.", "Run 3-5 different angles in one ad set and let delivery find the winner.", "Retarget website visitors with a reminder ad; it is often the cheapest sale you'll get."],
    faq: [{ q: "What makes a good Facebook ad?", a: "One idea, a real photo, words your customer would use and a single clear next step." }, { q: "Is a boosted post the same as a Facebook ad?", a: "A boosted post is a simple ad made from an existing post. Ads Manager gives you more control over the goal, audience and placements; boosting is fine for testing a post that already does well." }, { q: "Are these real Facebook ads?", a: "Real ads are customer ads made with Komendly and shared with permission. Samples are clearly marked and made for fictional demo businesses." }] },
  { slug: "instagram", primaryQuery: "instagram ad examples", title: "Instagram Ad Examples: Feed & Sponsored Post Ads That Work", h1: "Instagram ad examples", synonyms: ["ig ad examples", "instagram sponsored post examples", "instagram ads ideas"], slang: ["insta ads", "sponsored posts on insta"],
    intro: "Instagram ads have to look like they belong next to friends' photos. The examples here lean visual: strong images, few words on the picture and a caption that does the selling.",
    guidance: ["Use 4:5 (1080x1350) for feed and 9:16 for Stories and Reels; upload both crops.", "Lead with the visual; Instagram users read the image before the caption.", "First caption line under 125 characters carries the hook.", "Creator-style photos usually beat polished studio shots."],
    faq: [{ q: "Are Instagram ads different from Facebook ads?", a: "They are bought in the same Meta Ads Manager, but Instagram rewards more visual, less wordy creative and vertical formats." }, { q: "What size is an Instagram ad in 2026?", a: "1080x1350 (4:5) for feed and 1080x1920 (9:16) for Stories and Reels." }, { q: "Can I run Instagram ads without a Facebook page?", a: "You need a Meta business setup to pay for ads, but the ad can run only on Instagram if you pick that placement." }] },
  { slug: "tiktok", primaryQuery: "tiktok ad examples", title: "TikTok Ad Examples for Small Businesses (What Works)", h1: "TikTok ad examples", synonyms: ["tiktok ads that work", "tiktok spark ads examples", "tiktok ad ideas"], slang: ["ads on tiktok", "tiktok promo videos"],
    intro: "TikTok ads that work look like TikToks: a person talking to the camera, native text, quick cuts and a payoff in the first seconds. Polished TV-style spots tend to get skipped.",
    guidance: ["Vertical 9:16 video (at least 540x960), 9-15 seconds, with the hook in the first 2 seconds.", "TikTok also accepts 1:1 and 16:9, but vertical fills the screen.", "Spark Ads (boosting an organic post) keep likes and comments as social proof.", "Use trending sounds only if you have rights to them in ads."],
    faq: [{ q: "Do small businesses do well with TikTok ads?", a: "Yes, especially for visual, impulse or local products. The creative must feel native to the app." }, { q: "What is a TikTok Spark Ad?", a: "An ad that boosts an existing organic TikTok post (yours or a creator's, with permission), keeping its engagement." }, { q: "What are the TikTok ad sizes?", a: "9:16 vertical is the main one (at least 540x960); 1:1 and 16:9 are accepted. Files up to 500MB." }] },
  { slug: "google-business", primaryQuery: "google business posts examples", title: "Google Business Post Examples: Offers, Updates & Events", h1: "Google Business post examples", synonyms: ["google business profile post examples", "google my business post ideas", "gbp post examples"], slang: ["posts on my google listing", "google maps posts"],
    intro: "Google Business posts show on your listing in Search and Maps, right where people decide whether to call you. They are free, and the useful ones read like a notice on the shop door: what's new, what's on, what it costs.",
    guidance: ["Pick the post type: Update, Offer (with dates and a code) or Event (with a start and end).", "Use a 4:3 photo around 1200x900; Google crops to the centre.", "Put the point in the first 80 characters: that's what shows on the listing.", "Post weekly; old posts drop out of view and an empty feed looks closed."],
    faq: [{ q: "What should I post on Google Business Profile?", a: "Offers with real end dates, upcoming events, new products or services, and seasonal hours. One clear photo and a button each." }, { q: "What size is a Google Business post image?", a: "Around 1200x900 pixels (4:3), at least 400x300. Keep the subject in the centre." }, { q: "Are Google Business posts ads?", a: "No, they're free posts on your listing. They help people who already found you choose you; they don't reach new people the way paid ads do." }] },
  { slug: "nextdoor", primaryQuery: "nextdoor ads", title: "Nextdoor Ad Examples for Local Businesses", h1: "Nextdoor ad examples", synonyms: ["nextdoor advertising", "nextdoor ad examples", "nextdoor business ads"], slang: ["ads for my neighbourhood", "nextdoor local deals"],
    intro: "Nextdoor ads reach people by neighbourhood, inside a feed full of local recommendations. Ads that work sound like a neighbour: the street names, a friendly owner and an offer for locals.",
    guidance: ["Name the neighbourhoods you serve in the headline or first line.", "Use a real photo of you, your van or your shop; stock photos stand out badly here.", "Local deals and first-visit offers fit the feed better than brand slogans.", "Ask happy customers to recommend you on Nextdoor; recommendations show next to your ads."],
    faq: [{ q: "Are Nextdoor ads worth it?", a: "For home services and neighbourhood businesses, often yes: you only pay to reach the areas you serve. For online-only products, usually not." }, { q: "What kind of businesses do well on Nextdoor?", a: "Home services (plumbers, cleaners, handymen, landscapers), restaurants, gyms, salons and other places locals use weekly." }, { q: "What image works for a Nextdoor ad?", a: "A real, friendly local photo in landscape or square, with little or no text on it." }] },
]);

// ------------------------------------------------------------------------------------------------ occasions

export const OCCASION_VOCAB: VocabEntry[] = mk("occasion", [
  { slug: "grand-opening", primaryQuery: "grand opening ad ideas", title: "Grand Opening Ad Examples & Ideas for New Businesses", h1: "Grand opening ad examples", synonyms: ["grand opening advertisement sample", "grand opening ad examples", "grand opening ad template", "now open ad examples"], slang: ["ad for my new shop opening", "we're open ads"],
    intro: "Opening ads have one job: get people through the door in the first weeks. The best ones say exactly when, where, and what's in it for the first visitors.",
    guidance: ["Lead with date, address and the opening offer in one line.", "Start ads 1-2 weeks before opening and target a few miles around you.", "Show the real space and team, even if it's half-finished.", "Follow up with a 'thanks for a great opening week' ad to people who engaged."],
    faq: [{ q: "When should I start advertising a grand opening?", a: "About 2 weeks before, with a reminder ad the day before and on opening day." }, { q: "What should a grand opening ad offer?", a: "Something small and real for the first visitors: a free item, a first-week discount or a launch event." }, { q: "How far around my shop should I target?", a: "Usually 3-10 miles for a local shop, smaller in a dense city." }] },
  { slug: "hiring", primaryQuery: "hiring ad examples", title: "Hiring Ad Examples: Job Ads for Facebook & Instagram", h1: "Hiring ad examples", synonyms: ["hiring ad template", "hiring advertisement", "we're hiring ad examples", "recruitment ad examples"], slang: ["help wanted ads", "ad to find staff"],
    intro: "Hiring ads compete with every other job post. The ones that get applicants speak to the person doing the job today, with the pay, hours and what's actually nice about working there.",
    guidance: ["Put pay range and hours in the first line where you can.", "Show real staff, not stock photos of smiling models.", "Meta requires the Employment special ad category: no age, gender or postcode targeting.", "Make applying take a minute: a short form beats a long site."],
    faq: [{ q: "Can I target job ads on Facebook by age?", a: "No. Job ads must use the Employment special ad category, which removes age, gender and detailed location targeting." }, { q: "What makes a good hiring ad?", a: "Pay, hours, location and one honest reason people like working there, plus a fast way to apply." }, { q: "Where should small businesses post hiring ads?", a: "Facebook and Instagram reach local workers well; pair them with your own site and free job boards." }] },
  { slug: "black-friday", primaryQuery: "black friday ad ideas", title: "Black Friday Ad Ideas & Examples for Small Businesses", h1: "Black Friday ad ideas", synonyms: ["black friday ad examples", "black friday sale ad ideas", "cyber monday ad examples", "bfcm ad examples"], slang: ["black friday deals ad", "november sale ads"],
    intro: "Black Friday feeds are wall-to-wall discounts, so small-business ads need more than a percentage: a clear deal, a real end time and a reason to buy from you.",
    guidance: ["Warm up lists and retargeting audiences in early November; costs peak on the day.", "One headline number ('30% off everything') beats a menu of deals.", "Show the real end date and time; extend only if you say so honestly.", "Run a Small Business Saturday or Cyber Monday follow-up to people who clicked."],
    faq: [{ q: "When should Black Friday ads start?", a: "Teasers 1-2 weeks before, the main sale ad from Thursday night, and reminders until the deal ends." }, { q: "Do small businesses need a big discount?", a: "No. Bundles, free gifts or early access often work as well and protect your margin." }, { q: "Why are ads so expensive on Black Friday?", a: "Every retailer bids at once. Building an audience earlier and retargeting it is cheaper than cold ads on the day." }] },
  { slug: "small-business-saturday", primaryQuery: "small business saturday ads", title: "Small Business Saturday Ad Examples & Ideas", h1: "Small Business Saturday ad examples", synonyms: ["small business saturday sale ideas", "small business saturday ad examples", "shop small ad ideas", "shop local ad examples"], slang: ["shop local post", "support local ads"],
    intro: "Small Business Saturday is the one day the big brands can't own. Ads that work tell the story of the owner and the street, and give locals a reason to come that day.",
    guidance: ["Lead with the people: owner, staff, makers.", "Team up with neighbouring shops for a shared offer or trail.", "Say what's special on the day: a tasting, a gift with purchase, a raffle.", "Target a tight radius; this day is about walking in."],
    faq: [{ q: "When is Small Business Saturday?", a: "In the US, the Saturday after Thanksgiving; the UK runs its own on the first Saturday of December." }, { q: "What should a Shop Small ad say?", a: "Who you are, why buying local matters to your town, and what's on that day." }, { q: "Do I need a discount?", a: "No. Events, free gifts and the story of your shop often pull more people than a discount." }] },
  { slug: "christmas", primaryQuery: "christmas advertising ideas", title: "Christmas Advertising Ideas & Examples for Small Businesses", h1: "Christmas advertising ideas", synonyms: ["christmas marketing ideas for small businesses", "christmas advertising examples", "christmas ad examples", "holiday ad examples"], slang: ["christmas promo for my shop", "xmas ad ideas"],
    intro: "Holiday ads sell gifts, plans and deadlines. The examples that work pick one of those: the perfect gift for someone specific, a booking before the rush, or the last day to order.",
    guidance: ["Name the person the gift is for ('for the dad who has everything').", "Shipping and booking deadlines are your strongest late-season hook.", "Gift cards save last-minute shoppers: advertise them in the final week.", "Keep festive design light so the product stays the hero."],
    faq: [{ q: "When should Christmas ads start?", a: "Gift ideas from mid-November, deadline ads in December, and gift cards in the last few days." }, { q: "What are good christmas marketing ideas for restaurants?", a: "Group bookings and work parties early, gift cards and set menus in December, and a 'we're open' reminder for the days between Christmas and New Year." }, { q: "Should I discount at Christmas?", a: "Not necessarily. Gift wrapping, bundles and guaranteed delivery dates can matter more than price." }] },
  { slug: "mothers-day", primaryQuery: "mother's day advertising ideas", title: "Mother's Day Ad Examples & Promo Ideas", h1: "Mother's Day ad examples", synonyms: ["mothers day ads", "mother's day ad examples", "mothers day promo ideas", "mothers day marketing ideas"], slang: ["ads for mother's day gifts", "mum's day promo"],
    intro: "Mother's Day ads are bought by the kids and partners, not the mums. The best ones make it easy for a busy, slightly late buyer to get something thoughtful.",
    guidance: ["Speak to the buyer: 'Sorted for Mum by Sunday'.", "Check the date for your country: UK Mothering Sunday is in March, US Mother's Day in May.", "Bundle and pre-book offers (brunch, spa, flowers) reduce last-minute stress.", "Be gentle: some people find the day hard; offer an opt-out from reminder emails."],
    faq: [{ q: "When should Mother's Day ads start?", a: "About 2-3 weeks before the date in your country, with a deadline push in the last 4 days." }, { q: "What businesses do best on Mother's Day?", a: "Florists, restaurants, spas, salons, bakeries, jewellers and gift shops." }, { q: "What should a Mother's Day ad say?", a: "What the gift is, who it's perfect for, and the order or booking deadline." }] },
]);

// ------------------------------------------------------------------------------------------------ combos: "facebook ads for <industry>"

/** Only industries with real "facebook ads for X" demand (PAGE PLAN comboPagesWorthIt). industry slug -> [search name, one specific tip]. */
export const FACEBOOK_COMBOS: Record<string, { name: string; extra: string[]; tip: string }> = {
  "real-estate-agents": { name: "realtors", extra: ["facebook ads for real estate agents", "real estate facebook ads", "realtor facebook ads"], tip: "Fair-housing rules apply: Meta's Housing special ad category removes age, gender and postcode targeting, so let the listing photos and area names do the work." },
  plumbers: { name: "plumbers", extra: ["plumber facebook ads", "plumbing facebook ads"], tip: "Split emergency and planned work into different ads: '24/7 burst pipe' needs a call button, a water-heater upgrade can use a quote form." },
  roofers: { name: "roofing companies", extra: ["roofing facebook ads", "roofer facebook ads"], tip: "Storm weeks change everything: have a free-inspection ad ready to switch on after hail or high wind in your area." },
  hvac: { name: "hvac companies", extra: ["hvac company facebook ads", "hvac facebook ads"], tip: "Run tune-up offers in spring and autumn before the rush, and keep a no-heat / no-AC repair ad ready for the first hot or cold snap." },
  dentists: { name: "dentists", extra: ["dental facebook ads", "dentist facebook ads"], tip: "Health claims are restricted: no before/after promises; sell the first visit, opening hours and how anxious patients are looked after." },
  landscapers: { name: "lawn care", extra: ["lawn care facebook ads", "facebook ads for landscapers", "landscaper facebook ads"], tip: "Sell the season, not the mower: spring clean-ups, weekly plans and autumn leaf removal each deserve their own ad." },
  "cleaning-services": { name: "cleaning business", extra: ["cleaning business facebook ads", "facebook ads for cleaning services", "cleaning service facebook ads"], tip: "A first-clean price and a photo of a real finished kitchen beat a list of services; recurring plans are the follow-up ad." },
  gyms: { name: "gyms", extra: ["gym facebook ads", "fitness facebook ads"], tip: "Meta rejects ads that shame bodies; sell a free first class or a challenge start date with real members instead." },
  churches: { name: "churches", extra: ["church facebook ads", "church advertising on facebook"], tip: "Invite to one specific thing: Christmas or Easter services, a family event or a newcomers' lunch, with the time and what to expect." },
  "pressure-washing": { name: "pressure washing", extra: ["pressure washing facebook ads", "advertising pressure washing business"], tip: "Split-screen before/after photos of a driveway or deck are the whole ad; add the town name and a price-from line." },
  "mobile-detailing": { name: "mobile detailing", extra: ["mobile detailing facebook ads", "mobile detailing advertising ideas"], tip: "'We come to you' is the offer: show the van at a driveway or office car park and the finished interior up close." },
  handyman: { name: "handyman", extra: ["handyman facebook ads", "handyman advertising examples"], tip: "List the small jobs people put off (TV mounting, shelves, doors that stick) and an hourly or per-job price." },
};

function comboEntry(slug: string): VocabEntry {
  const c = FACEBOOK_COMBOS[slug]!;
  const i = INDUSTRIES.find((x) => x.slug === slug)!;
  return {
    key: `combo:facebook-${slug}`, kind: "combo", slug: `facebook-${slug}`,
    primaryQuery: `facebook ads for ${c.name}`,
    title: `Facebook Ads for ${c.name.replace(/\b[a-z]/g, (m) => m.toUpperCase()).replace(/Hvac/, "HVAC")}: Targeting, Budget & Sample Ads`,
    h1: `Facebook ads for ${c.name.replace(/hvac/, "HVAC")}`,
    synonyms: c.extra,
    slang: [`how to run facebook ads for a ${i.singular.toLowerCase()}`],
    intro: `How to run Facebook ads as a ${i.singular}: who to target, what to spend, which ad to run first and what ${i.plural} actually post.`,
    guidance: [c.tip, `Target the area you actually serve (often 5-15 miles), not the whole region.`, "Start with $10-20 a day on one ad set with 3 ad versions; judge after about 50 clicks, not after one day.", "A Lead form or a Call button usually beats sending local customers to a slow website."],
    faq: [{ q: `How much should a ${i.singular} spend on Facebook ads?`, a: "Many local businesses start at $10-20 a day for two weeks, then keep only the ads that bring calls or leads at a cost they can afford." }, { q: "Should I boost a post or create an ad?", a: "Boosting is quick for a post that already does well. A real ad in Ads Manager lets you pick leads or calls as the goal and test several versions." }, { q: `Do Facebook ads work for ${i.plural}?`, a: `They can, when the ad shows real work, names the area you serve and makes the next step (call, quote, book) easy.` }],
  };
}
export const COMBO_VOCAB: VocabEntry[] = Object.keys(FACEBOOK_COMBOS).map(comboEntry);

// ------------------------------------------------------------------------------------------------ industries (derived)

/** Extra everyday names per industry (merged into derived synonyms). */
const INDUSTRY_SLANG: Record<string, string[]> = {
  barbers: ["barbershop ads", "barber shop promo"],
  hvac: ["ac company ads", "heating company ads"],
  "med-spas": ["botox clinic ads", "aesthetics clinic ads"],
  "real-estate-agents": ["realtor ads"],
  "auto-repair": ["mechanic ads", "car garage ads"],
  "law-firms": ["lawyer ads", "attorney ads"],
  saas: ["software ads", "app ads"],
  salons: ["hair salon ads", "nail salon ads"],
  gyms: ["fitness ads", "personal trainer ads"],
};

function industryEntry(i: Industry): VocabEntry {
  return {
    key: `industry:${i.slug}`, kind: "industry", slug: i.slug,
    primaryQuery: `facebook ad examples for ${i.plural.toLowerCase()}`,
    title: "", h1: `Facebook ad examples for ${i.plural}`,
    synonyms: Array.from(new Set([`${i.singular.toLowerCase()} ad examples`, `${i.singular.toLowerCase()} ad ideas`, ...(FACEBOOK_COMBOS[i.slug] ? [] : [`${i.singular.toLowerCase()} facebook ads`])])),
    slang: [`how to advertise a ${i.singular.toLowerCase()}`, ...(INDUSTRY_SLANG[i.slug] ?? [])],
    intro: "", guidance: [], faq: [],
  };
}
export const INDUSTRY_VOCAB: VocabEntry[] = INDUSTRIES.map(industryEntry);

// ------------------------------------------------------------------------------------------------ overrides + lookups

/** Researcher/founder patches by key (merged over the entries above). Data only. */
export const VOCAB_OVERRIDES: Record<string, Partial<Omit<VocabEntry, "key" | "kind" | "slug">>> = {};

export const VOCABULARY: readonly VocabEntry[] = [...TOOL_VOCAB, ...FORMAT_VOCAB, ...PLATFORM_VOCAB, ...OCCASION_VOCAB, ...COMBO_VOCAB, ...INDUSTRY_VOCAB].map((e) => ({ ...e, ...(VOCAB_OVERRIDES[e.key] ?? {}) }));
const BY_KEY = new Map(VOCABULARY.map((e) => [e.key, e]));

export function vocab(key: string): VocabEntry | undefined {
  return BY_KEY.get(key);
}
export function vocabOf(kind: VocabKind): VocabEntry[] {
  return VOCABULARY.filter((e) => e.kind === kind);
}

export const normTerm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Every search term (primary, synonyms, slang) -> the one page key that owns it. Throws on a conflict. */
export function termIndex(entries: readonly VocabEntry[] = VOCABULARY): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of entries) {
    for (const t of [e.primaryQuery, ...e.synonyms, ...e.slang]) {
      const k = normTerm(t);
      const prev = m.get(k);
      if (prev && prev !== e.key) throw new Error(`term "${t}" maps to both ${prev} and ${e.key}`);
      m.set(k, e.key);
    }
  }
  return m;
}

/** "Also called …" line: synonyms then slang, deduped, first n. */
export function alsoCalled(e: VocabEntry, n = 4): string {
  const xs = Array.from(new Set([...e.synonyms, ...e.slang])).slice(0, n);
  return xs.length ? `Also called ${xs.join(", ")}.` : "";
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Natural anchor text for a link to `key`, varied per linking page (stable). */
export function anchorText(key: string, fromKey = ""): string {
  const e = vocab(key);
  if (!e) return key;
  const options = [e.primaryQuery, ...e.synonyms.slice(0, 2)];
  return options[hash(`${fromKey}>${key}`) % options.length] ?? e.primaryQuery;
}

/** Alt text for an ad image on a page (uses the page's vocabulary, no stuffing: one phrase). */
export function adImageAlt(pageKey: string, brand: string, headline: string, index = 0): string {
  const e = vocab(pageKey);
  const phrase = e ? ([e.primaryQuery, ...e.synonyms][index % (1 + e.synonyms.length)] ?? e.primaryQuery).replace(/ examples?$/, "") : "ad";
  return `${brand} ${phrase}: ${headline}`.slice(0, 180);
}
