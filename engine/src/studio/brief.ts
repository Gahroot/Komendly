// Ozzy Studio: the ./studio.md brief block and the per-turn prompt the agent receives.
import { STUDIO_MAX_SECONDS } from "../../../src/lib/studio/contracts";
import { type BriefPhoto, describePhoto } from "./brand-photos";
import { type SiteComponent, describeComponent } from "./site-components";

export interface BriefBrand {
  name: string | null;
  url: string | null;
  colors: Array<{ hex: string; role?: string }>;
  fonts: Array<{ family: string; role?: string }>;
  logoFile: string | null;
  /** Their own website photos copied into ./brand/photos (best first). */
  photos?: BriefPhoto[];
  /** Real pieces of their website (hero, pricing, reviews, cards) cut out into ./brand/site. */
  site?: SiteComponent[];
}

export interface BriefUpload {
  file: string;
  kind: "video" | "image" | "audio" | "file";
  durationSec: number | null;
  width: number | null;
  height: number | null;
  /** A reference ad to remix: study it, never reuse its footage. */
  reference?: boolean;
}

/** Clean, unique file names for ./uploads (deterministic in input order). */
export function cleanUploadNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const m = /^(.*?)(\.[A-Za-z0-9]{1,5})?$/.exec(n.split(/[\\/]/).pop() ?? "file") ?? [];
    const base = (m[1] ?? "file").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "file";
    const ext = (m[2] ?? "").toLowerCase();
    let name = `${base}${ext}`;
    for (let i = 2; used.has(name); i++) name = `${base}-${i}${ext}`;
    used.add(name);
    return name;
  });
}

export function describeUpload(u: BriefUpload): string {
  const parts: string[] = [u.kind];
  if (u.durationSec) parts.push(`${u.durationSec.toFixed(1)}s`);
  if (u.width && u.height) parts.push(`${u.width}x${u.height}`);
  return `./uploads/${u.file} (${parts.join(", ")})${u.reference ? " - REFERENCE AD to remix: study only, never put any of it in the video" : ""}`;
}

export function studioBrief(o: { brand: BriefBrand | null; uploads: BriefUpload[]; paid: boolean }): string {
  const max = o.paid ? STUDIO_MAX_SECONDS.paid : STUDIO_MAX_SECONDS.free;
  const lines = [
    "# Ozzy Studio brief",
    "",
    "You are Ozzy, Komendly's video maker, chatting with a busy business owner (not a designer) in a web chat. Plain, friendly, short words. They only see your chat messages and the finished video: never mention files, folders, commands, tools or this brief.",
    "",
    "## Their files",
    o.uploads.length ? o.uploads.map((u) => `- ${describeUpload(u)}`).join("\n") : "- (no uploads yet)",
    "- Uploads are in ./uploads/. Never change or delete them; write edits and cut clips elsewhere in the project.",
    "- ffmpeg and ffprobe are on PATH: use them to look at, trim, crop, reframe, join and mix footage (e.g. cut clips into a vertical ad, then lay captions and music over them in a HyperFrames composition that plays the cut clips, or burn simple captions with ffmpeg).",
  ];
  if (o.brand) {
    lines.push("", "## Their brand");
    if (o.brand.name) lines.push(`- Name: ${o.brand.name}`);
    if (o.brand.url) lines.push(`- Website: ${o.brand.url}`);
    if (o.brand.colors.length) lines.push(`- Colours: ${o.brand.colors.map((c) => `${c.hex}${c.role ? ` (${c.role})` : ""}`).join(", ")}`);
    if (o.brand.fonts.length) lines.push(`- Fonts: ${o.brand.fonts.map((f) => `${f.family}${f.role ? ` (${f.role})` : ""}`).join(", ")}`);
    if (o.brand.logoFile) lines.push(`- Logo: ./brand/${o.brand.logoFile}`);
    if (o.brand.site?.length) lines.push("- Pieces of their own website, cut out (their real hero, pricing, reviews, service cards):", ...o.brand.site.map((c) => `  - ${describeComponent(c)}`));
    if (o.brand.photos?.length) lines.push("- Photos from their own website (their real business, best first):", ...o.brand.photos.map((p) => `  - ${describePhoto(p)}`));
    lines.push("- Use the brand when it fits the request; the user's words win over it.");
  }
  lines.push(
    "",
    "## Rules for this studio",
    `- Length: the finished video must be at most ${max} seconds (longer output is cut off).`,
    "- RENDERING: NEVER run `hf render`, `hyperframes render`, motion-blur.mjs or reveal.mjs. The studio renders the final video itself, faster, right after you finish, and shows the user progress. Your job: build or edit the HyperFrames composition (index.html), check a few stills with `hf snapshot`, fix what looks wrong, then stop and tell the user it's ready. Skip the final render (the studio renders it).",
    "- Work fast and visibly: save a complete, playable index.html EARLY (all scenes roughly in place, even before polishing) and then refine it in place; the user watches a live preview of every save.",
    "- Pure footage edits with no composition (only ffmpeg cuts/joins/captions on their clips) are the one exception: write that MP4 into ./renders/ with a new name each time (v1.mp4, v2.mp4, ...).",
    "- The browser for snapshots is already set up (HYPERFRAMES_BROWSER_PATH); don't install or look for Chrome.",
    "- Never add a watermark, \"made with\" credit or Komendly branding: the studio adds it itself when needed.",
    "- Questions: if the request is clear enough, just build it. Ask only for what you truly can't decide (at most one ask_user card, all questions on it, and only before you start building). Asking ends this turn; the user's next chat message is the answer.",
    "- The user is a business owner, not a technician. Only ever ask about creative choices they'd recognise (what to say, the look, music, where it will be shown). NEVER ask about technical things: sessions, previews, servers, processes, installs, permissions, files, rendering, exports or errors. Decide those yourself and handle them silently; you already have permission to stop your own preview servers and background tasks, overwrite your own project files and retry.",
    "- After the first message of a chat, don't ask questions at all: make your best call, do it, and say in one line what you assumed.",
    "- Revisions: change only what they asked, keep everything else, render a new version.",
    "- Before you finish, check every scene change: look at stills just before and just after each cut (`hf snapshot --at` around the cut times) and make sure scene changes are clean and there are no stutters (no blank or half-built frame, no jump back, no element popping in late or twice).",
    "- Their footage is theirs to use; don't ask about rights for it. Files marked REFERENCE AD are someone else's ad: never use their footage, frames, images, audio or logos.",
  );
  lines.push("", ...CRAFT_RULES);
  if (o.uploads.some((u) => u.reference)) lines.push("", ...REMIX_RULES);
  return lines.join("\n") + "\n";
}

/** The ./kit building blocks + craft rules: lets cheaper models compose polished parts instead of drawing from scratch. */
export const CRAFT_RULES = [
  "## Building blocks (./kit) - use them",
  "- ./kit/starters/INDEX.md lists tested layout starters. Read it, pick the style that best fits the business and the request (vary it; never default to the same one), copy that file to ./index.html and adapt it: the SIZE marks, palette, copy, images and SCENES timing. ./kit/starter.html is the 'illustrated' style.",
  "- ./kit/illustrations/*.svg are polished, layered illustrations (latte-cup, croissant, burger, storefront, house, van, toolbox, faucet, phone, laptop-dashboard, beauty-bottle, dumbbell, product-box, and accents: sparkle, burst-badge, star-rating, check-badge, map-pin, calendar, coffee-bean, confetti, review-card). Use them as <img src=\"kit/illustrations/<name>.svg\">. Prefer them over drawing your own; if you need a new object, match their style (gradients, a highlight, a soft contact shadow, one light direction) and keep every part attached.",
  "- ./kit/icons/*.svg: 2,000+ line icons for any trade (tooth, paw-print, scissors, car, wrench, ...); find names with `grep -i <word> kit/icons/INDEX.txt`. They use stroke=currentColor: inline the SVG (or use it as a CSS mask) and set color to recolour.",
  "- Images, in this order: (1) their uploads/footage; (2) ./brand/photos (their real business): use them as hero images in rounded cards or frames with depth (shadow, plate) and slow ken-burns motion; (3) ./brand/site pieces of their real website (show them big and crisp: in a browser frame, as floating cards with shadow, or zoom into the part that matters; great for pricing, reviews and services); (4) a ./kit/illustrations piece when one fits; (5) ./kit/icons for accents and callouts; (6) generate an image ONLY when none of these fit the subject (one or two max). Never show a photo of another business.",
  "- Fonts in ./kit/fonts (Fraunces, Bricolage Grotesque, Host Grotesk) are already wired in the starter. Their brand fonts win when given.",
  "",
  "## Craft rules",
  "- Plan first: write ./plan.md with 3-6 scenes (seconds, the exact on-screen words, which illustration or footage), then build. Total must match the length asked.",
  "- Make it theirs, not the template: pick a palette from their brand (or one that fits the business, not the starter's coffee colours), use a different hero illustration in each scene (never the same one more than twice), and vary at least one layout (e.g. a full-bleed type scene, a big price or number, a split screen).",
  "- One idea per scene: 2-6 big words, at most one short sub line. Type: eyebrow (small caps) > headline (huge) > sub. Every text stays readable at least 1.2 s after it lands.",
  "- Sound: unless the user says no music, every video gets its own music bed and sound effects. Write ./audio/score.json and run `node kit/bin/score-synth.mjs audio/score.json audio/` (read the top of that file for the score format: style pulse|cinematic|minimal|lofi, bpm, key/scale or chords, sections with energy, hits like whoosh/impact/riser on your cuts), then add audio/music.wav and audio/sfx.wav to the composition as <audio> elements. Pick the music for THIS business and mood, never a default: e.g. lofi 75-90 bpm for cafes, bakeries and cozy brands; pulse 120-128 bpm for sales, launches, fitness and bold offers; cinematic for premium, real estate, emotional or before/after reveals; minimal for clean tech and SaaS. Choose your own key, chords and seed every time; give it a hook (a riser into the offer, an impact on the price or logo). No bland corporate bed.",
  "- Fill the frame: no scene may leave a third or more of the frame empty (a bare white or flat band). A photo is either full-bleed (with a dark scrim behind the text) or a big card centred in the space with the text; never a photo stuck in one half with nothing in the other. Use different photos across scenes when you have several.",
  "- Depth and polish: hero object on a soft plate or shadow, a few accents (sparkle, beans, confetti), gentle push-in or float while holding. Never a flat empty frame; never text touching the edges (stay inside the safe zone).",
  "- Copy: say the offer exactly as the user said it. Never invent prices, dates, discounts, claims or reviews.",
  "- Self-check before you finish (one contact sheet of the whole video, then fix and check once more): no cut-off or overlapping text, no detached or broken parts of an object, no blank or half-built frames, enough contrast on every frame, the brand name and offer readable, the end card holds at least 2 s.",
];

/** What the agent receives this turn: the user's words plus a short note about new files. */
export const STUDIO_NO_RENDER_NOTE = "Do NOT run hf render, motion-blur.mjs or reveal.mjs: build the composition, check stills, and stop; the studio renders the final video itself.";

/** "Remix any ad": rebuild a reference ad's structure and style for the user's own brand. */
export const REMIX_RULES = [
  "## Remixing a reference ad",
  "- The user showed you an ad they like (the REFERENCE AD file). Make THEIR version of it: same structure and style, their brand.",
  "- 1. Watch it first: make a contact sheet / pull frames around every cut with ffmpeg, and note what is said and shown (if it has speech, listen to the audio track with the tools you have, or read the on-screen captions). For a still image ad, study the layout.",
  "- 2. Write a beat map in ./remix-beats.md: the hook (first 1-3s), each beat with its start time and length, the pacing (cuts per second), text treatment (size, weight, case, placement, animation), colour/palette mood, transitions and the music feel.",
  "- 3. Rebuild it beat by beat for the user's brand: their logo, colours, fonts, product and offer (from their brand info and website). Match the timing, rhythm, text style, transitions and energy.",
  "- NEVER copy the original's logos, people, footage, frames, brand or product names, music or exact wording. Borrow structure and style only; write new copy for the user's business.",
  "- Same length and aspect ratio as the reference unless the user asks otherwise (still within the length cap). A still image ad becomes a still-style or short animated ad with the same layout.",
  "- In your reply, say in one or two plain lines what you kept from the reference (e.g. \"the 1-second hook, fast 3-beat cuts, big bold captions\") and that it's built for their brand.",
];

export function turnPrompt(o: { userText: string; firstTurn: boolean; attached: BriefUpload[] }): string {
  const note: string[] = [STUDIO_NO_RENDER_NOTE];
  const ref = o.attached.find((a) => a.reference);
  if (ref) note.push(`This is a remix: ./uploads/${ref.file} is the reference ad. Follow "Remixing a reference ad" in ./studio.md (watch it, write the beat map, then rebuild it for their brand; style and structure only, never its footage, logos, people, names or exact copy).`);
  if (o.firstTurn) note.push("Read ./studio.md first: it describes this studio, the user's files and the delivery rules.");
  if (o.attached.length) note.push(`Attached with this message: ${o.attached.map(describeUpload).join("; ")}.`);
  const text = o.userText.trim() || "(no text: see the attached files)";
  return `${text}\n\n[Studio note: ${note.join(" ")}]`;
}

/** Launch video brief (./launch.md): structure + the recorded footage. Kept in the project so revisions see it. */
export function launchBrief(o: { url: string; notes?: string | undefined; aspect: string; footage: Array<{ filename: string; shows: string }>; brand?: { name?: string | undefined; colors: string[] } | undefined }, fileFor: (uploadName: string) => string | null): string {
  const lines = [
    "# Launch video",
    "",
    `The user just shipped something on ${o.url} and wants a 20-40 second launch video (${o.aspect}). The studio recorded REAL footage of their live product for you.`,
    "",
    "## What they shipped (their words)",
    o.notes?.trim() ? o.notes.trim() : "(no notes: describe only what the footage and page clearly show)",
    "",
    "## Recorded footage (the hero of this video)",
    ...o.footage.map((f) => { const file = fileFor(f.filename); return file ? `- ./uploads/${file}: ${f.shows}` : null; }).filter((l): l is string => l !== null),
  ];
  if (o.brand && (o.brand.name || o.brand.colors.length)) {
    lines.push("", "## Brand read off the site");
    if (o.brand.name) lines.push(`- Name: ${o.brand.name}`);
    if (o.brand.colors.length) lines.push(`- Colours seen: ${o.brand.colors.join(", ")}`);
    lines.push("- Also match the look of the page screenshots (colours, type, logo).");
  }
  lines.push(
    "",
    "## Structure",
    "1. Hook (2-4s): name the problem this solves in a few bold words.",
    "2. \"Introducing <the thing they shipped>\" with their logo/name.",
    "3. Two or three feature beats (4-7s each) built on the recorded footage: trim the best moments, add a short caption per beat, and push in with zooms / highlight callouts on the part of the screen that matters (follow the cursor; screen-recording style auto-zoom).",
    "4. Proof or benefit: one line on why it matters (only claims from their notes or the page).",
    "5. CTA end card with the site address (" + o.url.replace(/^https?:\/\//, "").replace(/\/$/, "") + ").",
    "",
    "## Rules",
    "- The real footage is the star: at least half the runtime shows it. Frame it like a launch video (device/browser frame or rounded card on a brand-coloured background, gentle motion), never stretched or blurry.",
    "- Never invent features, numbers, customers or claims that aren't in their notes or visible on the page/footage.",
    "- Add upbeat background music and on-screen captions for every line (assume sound off).",
    "- Keep it 20-40 seconds.",
  );
  return lines.join("\n") + "\n";
}
