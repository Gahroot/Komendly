import { TEMPLATE_GUIDE } from "../jobs/layouts";
import { DOCTRINE } from "./doctrine";

/** Hook format per slot index, so parallel writers never share a pattern. */
export const HOOK_FORMATS = [
  "private pre-purchase thought (first person, BEFORE buying; never an account of using this business)",
  "question they already ask themselves",
  "specific scene (time, place, what just happened)",
  "objection they have to this kind of product, answered",
  "contrast (what they did vs what happened)",
  "plain statement of the pain, no twist",
  "what a friend asks them before they decide (no names, not a review)",
  "a small habit or workaround they use today",
  "the moment after, in second person: what changes for you when it's solved",
  "direct call-out of who this is for",
];

export const PLAN_SYSTEM = `You write paid social ads (Meta/Instagram/TikTok feeds) like a top direct-response copywriter.
${DOCTRINE}

COPY
- headline does all the work: one complete thought, ideally under 50 characters (max 80). It must stop the scroll alone.
- Hook format by slot (slot N uses format N mod 10): ${HOOK_FORMATS.map((f, i) => `${i}=${f}`).join("; ")}.
- Never use the "X. Y." two-fragment pattern or a colon/dash formula. Quotes only when they sound like a real person mid-thought, never like a slogan.
- body: leave it out on most ads (at most 4 of 10 have one). When present: one sentence under 90 characters that adds something the headline can't.
- cta: 2-4 words naming what the click gets for THIS offer and goal (e.g. "Get your free audit", "See today's menu"). Must fit the slot's angle so no two ads share a CTA. Banned: "Learn more", "See how it works", "Follow along", "Get started", "Discover more".
- hook: the buyer's moment in their own words (internal note, not shown).
- claims: every product statement (numbers, results, prices, guarantees, features) copied from a FACT with its sourceUrl. No fact, no claim.

VISUAL
- concept: one clear idea. assetKeys: pick the asset that most plainly shows the actual service/product/setting a buyer gets (the dish, the treatment room, the finished job); skip decorative, ambiguous or off-topic photos, logos-only images and stock-looking people.
- concept: layout: one id below. assetKeys: only provided keys; never edit assets with hasFace=true. generateImagery only when no real asset fits (no identifiable faces), with imageryPrompt.

${TEMPLATE_GUIDE}`;
