// Ozzy Studio: one short job recipe per kind of video, picked from what the user asked for.
// Only the matching recipe goes into ./studio.md so the agent's context stays small.

export const RECIPE_IDS = ["before-after", "offer", "launch", "walkthrough", "local", "website", "general"] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

export interface RecipeInput {
  userText: string;
  uploads: Array<{ file: string; kind: string; reference?: boolean }>;
  brand: { name: string | null; url: string | null } | null;
}

const BEFORE_AFTER = /\bbefore\b[\s\S]{0,40}\bafter\b|\bbefore\s*(?:\/|&|and|vs\.?)\s*after\b|makeover|transformation|\btransform|renovat|glow[- ]?up|then (?:and|vs\.?) now/i;
const OFFER = /\bsale\b|\d+\s*%|\bpercent off\b|\bdiscount|\bdeals?\b|promo ?code|\b(?:special|limited|holiday|seasonal|the|this|our) offer\b|offer ends|\bcoupon|black friday|cyber monday|\bbogo\b|buy one|free shipping|limited time|happy hour|\bspecial\b|clearance/i;
const LAUNCH = /\blaunch|\bintroduc|\bannounc|just shipped|we shipped|new feature|now (?:live|available)|\brelease[ds]?\b|product hunt|coming soon|\bv\d+(?:\.\d+)?\b/i;
const WALKTHROUGH = /walk ?through|how (?:to|it) (?:use|works?)|\btutorial|onboarding|\bdemo\b|screen ?(?:recording|record|cast)|step[- ]by[- ]step|\b(?:our|my|the|an?) app\b|\bdashboard/i;
const LOCAL = /\bcaf[eé]s?\b|coffee|bakery|restaurant|pizz|burger|\bbar\b|\bpub\b|bistro|diner|food truck|plumb|electrician|roofer|roofing|hvac|handyman|landscap|cleaning|cleaner|salon|barber|\bnails?\b|\bspa\b|massage|dentist|dental|clinic|physio|chiropract|\bvet\b|groom|\bgym\b|fitness studio|yoga|florist|boutique|\bshop\b|\bstore\b|realtor|real estate|car wash|mechanic|garage|tattoo|bakes?\b|tailor|laundr|daycare|tutor|photograph/i;
const WEBSITE = /website|\bsite\b|landing page|\bsaas\b|software|platform|\bweb ?app\b|\bstartup\b|\bsubscription\b|\bsign[- ]?ups?\b/i;
const SCREEN_FILE = /screen|recording|capture|walkthrough|demo/i;

/** Pick the one recipe that fits this job. Pure: same input, same answer. */
export function classifyRecipe(o: RecipeInput): RecipeId {
  const text = o.userText;
  const files = o.uploads.filter((u) => !u.reference).map((u) => u.file).join(" ");
  const brandText = `${o.brand?.name ?? ""} ${o.brand?.url ?? ""}`;
  if (BEFORE_AFTER.test(text) || /before|after/i.test(files)) return "before-after";
  if (OFFER.test(text)) return "offer";
  if (LAUNCH.test(text)) return "launch";
  if (WALKTHROUGH.test(text) || SCREEN_FILE.test(files)) return "walkthrough";
  if (LOCAL.test(text)) return "local";
  if (WEBSITE.test(text)) return "website";
  if (LOCAL.test(brandText)) return "local";
  if (o.brand?.url && /\.(?:io|ai|app|dev|so|tech)\b/i.test(o.brand.url)) return "website";
  return "general";
}

const RECIPES: Record<RecipeId, string[]> = {
  launch: [
    "## Recipe: launch or announcement",
    "Goal: people want the new thing within seconds.",
    "Ideas (patterns to apply to THEIR product, not scenes to copy):",
    "- One object all the way: a single shape (a dot, a card, the logo's mark) travels through every scene and becomes the logo at the end.",
    "- Clearing the noise: the screen fills with the problem (tabs, pings, clutter); the product arrives and clears it, one cause at a time.",
    "- Chain reaction: each feature knocks into the next, one chain of causes ending on the name.",
    "- From one ask: a request is typed and visibly becomes the finished result; repeat, shorter each time.",
    "Beats:",
    "- Open on a picture of the subject doing something, never a title card.",
    "- One feature per beat, shown working on real screens or their footage, each growing out of the last.",
    "- A calm moment on the hero, then a quick run of 3-4 words or cards into the end card.",
    "- End on the name and one next step, held long enough to read.",
    "Moves: letters dropping or stamping into the name, shapes converging into the end card, whip pans between features, push-ins on the part of the screen that matters.",
    "Pitfalls: feature, feature, feature at equal lengths (a slideshow with a logo); confetti or sparkles at the reveal; features, numbers or claims not in their words or on their site.",
  ],
  walkthrough: [
    "## Recipe: app or product walkthrough",
    "Goal: the product in use: open it, do the task, get the result.",
    "Screens: use their screen recordings or screenshots; when you rebuild a screen as HTML, copy their real layout, make its text big enough to read on a phone, and hide names, emails and anything private. Data on screen comes only from their files.",
    "Ideas:",
    "- Follow the hand: one continuous camera rides the cursor or finger from step to step; each tap opens the next framing.",
    "- The request becomes the result: what the user types or picks grows into what the app gives back.",
    "- The app's own transition (its real sheet, drawer or page slide) is the handoff between steps.",
    "- Before the tap, after the tap: a short held frame, one press, the change it causes.",
    "Beats:",
    "- Open on the result (the moment that matters), then show how; or open on step one with the cursor already moving.",
    "- One step per beat with a close-up on the control being used (zoom in, then out to the next).",
    "- Hold on the final result long enough to read it.",
    "- End on the app's name or icon and where to get it.",
    "Moves: cursor paths with a visible press, camera following the cursor, typed input, a tick on each finished step, the pressed control reshaping into the result.",
    "Pitfalls: a whole-screen view where nothing can be read on a phone; more than 4-5 steps; invented numbers or data on screen; long still screenshots.",
  ],
  website: [
    "## Recipe: website, SaaS or online business",
    "Goal: a brand film about what they offer, not a tour of their pages. Their site is source material: headline, colours, fonts, logo, photos and ./brand/site pieces.",
    "Ideas (from the subject, not the page layout):",
    "- The product in action: their real product or UI piece with shapes pouring, unfolding or assembling around it; one object carries the viewer into the next scene.",
    "- A change you can see: the customer's problem becomes the solution (a tangled path straightens, scattered pieces organise, a task completes).",
    "- A small world around the brand: a scene built from its subject, colours and shapes that turns into the product and the call to action.",
    "Beats:",
    "- Hook (1-3 s): the pain or the desire, shown, in a few big words.",
    "- 2-3 benefit beats, each with a real piece of their site or product (pricing, reviews, the feature) shown big and crisp.",
    "- Proof only from their site (real reviews, real numbers).",
    "- End card: logo, the site's own call to action (sign up, book, buy) and the address.",
    "Moves: zoom into the part of a site piece that matters, cards sliding in with depth, a browser frame that tilts and pushes in, words that land on the beat.",
    "Pitfalls: scrolling a full-page screenshot; floating decorative blobs; metaphors that imply results they don't claim; tiny unreadable UI.",
  ],
  "before-after": [
    "## Recipe: before and after",
    "Goal: the viewer FEELS the difference instead of reading it.",
    "Ideas:",
    "- Same frame, twice: both states set up in one frame (split or wipe) so it is fair; the 'before' side struggles while the 'after' side simply finishes, then the losing half falls away.",
    "- The wipe reveal: a bar, squeegee, brush or light sweep crosses the 'before' and leaves the 'after' behind it.",
    "- Rewind: play the mess, rewind it in one motion, play it again with their product or service.",
    "Use one measure the viewer can see (time, steps, mess, shine), shown the same way on both sides.",
    "Beats:",
    "- Hook: the 'before' at its worst, close and real, in the first second.",
    "- Let the problem build, quickening.",
    "- The reveal, then a held breath on the 'after' (a real, still rest).",
    "- The 'after' carries into the name and the next step.",
    "Moves: a slider or wipe reveal, a local shake only on the 'before' side, a slow push-in on the finished result, an impact sound on the reveal.",
    "Pitfalls: two separate scenes with a plain cut between (show them together or carry one into the other); unfair comparisons (different angle, light or task); captions stating the difference instead of showing it; invented statistics.",
  ],
  local: [
    "## Recipe: local service or shop (cafe, plumber, salon, clinic, gym...)",
    "Goal: make a nearby customer crave it or trust it, then know where to go or who to call.",
    "Ideas:",
    "- The craving close-up: the product in macro (steam, pour, crumb, foam, shine) with a slow push; words land between moves.",
    "- A day in the life: the place opening up, hands at work, the customer's happy moment; one object (a cup, a van, a pair of scissors) carries across scenes.",
    "- Problem to relief (services): the leak, the mess, the bad hair day, then the pro arriving and the fixed result.",
    "Beats:",
    "- Hook (1-2 s): the best-looking real thing they have (their photo or footage), moving, with 2-4 words.",
    "- 2-3 reasons to come (what they do, what it feels like, what locals say: only real reviews from their site).",
    "- Their real offer or hours, exactly as given.",
    "- End card: name, logo, and the next step (address, 'book now', phone or website) held at least 2 s.",
    "Moves: ken-burns on their photos with parallax layers, warm light leaks and steam for food, clean sweeps and ticks for trades, words that pop on the beat.",
    "Music: match the place (lofi or acoustic-warm for cafes and bakeries, minimal and confident for clinics and trades, pulse for gyms).",
    "Pitfalls: stock-looking generic scenes when you have their real photos; a photo of another business; invented prices, hours, awards or reviews; tiny address text.",
  ],
  offer: [
    "## Recipe: offer, sale or promo",
    "Goal: the offer is understood in 2 seconds and feels urgent, without lying.",
    "Ideas:",
    "- The number is the hero: the discount or price builds, stamps or counts in huge, then the product swings in behind it.",
    "- Countdown energy: a ticking or ticking-down rhythm that ends on 'ends <date>' (only a date they gave).",
    "- Unboxing the deal: a tag, box or card opens to reveal the offer.",
    "Beats:",
    "- Hook (0-1.5 s): the offer itself, huge, exactly as they wrote it.",
    "- 1-2 beats on what you get (the product, their photos), fast cuts on the beat.",
    "- Repeat the offer with the condition or deadline they gave.",
    "- End card: name, the code or link, and the next step, held at least 2 s.",
    "Moves: stamp or slam on the number with an impact, quick zoom punches on beats, a riser into the offer, a price tag swing.",
    "Music: pulse 120-128 bpm or punchy; hits on every reveal.",
    "Pitfalls: inventing a discount, price, deadline or 'limited stock'; small offer text; the offer appearing only at the end; a crossed-out 'old price' they did not give.",
  ],
  general: [
    "## Recipe: any other video",
    "Goal: one clear feeling and one next step.",
    "Ideas:",
    "- One object all the way: a single thing from their world travels through every scene and lands in the end card.",
    "- A change you can see: something goes from problem to solved on screen.",
    "- The craving close-up: the best real thing they have, close and moving.",
    "Beats:",
    "- Hook in the first 1-2 s: a moving picture plus 2-4 words, never a title card.",
    "- 2-3 beats, each one idea, each growing out of the last.",
    "- End card: name, logo, next step, held at least 2 s.",
    "Pitfalls: a slideshow of equal-length cards; a title card first; invented claims; text too small for a phone.",
  ],
};

/** The recipe block for ./studio.md. */
export function recipeBlock(id: RecipeId): string[] {
  return RECIPES[id];
}
