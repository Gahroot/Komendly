// Hand-written search-ad and TikTok guidance for the local-service example pages that already get impressions:
// /ad-examples/plumbers, /ad-examples/hvac (+ /google) and /ad-examples/platform/tiktok. Pure TS, no Next/Prisma.
// Every example is a template written as an example by Komendly's Ozzy: placeholders instead of business names, no
// results, no promised leads. Komendly writes the ads; the owner pastes/posts them in their own Google Ads or TikTok account.
// The tests (__tests__/local-search-ads.test.ts) count every headline, description, path and TikTok ad text.

/** Google responsive search ad (RSA) limits, in characters. */
export const RSA_LIMITS = { headline: 30, description: 90, path: 15, minHeadlines: 3, maxHeadlines: 15, minDescriptions: 2, maxDescriptions: 4 } as const;
/** TikTok in-feed ad text limit (Latin characters); emojis, # and { } aren't supported in ad text. */
export const TIKTOK_AD_TEXT_MAX = 100;
/** Placeholder for the town in the examples. The tests also check every line still fits with a longer town in its place. */
export const TOWN = "[Town]";
/** Longest town name the examples are proven to fit with (e.g. "Fort Worth"). */
export const TOWN_FIT_CHARS = 10;

export interface SearchAd {
  /** Searches this ad answers. */
  searches: string[];
  label: string;
  headlines: string[];
  descriptions: string[];
  path1: string;
  path2: string;
  why: string;
}

export interface SearchService {
  name: string;
  /** What people type when they need it. */
  searches: string[];
  /** What the ad for that search should say / do. */
  adSays: string;
}

export interface SearchGuide {
  slug: "plumbers" | "hvac";
  /** Short noun for headings ("plumbing", "HVAC"). */
  term: string;
  /** Who the page is for, as searched ("plumbers", "heating and cooling repair companies"). */
  who: string;
  /** Overrides for the /ad-examples/<slug> (Facebook + Google examples) page metadata. */
  tradeTitle: string;
  tradeDescription: string;
  /** Meta description for /ad-examples/<slug>/google. */
  googleDescription: string;
  services: SearchService[];
  ads: SearchAd[];
  /** Words to add as negative keywords. */
  negatives: string[];
  /** FAQ appended on /ad-examples/<slug>/google. */
  googleFaq: Array<{ q: string; a: string }>;
  /** FAQ appended on /ad-examples/<slug>. */
  tradeFaq: Array<{ q: string; a: string }>;
}

const COMMON_PUT_IN_AD = [
  "The search itself, in headline 1: the service plus your town, in the words people type when the problem is happening.",
  "One reason to choose you that you can back up: your licence status, a price-before-work rule, or the hours you really answer the phone.",
  "One next step. For urgent jobs that is a call (add a call asset so the phone number is tappable); for planned work it is a quote or booking link.",
  "Only claims that are true today. Same-day, 24/7, free estimate, licensed and insured and tankless are placeholders in the examples: keep each one only if it applies to you.",
  "A landing page that matches the ad: the same service in the heading, your phone number at the top and a short form or booking link under it.",
  "Your licence number if your state requires it in ads. Some states do; check your state licensing board.",
];

export const SEARCH_PUT_IN_AD = COMMON_PUT_IN_AD;

export const SEARCH_LEAVE_OUT = [
  "Superlatives and guarantees: best, number one, cheapest, guaranteed. They are hard to back up and Google can disapprove them.",
  "Exclamation marks in headlines, and ALL CAPS words: Google's editorial rules reject them.",
  "A price or arrival time you can't keep. If a customer reads it in the ad, they expect it on the phone.",
  "Keyword-stuffed lines. Google mixes headlines in any order, so each one must read well alone and beside the others.",
];

export const SEARCH_ASK_FOR = [
  "Your own Google Ads account, with you as owner. If an agency or freelancer uses theirs, you can lose the history when you leave.",
  "A search terms report every month: the real searches that triggered your ads, plus the negative keywords they added.",
  "Call reporting, not just clicks: how many calls came from the ads and how long they lasted, so you can match them to booked jobs.",
  "One ad group per service (emergency, drains, water heaters and so on), each with its own ad text and landing page.",
  "Your service area and ad hours written down: the towns you serve, location set to people in or regularly in the area, and ad hours that match when you answer the phone.",
  "Their fee in writing, separate from the ad spend that goes to Google, and no long contract before you have seen a month of results in your own account.",
  "A goal in booked jobs. Tell them which calls turned into work and judge the campaign on cost per booked job, not clicks.",
];

const PLUMBERS: SearchGuide = {
  slug: "plumbers",
  term: "plumbing",
  who: "plumbers",
  tradeTitle: "Plumbing Ad Examples: Google & Facebook Ads, Hooks & Copy",
  tradeDescription: "Example plumbing ads: Google search ad text within Google's character limits for emergency, drain and water heater searches, plus Facebook hooks, offers and budget guidance. Examples made by Komendly's Ozzy.",
  googleDescription: "Google ads for plumbers: example search ads for emergency, drain and water heater searches, counted against Google's 30 and 90 character limits, plus what to put in the ad and what to ask for. Examples made by Komendly's Ozzy.",
  services: [
    { name: "Emergency leaks and burst pipes", searches: ["emergency plumber near me", "burst pipe repair", "plumber open now", "water leaking from ceiling"], adSays: "Lead with the problem and a tappable phone number. Say when you answer the phone, and only run the ad in those hours. A line telling people to shut off the main valve gives them something useful before they call." },
    { name: "Drain cleaning and clogs", searches: ["drain cleaning near me", "clogged kitchen sink", "main line backup", "toilet won't flush"], adSays: "Name the fixture (sink, tub, main line) so the ad matches the search. If you quote a price before starting, say so; it is the question most callers have." },
    { name: "Water heater repair and replacement", searches: ["water heater replacement", "no hot water", "water heater leaking", "tankless water heater install"], adSays: "Split repair from replacement. Replacement searchers compare quotes, so offer a clear quote and say which types you install (tank, tankless)." },
    { name: "Sewer lines and repeat clogs", searches: ["sewer line repair", "sewer camera inspection", "main sewer line clogged", "tree roots in sewer line"], adSays: "These are bigger jobs and people research first. Offer a camera inspection or a written quote instead of pushing for an immediate call." },
  ],
  ads: [
    {
      label: "Emergency leak or burst pipe",
      searches: ["emergency plumber near me", "burst pipe repair"],
      headlines: ["Emergency Plumber [Town]", "Burst Pipe & Leak Repair", "Call Now, Talk to a Plumber", "Licensed & Insured Plumbers", "Same-Day Visits Available"],
      descriptions: ["Burst pipe, leak or no water in [Town]? Call now and tell us what is happening.", "Turn off your main water valve if you can, then call to book a plumber for today."],
      path1: "emergency", path2: "plumber",
      why: "It repeats the emergency search, puts the phone number one tap away and leaves out a promised arrival time.",
    },
    {
      label: "Drain cleaning",
      searches: ["drain cleaning near me", "clogged kitchen sink"],
      headlines: ["Drain Cleaning [Town]", "Clogged Drain? Call Today", "Sinks, Tubs & Main Lines", "Price Quoted Before Work", "Book Online or Call"],
      descriptions: ["Slow or backed-up drain in [Town]? Tell us what is going on and book a visit.", "We explain the price before we start work. Call or book online to get a plumber out."],
      path1: "drain-cleaning", path2: "clogged-drain",
      why: "It names the fixtures people search for and answers the price question up front. Keep that line only if you really quote first.",
    },
    {
      label: "Water heater repair or replacement",
      searches: ["water heater replacement", "no hot water"],
      headlines: ["Water Heater Repair", "Water Heater Replacement", "No Hot Water in [Town]?", "Tank & Tankless Installs", "Get a Clear Quote Today"],
      descriptions: ["No hot water or a leaking tank? We repair and replace water heaters in [Town].", "Tell us your tank size and fuel type and we will quote before any work starts."],
      path1: "water-heaters", path2: "replacement",
      why: "Repair and replacement both appear, so the ad matches either search. Asking for tank size and fuel type makes the quote request specific.",
    },
    {
      label: "Sewer line and repeat clogs",
      searches: ["sewer line repair", "sewer camera inspection"],
      headlines: ["Sewer Line Repair [Town]", "Sewer Camera Inspection", "Drains Backing Up Again?", "See the Problem on Video", "Request a Quote Online"],
      descriptions: ["Drains that keep backing up can point to a sewer line problem. Book a camera look.", "A camera inspection shows what is in the line, so you know your options. Ask for a quote."],
      path1: "sewer-line", path2: "camera-check",
      why: "A bigger job, so the ask is an inspection or a quote, not an urgent call.",
    },
  ],
  negatives: ["jobs", "salary", "school", "training", "diy", "how to", "parts", "supplies"],
  googleFaq: [
    { q: "What does a good Google ad for a plumber say?", a: "It repeats what the person typed (\"emergency plumber [town]\"), gives one reason to call (licensed, price before work, the hours you answer) and asks for one action, usually a call. Put the service and your town in headline 1, and write every headline so it still reads well beside any other, because Google mixes them." },
    { q: "What are the character limits for a Google search ad for plumbers?", a: "A responsive search ad takes up to 15 headlines of 30 characters each and up to 4 descriptions of 90 characters each, plus two display-path fields of 15 characters each. Google shows up to 3 headlines and 2 descriptions at a time. Every example on this page is counted against those limits." },
    { q: "Which plumbing searches should I bid on first?", a: "Start with the work you most want and can answer fast: emergency plumber, burst pipe repair, drain cleaning and water heater replacement. Keep emergency and planned work in separate ad groups, because they need different ads, hours and landing pages. Add negative keywords such as jobs, salary, school and diy so you don't pay for people who will never hire you." },
    { q: "How much do Google ads cost for plumbers?", a: "Google sets the price of each click in an auction, and it changes by city, service and season, so no honest page can give you one number. Pick a daily budget you are comfortable spending for a month, check Google's keyword planner for your town, and judge the campaign on cost per booked job rather than clicks." },
    { q: "Can I use the free ad pack for Google ads?", a: "The free pack makes Facebook and Instagram ads from your website, and you post them yourself. Google search ads are text, so for those use the free Google Ads headline generator (it keeps to the character limits) and paste the result into your own Google Ads account. Komendly does not run Google ads for you." },
  ],
  tradeFaq: [
    { q: "Are there Google ad examples for plumbers on this page?", a: "Yes. This page shows search ad text for emergency, drain, water heater and sewer line searches, with every headline and description counted against Google's limits. The full guide, with what to put in the ad and what to ask for, is on our Google ads for plumbers page." },
    { q: "Should a plumber advertise on Google or Facebook?", a: "They reach people at different moments. Google search ads reach someone who is already looking for a plumber, which suits emergencies and quote requests. Facebook and Instagram ads reach people who aren't searching yet, which suits water heater upgrades, drain maintenance and reminders. Many plumbers start with one and test the other." },
  ],
};

const HVAC: SearchGuide = {
  slug: "hvac",
  term: "HVAC",
  who: "heating and cooling repair companies",
  tradeTitle: "HVAC Ad Examples: Google & Facebook Ads for Heating and Cooling",
  tradeDescription: "Example HVAC ads for heating and cooling repair companies: Google search ad text within Google's character limits for AC repair, furnace and replacement searches, plus Facebook hooks, offers and budget guidance. Examples made by Komendly's Ozzy.",
  googleDescription: "Google ads for heating and cooling (HVAC) repair companies: example search ads for AC repair, furnace and replacement searches, counted against Google's 30 and 90 character limits, plus what to put in the ad and what to ask for. Examples made by Komendly's Ozzy.",
  services: [
    { name: "AC repair and not cooling", searches: ["ac repair near me", "ac not cooling", "air conditioner blowing warm air", "ac not turning on"], adSays: "Lead with the symptom and a phone number. Turn the ad up in the first hot week and down when the weather is mild. Say same-day only when you can really do it." },
    { name: "Furnace and heat pump repair", searches: ["furnace repair near me", "no heat in house", "heat pump not heating", "furnace blowing cold air"], adSays: "Name the equipment (furnace, heat pump) and the brands you service. Keep a no-heat ad ready to switch on at the first cold snap." },
    { name: "System replacement", searches: ["hvac replacement cost", "new furnace install", "ac unit replacement", "how much does a new ac cost"], adSays: "These searchers compare options, so offer a written in-home quote and name the brands you install. Mention financing only if you really offer it." },
    { name: "Tune-ups and maintenance plans", searches: ["ac tune up", "furnace maintenance near me", "hvac maintenance plan", "hvac service near me"], adSays: "Planned work, so run it before the rush in spring and autumn with a set price and online booking, not an urgent call." },
  ],
  ads: [
    {
      label: "AC repair, not cooling",
      searches: ["ac repair near me", "ac not cooling"],
      headlines: ["AC Repair [Town]", "AC Not Cooling? Call Us", "Central & Ductless AC", "Same-Day Visits Available", "Book Online or Call Now"],
      descriptions: ["AC blowing warm air or not turning on? Book a repair visit with a [Town] HVAC tech.", "Tell us the make and the problem and we will plan the right visit. Call or book online."],
      path1: "ac-repair", path2: "cooling",
      why: "It matches the symptom people type and offers two easy next steps. Drop \"same-day\" unless you can do it.",
    },
    {
      label: "Furnace or heat pump, no heat",
      searches: ["furnace repair near me", "no heat in house"],
      headlines: ["Furnace Repair [Town]", "No Heat? Call Today", "Furnace & Heat Pump Repair", "Repairs for Most Brands", "Book Online or Call Now"],
      descriptions: ["Furnace not heating or blowing cold air in [Town]? Call or book a repair visit today.", "Tell us the brand and what the system is doing, and we will plan the right visit."],
      path1: "furnace-repair", path2: "no-heat",
      why: "It names both furnace and heat pump, so it fits the searches for either. Keep \"most brands\" only if it's true.",
    },
    {
      label: "Replacement estimate",
      searches: ["hvac replacement cost", "new furnace install"],
      headlines: ["AC & Furnace Replacement", "HVAC Replacement Quotes", "Free In-Home Estimate", "New System Installs", "Quotes for [Town] Homes"],
      descriptions: ["Old system failing or repair bills adding up? Get a written quote on a new system.", "We look at your home and explain the options and price before you decide anything."],
      path1: "replacement", path2: "get-a-quote",
      why: "The ask is a quote, not a call today, which suits someone comparing options. Use \"free\" only if you don't charge for the estimate.",
    },
    {
      label: "Tune-up and maintenance plan",
      searches: ["ac tune up", "hvac maintenance plan"],
      headlines: ["AC Tune-Up [Town]", "Furnace Tune-Up & Check", "Maintenance Plans", "Book Before the Rush", "Set Price Seasonal Visits"],
      descriptions: ["A tune-up before summer or winter can catch small problems early. Book a visit today.", "Ask about our maintenance plan if you want regular visits on your calendar."],
      path1: "tune-up", path2: "maintenance",
      why: "Planned work gets a calm, specific offer. Only mention a plan or a set price if you really sell one.",
    },
  ],
  negatives: ["jobs", "salary", "school", "training", "diy", "how to", "parts", "manual", "certification"],
  googleFaq: [
    { q: "What does a good Google ad for a heating and cooling repair company say?", a: "It repeats the symptom or service the person typed (\"ac not cooling\", \"furnace repair\"), gives one reason to pick you and asks for one action. Put the service and your town in headline 1, and keep repair, replacement and tune-ups in separate ad groups, because each needs different wording and a different landing page." },
    { q: "What are the character limits for a Google search ad for HVAC?", a: "A responsive search ad takes up to 15 headlines of 30 characters each and up to 4 descriptions of 90 characters each, plus two display-path fields of 15 characters each. Google shows up to 3 headlines and 2 descriptions at a time. Every example on this page is counted against those limits." },
    { q: "When should an HVAC company run Google ads?", a: "Demand jumps in the first hot week of summer and the first cold snap of winter. Many companies keep a repair ad ready to switch on or raise the budget on at those moments, and use the quieter months for tune-up and replacement ads. Match the ad hours to the hours you answer the phone." },
    { q: "How much do Google ads cost for HVAC companies?", a: "Google sets the price of each click in an auction, and it varies by city, service and season, so no honest page can give you one number. Pick a daily budget you are comfortable spending for a month, check Google's keyword planner for your town, and judge the campaign on cost per booked job rather than clicks." },
    { q: "Can I use the free ad pack for Google ads?", a: "The free pack makes Facebook and Instagram ads from your website, and you post them yourself. Google search ads are text, so for those use the free Google Ads headline generator (it keeps to the character limits) and paste the result into your own Google Ads account. Komendly does not run Google ads for you." },
  ],
  tradeFaq: [
    { q: "Are there Google ad examples for heating and cooling companies on this page?", a: "Yes. This page shows search ad text for AC repair, furnace and heat pump repair, replacement and tune-up searches, with every headline and description counted against Google's limits. The full guide, with what to put in the ad and what to ask for, is on our Google ads for HVAC companies page." },
    { q: "Should an HVAC company advertise on Google or Facebook?", a: "They reach people at different moments. Google search ads reach someone whose system has just stopped, which suits repair and quote requests. Facebook and Instagram ads reach people who aren't searching yet, which suits tune-ups, maintenance plans and replacement reminders before the season. Many companies start with one and test the other." },
  ],
};

export const SEARCH_GUIDES: Record<string, SearchGuide> = { plumbers: PLUMBERS, hvac: HVAC };

export function searchGuide(industrySlug: string): SearchGuide | undefined {
  return SEARCH_GUIDES[industrySlug];
}

/** Combo page key -> guide (combo:google-plumbers). */
export function searchGuideForPage(pageKey: string): SearchGuide | undefined {
  const m = /^combo:google-(.+)$/.exec(pageKey);
  return m ? searchGuide(m[1]!) : undefined;
}

/** Text with the town placeholder swapped for a real town (used to prove the examples still fit). */
export function withTown(text: string, town: string): string {
  return text.split(TOWN).join(town);
}

/** Character count as Google counts it for these plain-text lines. */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// ------------------------------------------------------------------------------------------------ TikTok

export interface TikTokExample {
  trade: string;
  hook: string;
  shots: string[];
  adText: string;
  button: string;
  why: string;
}

export const TIKTOK_EXAMPLES: TikTokExample[] = [
  {
    trade: "Plumber: water heater noise",
    hook: "Why is my water heater popping?",
    shots: ["Close-up of the tank while the noise plays.", "The plumber shows the drain valve and explains in one sentence what can cause the sound.", "Name, van and town on screen with the next step."],
    adText: "Water heater making noise? See what can cause it, then book a check in [Town].",
    button: "Book now",
    why: "It starts from a sound the viewer recognises and teaches one thing before asking for anything.",
  },
  {
    trade: "HVAC: filter check before summer",
    hook: "Do this before your AC quits.",
    shots: ["Hand pulls a dirty filter out of the return vent.", "Tech holds it next to a clean one and shows where the size is printed.", "End card: tune-up booking line and your town."],
    adText: "A quick filter check you can do today. Want a tech to look at the whole system? Book in [Town].",
    button: "Contact us",
    why: "A useful tip earns the view first, and the tune-up offer follows once the viewer has learned something.",
  },
  {
    trade: "House cleaner: kitchen reset",
    hook: "Watch this kitchen reset.",
    shots: ["Fast time-lapse of a messy counter and stove.", "Same angle after the clean, with the products on screen.", "Cleaner to camera: what a first visit includes and how to book."],
    adText: "A full kitchen reset, start to finish. Book your first clean in [Town].",
    button: "Book now",
    why: "Before and after in one shot shows the work with no claim needed, and the first-visit offer gives one clear action.",
  },
  {
    trade: "Landscaper: lawn edging",
    hook: "Satisfying lawn edge.",
    shots: ["Overhead pass of the edger along a driveway.", "Wide shot of the finished yard, same spot as the first shot.", "Owner to camera: the areas you serve and how to ask for a quote."],
    adText: "Clean edges, tidy beds. Ask for a quote for your yard in [Town] and nearby.",
    button: "Get quote",
    why: "Satisfying process footage fits the feed, and the quote request fits a service people buy by the season.",
  },
  {
    trade: "Hair salon: cut and style",
    hook: "Cut, color, finish.",
    shots: ["Three quick cuts: before, mid-cut, styled.", "Stylist says one line about who the look suits.", "Booking line and the next open day, if you have one."],
    adText: "From first snip to finished style. Book a chair at [Your salon] in [Town].",
    button: "Book now",
    why: "The transformation is the ad, and the button matches what the viewer does next.",
  },
];

export const TIKTOK_PUT_IN_AD = [
  "A person or a pair of hands doing the real work, filmed on a phone. Polished spots feel out of place next to everyday videos.",
  "The hook in the first two seconds, as on-screen text and spoken: a question, a problem or a result you can see.",
  "Captions on the speech, and a check that the business name and town were transcribed correctly.",
  "One action: book, ask for a quote or contact you. Pick the button that matches it.",
  "Ad text under 100 characters with the town in it. TikTok doesn't support emojis, # or { } in ad text.",
  "Key text inside the safe zone, clear of the right-hand buttons and the caption area at the bottom.",
];

export const TIKTOK_SPECS = [
  "Video: 9:16 vertical at 540x960 pixels or larger is recommended; 1:1 and 16:9 are accepted.",
  "File: .mp4 or .mov, up to 500 MB. TikTok allows long in-feed videos, but a local ad usually needs 9 to 15 seconds.",
  "Ad text: up to 100 Latin characters.",
  "Spark Ads boost a post already on your account (or a creator's, with permission) and keep its likes and comments.",
];

export const TIKTOK_FAQ: Array<{ q: string; a: string }> = [
  { q: "What does a good TikTok ad look like for a local business?", a: "It looks like a normal TikTok: someone on camera or hands doing the work, a hook in the first two seconds, captions, and one action at the end. The five examples on this page show the pattern for a plumber, an HVAC company, a house cleaner, a landscaper and a hair salon." },
  { q: "Do TikTok ads work for plumbers and HVAC companies?", a: "They can, but they work differently from Google. TikTok shows your video to people who are scrolling, not searching, so it suits tips, before-and-afters and seasonal reminders (a tune-up before summer) better than a burst pipe at midnight. For people who need a repair right now, Google search ads reach them when they search; see our Google ads for plumbers and HVAC pages." },
  { q: "How long should a TikTok ad be?", a: "TikTok's own specs allow long videos, but most local ads work best short. Nine to 15 seconds is a common starting point: the hook in the first two seconds, the proof in the middle and one action at the end." },
  { q: "Can Komendly make or run my TikTok ads?", a: "No. Komendly does not post or run TikTok ads. The free pack makes Facebook and Instagram ads from your website, and you post them yourself. For TikTok, use the free hook generator and UGC script generator to write the opening line and script, film it on your phone and upload it in TikTok Ads Manager or boost it as a Spark Ad." },
];
