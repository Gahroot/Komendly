// Ozzy Studio: the ./studio.md brief block and the per-turn prompt the agent receives.
import { STUDIO_MAX_SECONDS } from "../../../src/lib/studio/contracts";
import { type BriefPhoto, describePhoto } from "./brand-photos";
import { classifyRecipe, recipeBlock } from "./recipes";
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

/** userText: what the user asked for in this chat (picks the one job recipe included). */
export function studioBrief(o: { brand: BriefBrand | null; uploads: BriefUpload[]; paid: boolean; userText?: string }): string {
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
  lines.push("", ...recipeBlock(classifyRecipe({ userText: o.userText ?? "", uploads: o.uploads, brand: o.brand })));
  if (o.uploads.some((u) => u.reference)) lines.push("", ...REMIX_RULES);
  return lines.join("\n") + "\n";
}

/** The ./kit building blocks + craft rules: lets cheaper models compose polished parts instead of drawing from scratch. */
export const CRAFT_RULES = [
  "## Building blocks (./kit) - use them",
  "- ./kit/starters/*.html (see INDEX.md) are older, plainer skeletons (start from kit/bin/new-video.mjs instead): timeline wiring, scene switching, safe zones for 9:16, 1:1 and 16:9. Borrow their mechanics when useful, NEVER their look (flat colour fields, cards on blank backgrounds, clip-art heroes). When ./concept.md exists, it decides the look.",
  "- ./kit/illustrations/*.svg (latte-cup, croissant, storefront, van, toolbox, phone, laptop-dashboard, ...) and ./kit/icons are for small accents and callouts only, never the hero of a video, unless the user asked for an illustrated or cartoon style.",
  "- ./kit/icons/*.svg: 2,000+ line icons for any trade (tooth, paw-print, scissors, car, wrench, ...); find names with `grep -i <word> kit/icons/INDEX.txt`. They use stroke=currentColor: inline the SVG (or use it as a CSS mask) and set color to recolour.",
  "- Images, in this order: (1) their uploads/footage; (2) ./brand/photos (their real business): use them as hero images in rounded cards or frames with depth (shadow, plate) and slow ken-burns motion; (3) ./brand/site pieces of their real website (show them big and crisp: in a browser frame, as floating cards with shadow, or zoom into the part that matters; great for pricing, reviews and services); (4) a ./kit/illustrations piece when one fits; (5) ./kit/icons for accents and callouts; (6) generate an image ONLY when none of these fit the subject (one or two max). Never show a photo of another business.",
  "- Fonts in ./kit/fonts (Fraunces, Bricolage Grotesque, Host Grotesk) are already wired in the starter. Their brand fonts win when given.",
  "",
  "## Motion technique library (./kit/library) - moves, not looks",
  "- First run `node kit/bin/library.mjs look . brand` and paste what it prints into index.html's head, with class=\"look-brand\" on the root: every piece then uses their brand colours and fonts through tokens (var(--accent), var(--display), ...). Never use another library look when the brand look exists, and never hardcode colours or fonts in a piece.",
  "- Find techniques with `node kit/bin/library.mjs search <words>` (e.g. counter, word swap, browser, before after, light leak, grain, iris, marquee, chat); `show <id>` gives its preview and source; `add . <id>` copies it into ./compositions. Use 2-4 per video where they serve the concept.",
  "- Pieces are techniques (transitions, type moves, backgrounds, UI, data, frames, textures): rewrite their text, layout and size for THIS video. Their sample words, names and numbers are placeholders: never keep them; only real facts from the user or their brand.",
  "- Pieces are 1920x1080: set data-width/data-height and the piece root to this video's size, and data-start/data-duration to fit your timeline. Kit moves need <script src=\"assets/kit/moves.js\"> after GSAP (calls in kit/library/build-sheet.md). Stay seek-safe: no Math.random, timers or infinite CSS animations.",
  "",
  "## Atmosphere (what makes it feel alive)",
  "- Every scene is a world, not a slide: a layered background with depth (a real or generated photo, soft gradients, haze, light leaks, film grain, bokeh, texture), lighting (glow, rim light, shadows that agree), a colour grade. Never a flat solid fill, never a card floating on a blank colour.",
  "- Heroes are real or photographic: their footage, their photos, their website, or images you GENERATE (1-3 per video when they have nothing good: describe subject, light, lens and mood; no text in the image). Clip-art is never the hero.",
  "- Emotion first: decide what the viewer should feel (craving, relief, excitement, trust) and let light, pace, music and words all serve it.",
  "",
  "## Motion system (./kit/punch.js, ./kit/patterns.md): any kind of video",
  "- Ozzy makes ANY video: ads and promos, but also stories, explainers, celebrations, lyric or quote pieces, title sequences, footage edits. Shape the structure from the request and ./concept.md, never from a fixed template.",
  "- Start a new composition with `node kit/bin/new-video.mjs <folder> <9:16|16:9|1:1>`: a blank, working canvas (their brand palette and fonts, a living background, punch.js wired, one PLACEHOLDER scene to replace). For an ad or promo, start from the finished sample ad instead (`--example ad`) and rewrite or restructure all of it for this request (no sample word may survive); for anything else start blank. kit/punch/punch-9x16.html and punch-16x9.html are worked examples of the craft: read one before building.",
  "- Build the timeline with `const P = Punch(tl, { seed: N })` and its helpers (slam, pop, rise, type, counter, swap, strike, click, stack, pixelWipe, drift, bob, ring, glow, burst, ...) instead of hand-written tweens. It reads the palette vars (--accent, --accent-2, --ink, --paper, --display, --serif).",
  "- ./kit/patterns.md: measured patterns from frontier-made videos (hooks, product demos, quotes, offers, end cards, carries between scenes). Use what fits this video.",
  "- Always alive: something visibly moves at every moment (the check measures it; aim for 85%+ of the time, like frontier work): an ambient layer runs the whole video (the mascot or subject bobs, blinks, sways or reacts; background layers drift in parallax; big particles or shapes float; glows pulse; a ticker runs), on top of the beats. Subtle specks don't count; motion must be big enough to see on a phone.",
  "- Density: something new starts every 0.5-1 s; entrances 0.28-0.36 s, exits 0.16-0.25 s; only drifts and ambient motion run longer than 1 s. Held words stay alive (P.drift, P.punch, P.bob, a counter).",
  "- Never an empty moment: bring the next beat in WHILE the last one leaves (a wipe, push, carry or overlap). The automatic check flags any half-second where nothing readable is on screen.",
  "- Layer every scene: a world (photo, footage, gradient, glow, texture) plus a subject plus words, and, when it fits, an object that acts (a card, chips, a chat bubble, a list that ticks, a counter, a cursor). A single photo with a caption is a slide, not a scene.",
  "- Composition: build each frame on a clear axis (centred, or a strong grid): the main words big and in the middle band of the frame with the subject or object right under or behind them, balanced margins. Never a small headline parked in a top corner with the middle of the frame empty, and never two layers fighting for the same spot (the check flags words drawn over words and things cut off by the frame edge).",
  "- Big and readable: anything the viewer must read (UI, screenshots, example work, chat bubbles) fills at least 60% of the frame width; zoom into the part that matters rather than showing a whole page small. Text inside mockups follows the same sizes as everything else (2+ words under 36 px on a 1080-wide frame fails the check): fewer, bigger words. Show example work one or two at a time, big; a wall of small examples only as a quick accent.",
  "- A mascot or character in their brand (./brand, uploads) is a gift: make it the guide that reacts and acts through the video.",
  "- Build the concept's signature world as persistent layers behind every scene (#bg: CSS/SVG shapes, gradients, a generated backdrop, particles) that move gently and change with the story (light shifts, things appear), so scenes feel like one place, not slides on a gradient.",
  "- Pair a heavy sans display line with an italic serif accent word (var(--serif)) unless the concept says otherwise. Seek-safe: no Math.random (use P.rnd), no timers, no tl.call; change text only through P.type, P.counter or P.swap.",
  "- Ads end on a strong card: their name or logo, the offer or next step and how to reach them, with a button P.pop + P.ring and a P.bob running until the last frame. Other videos end however the story should.",
  "",
  "## Make it move",
  "- Something new HAPPENS at least every second, except the end card: words build or swap, a number counts, the product is poured/opened/tapped/assembled, a cursor clicks, a highlight sweeps, an element travels into the next scene. A slow zoom, drift or parallax on a photo is atmosphere, never the action (the automatic check counts it as a held shot).",
  "- Frame 0 is the thumbnail in a muted feed: the hook words and the subject are already readable in the very first frame (start reveals from mostly visible, never from nothing or mid-mask), then move.",
  "- Every scene has an action (something pours, opens, gets pressed, assembles, travels), not just words arriving.",
  "- Scenes grow out of each other: carry one thing (an object, a shape, a colour, the camera move) across each change instead of cutting to a new slide.",
  "- Vary the pace: quick beats next to one calm moment; never equal-length scenes.",
  "- Phone readable (on a 1080-wide frame): headlines 110 px or more, no text under 44 px, all text inside the safe zone. Text never sits half-transparent or mid-transition for more than a beat.",
  "- Software, apps and websites: their REAL product is the hero (./brand/site screenshots, their screen recordings or uploads), shown big and doing something; never stock monitors or devices with decorative screens. When the user asks to SHOW a flow you have no recording of (a chat, typing a URL, an edit landing), rebuild it as a clean stylized UI in their brand (input fields, chat bubbles, buttons, the result appearing) like any product ad does; never refuse or skip it, and never let screenshots of their example work read as the advertised business.",
  "- Their footage: it's the hero, but dress it like a motion designer: type that interacts with the shot (behind the subject, wiping with a move, framed in shapes), punch-ins and speed ramps on the beat, split screens, matched cuts. Never just full-screen clips with captions on top.",
  "- Ads and promos end on a card: their name or logo, the offer or next step, and how to reach them (their website or phone when known), big enough to read.",
  "",
  "## Craft rules",
  "- Plan first: write ./plan.md with 3-6 scenes (seconds, the exact on-screen words, which illustration or footage), then build. Total must match the length asked.",
  "- One idea per scene: 2-6 big words, at most one short sub line. Type: eyebrow (small caps) > headline (huge) > sub. Every text stays readable at least 1.2 s after it lands.",
  "- Music library: for upbeat, vlog-style, chill, warm or cinematic beds, start with real tracks: `node kit/bin/music.mjs search <mood and business words> --seconds <length> [--energy 1-5]`, then `node kit/bin/music.mjs use <id> <folder>` and add the printed file as the composition's audio. Land cuts and slams on its printed hit times. Pick a different track for each video. The studio adds the credit line for the user itself.",
  "- Use score-synth instead when you need an exact custom tempo, sound effects or stingers, or no library track fits; you can layer score-synth sound effects over a library track.",
  "- Sound: unless the user says no music, every video gets its own music bed and sound effects, made with `node kit/bin/score-synth.mjs audio/score.json audio/` (read the top of that file for the score format). Pick the music for THIS business and mood, never a default: e.g. lofi 75-90 bpm for cafes, bakeries and cozy brands; pulse 120-128 bpm for sales, launches, fitness and bold offers; cinematic for premium, real estate, emotional or before/after reveals; minimal for clean tech and SaaS. Choose your own key, chords and seed every time; give it a hook (a riser into the offer, an impact on the price or logo). No bland corporate bed.",
  "- On the beat: choose the bpm while planning (one beat = 60/bpm s, one bar = 4 beats) and land scene changes on bar lines and big landings (headline, price, logo) on beats. Every sound effect voices an on-screen event: write ./audio/cues.json as {\"version\":1,\"cues\":[{\"t\":<seconds>,\"sfx\":\"whoosh\",\"name\":\"scene 2 in\"}, ...]} (whoosh on a slide, pop on a card landing, impact on the price, chime on the logo), set \"cues\": \"cues.json\" in the score, and update it whenever you retime. Use tempo-map.json's suggested music volume. Add audio/music.wav and audio/sfx.wav to the composition as <audio> elements.",
  "- Fill the frame: no scene may leave a third or more of the frame empty (a bare white or flat band). A photo is either full-bleed (with a dark scrim behind the text) or a big card centred in the space with the text; never a photo stuck in one half with nothing in the other. Use different photos across scenes when you have several.",
  "- Write and edit files with your file tools, never with echo or an unquoted shell heredoc: the shell eats dollar signs and digits ($40 becomes 0).",
  "- Copy: say the offer exactly as the user said it. Never invent prices, dates, discounts, claims or reviews.",
  "- Self-check before you finish (one contact sheet of the whole video, then fix and check once more): no cut-off or overlapping text, no detached or broken parts of an object, no blank or half-built frames, enough contrast on every frame, the brand name and offer readable, the end card holds at least 2 s.",
];

/** What the agent receives this turn: the user's words plus a short note about new files. */
export const STUDIO_NO_RENDER_NOTE = "Do NOT run hf render, motion-blur.mjs or reveal.mjs: build the composition, check stills, and stop; the studio renders the final video itself.";

/** "Remix any ad": take a reference ad's measured rules (pace, stillness, shot lengths, style), never its scenes. */
export const REMIX_RULES = [
  "## Remixing a reference ad",
  "- The user showed you an ad they like (the REFERENCE AD file). Make THEIR version of it: its feel and rhythm, their brand and their story.",
  "- 1. Measure it first: `node kit/bin/reference-study.mjs uploads/<reference file> --out reference-study` (writes report.md with the still share, rests, hard cuts, bursts and shot lengths, plus sheet-shots.jpg and sheet-timeline.jpg). Look at both sheets and read report.md. If it has speech, read the on-screen captions or listen with the tools you have. For a still image ad, study the layout instead.",
  "- 2. Write a beat map in ./remix-beats.md: the numbers you will match (shot length median and range, cuts a minute, still share, where bursts fall), the hook (first 1-3 s), the one rule every element obeys (e.g. every word types in, everything sits on a card), type size as a share of the frame, palette mood, transitions and music feel.",
  "- 3. Build the user's story to those rules: your shot lengths, cut rate and still share within about 20% of the reference, bursts at the same points in the length. The beats follow THEIR offer and brand (logo, colours, fonts, product), not the reference's scene order.",
  "- NEVER copy the original's logos, people, footage, frames, brand or product names, music or exact wording, and never remake it scene by scene. Borrow measured rules and style only; write new copy for the user's business.",
  "- Same length and aspect ratio as the reference unless the user asks otherwise (still within the length cap). A still image ad becomes a still-style or short animated ad with the same layout.",
  "- In your reply, say in one or two plain lines what you kept from the reference (e.g. \"the 1-second hook, quick 2-second shots, big bold captions\") and that it's built for their brand. Never mention reports, measurements or tools.",
];

export function turnPrompt(o: { userText: string; firstTurn: boolean; attached: BriefUpload[]; concept?: boolean }): string {
  const note: string[] = [STUDIO_NO_RENDER_NOTE];
  if (o.concept) note.push("Your creative director wrote ./concept.md for this video: build THAT concept (its world, atmosphere, scenes, words, images and sound). Its Build spec gives every element's words, position, size, font, colour and move: follow it exactly (adjust only to fix something broken, like an overflow). The kit is only for parts and timing, never the look.");
  const ref = o.attached.find((a) => a.reference);
  if (ref) note.push(`This is a remix: ./uploads/${ref.file} is the reference ad. Follow "Remixing a reference ad" in ./studio.md (measure it with kit/bin/reference-study.mjs, write the beat map, then build their story to its pace and style; never its scenes, footage, logos, people, names or exact copy).`);
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
