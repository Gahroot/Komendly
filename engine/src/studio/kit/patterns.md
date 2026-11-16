# Choreography patterns (distilled from hand-made frontier ads)

Use with `./kit/punch.js`: `const P = Punch(tl, { seed: 7 })`. Times are in seconds on a paused timeline.
Working references: `examples/bike-shop-9x16/index.html` (9:16) and `examples/salon-saas-16x9/index.html` (16:9).

## Density rules (measured from the frontier sources)

- **Never hold.** None of the 10 Ozzy ads or the meta ads checked has a frozen second; 4 of 5 hype films have none either.
  Something starts moving at least every 0.5 s in a hook and at least every 1.0 s elsewhere. While text is being read,
  keep it alive with `drift`, `punch`, `bob`, `wiggle`, `stars` or a counter.
- **Tween rate:** 9:16 ads run 4-6 tweens per second in hooks (up to 10 per second in meta ads); 16:9 films run 3.6-5 per second.
- **Durations:** the median tween is 0.28-0.34 s in 9:16 ads and 0.45-0.5 s in 16:9 films.
  - Entrances: 0.28-0.36 s slams, 0.4-0.5 s pops and rises.
  - Exits: 0.16-0.25 s.
  - Shakes and wiggles: 0.05-0.12 s per swing.
  - Only drifts and ambient motion run longer than 1 s.
- **Beats:** a new beat, meaning a new line, card, click or cut, every 0.25-0.6 s in hooks and every 0.5-1.0 s in the body.
  A hook lands 3-6 lines or objects in 2.8 s.
- **Hook length:** 2.8-3.0 s, then a hard scene change. The first big type lands at 0.0 s, never on an empty frame.
- **Layers per frame:** 4-7.
  1. Background gradient.
  2. Texture: stars, pixel field or grain at about 7% opacity.
  3. Glow behind the main beat.
  4. One or two type sizes.
  5. A product object: UI card, chips, phone or price.
  6. Accents: burst, cursor, sticker or pill.
- **Type pairing:** a heavy sans display line with an italic serif accent word in the accent colour, plus small uppercase
  letter-spaced labels. Use three sizes per frame.
- **Type sizes on 1080x1920:**
  - Hook lines: 124-300 px (median 170-200).
  - A single hero word: up to 520 px.
  - Body headlines: 130-150 px.
  - UI text: 36-60 px.
  - Labels: 34-40 px.
  - Nothing below 34 px.
- **Type sizes on 1920x1080:**
  - Headlines: 104-150 px.
  - Hero numbers: 200-330 px.
  - UI: 24-44 px.
  - Labels: 24-30 px.
- **Text hold:** a hook line stays on screen 0.6-1.3 s. A body line stays about 0.5 s per 3 words, and never more than 2.5 s
  without a punch or drift on it. Quotes may sit for 2.5-3 s if a highlight sweeps through them.
- **Never** build a scene from one photo plus one caption. Every scene needs at least one product-like object:
  a UI card, chips, a price, a chat bubble, a calendar or a list.

## 1. Hook patterns (0-2.8 s)

All hooks use the same skeleton: **problem (0-1.25)**, **clear the stage (1.25-1.4)**, **answer (1.4-2.4)**,
**cover-wipe (2.45)**.

### 1a. Slam, clear, slam (the default)
Use it for any problem-and-answer message. Beats: 0.0, 0.18, 0.4 (object), 0.62; clear at 1.3; 1.4, 1.55; pill at 1.85.
```js
P.slam("#h1 .t", 0.0, { from: 1.35 }); P.slam("#h2 .t", 0.18, { from: 1.5 });
P.pop("#card", 0.4, { from: 1.25, y: -60, r: -4 }); P.slam("#h3 .t", 0.62);
P.out("#h1 .t", 1.3, { y: -260 }); P.whipOut("#h2 .t", 1.3, { dir: "left", r: -8 });
P.whipOut("#h3 .t", 1.3, { dir: "right", r: 6 }); P.fly("#card", 1.3, { y: 1500, r: -24 });
P.glow("#s1", 1.45); P.slam("#h4 .t", 1.4, { from: 1.7 }); P.slam("#h5 .t", 1.55, { from: 2.0, r0: -4 });
P.pop("#pill", 1.85, { from: 0.3 });
const mid = P.pixelWipe("#root", 2.45); P.hide("#s1", mid); P.show("#s2", mid);
```

### 1b. "No X. No Y." strike
Use it to dismiss old ways of working (tools, agencies, chores). Each line slams, then is struck 0.34 s later.
The old tools pile up as cards and fall away at 1.3.
```js
P.slam("#h1 .t", 0); P.strike("#h1 .t", 0.34);
P.slam("#h2 .t", 0.5); P.strike("#h2 .t", 0.84);
P.stack(".tool", 0.12, { stagger: 0.12, y: 260, r: [-3, 2, -1.5] });
P.fly(".tool", 1.28, { y: 1400, r: -30, stagger: 0.04 });
P.slam("#h3 .t", 1.4, { from: 2.0, r0: -5 }); P.pop("#pill", 1.78, { from: 0.4 });
```

### 1c. Typing hook (URL, search box or chat message)
Use it when "you just type" is the promise. Typing runs from 0.3 to 1.0; the send bounces at 1.08; the reply dots
appear at 1.3.
```js
P.slam("#h1 .t", 0); P.slam("#h2 .t", 0.3); P.slam("#h3 .t", 0.6, { from: 1.9, r0: -4 });
P.pop("#bubble", 0.2, { from: 0.5 }); P.type("#bubble-t", "book me in for friday", 0.3, { d: 0.7, caret: "#caret" });
P.punch("#bubble", 1.08, { s: 1.06 }); P.pop("#dots", 1.3, { from: 0.3 });
P.fan(".chip", 1.04, { ox: 540, oy: 955 }); // optional: the input explodes into feature chips
```

### 1d. Pile-up and shake ("every. single. week.")
Use it to show volume or overwhelm: requests, notifications, bills. Cards stack every 0.2 s, then three one-word
slams arrive 0.2 s apart and the pile shakes.
```js
P.stack(".req", 0.15, { stagger: 0.2, y: 420 });
P.out(["#h1 .t", "#h2 .t", "#h3 .t"], 1.24, { y: -140, stagger: 0.03 });
P.slam("#w1 .t", 1.4); P.slam("#w2 .t", 1.6); P.slam("#w3 .t", 1.8, { from: 2.0, r0: -4 });
P.shake("#reqs", 1.8, { amp: 12 });
```

### 1e. Comparison ("theirs vs yours")
Two cards rise side by side; one moves and the other sleeps. At 1.3 the loser flies out and the winner slides to
centre.
```js
P.rise("#mine", 0.12, { y: 300 }); P.rise("#theirs", 0.2, { y: 300 });
P.pop("#h2 .t", 0.45, { from: 0.2 }); P.wiggle("#h2 .t", 0.85);
P.fly("#theirs", 1.3, { x: 700, y: 0, r: 14, d: 0.3 });
P.slam("#h3 .t", 1.4); P.slam("#h4 .t", 1.56, { from: 2.0 }); P.shake("#mine", 1.95, { amp: 16 });
```

### 1f. One giant word plus a burst
Use it for "Small business. Big ___." A small line rises, then a 400-520 px word pops from 0.08 scale.
The camera shakes and particles burst at the moment of impact, about 0.66.
```js
P.slam("#h1 .t", 0); P.pop("#big .t", 0.58, { from: 0.08, d: 0.5, r0: -12, ease: "back.out(1.7)" });
P.shake("#s1", 0.66, { amp: 16, d: 0.2 }); P.burst("#s1", 540, 560, 0.66, { n: 10, r: 460 });
P.slam("#h3 .t", 0.95); P.punch("#big .t", 1.4); P.punch("#big .t", 1.9);
```

## 2. Product / UI demo beats (about 3-4 s)

Build a simple fake UI from divs (window bar, list rows, slots, button), never a screenshot alone.
- **Rhythm:** the panel rises (0.5 s), rows stagger in at 0.05-0.07 s, then one cursor click every 0.7-0.8 s.
  Each click is about 0.45 s of movement plus a 0.3 s press.
- **After each click:** change state (colour or text swap), flash a burst or ring, and swap the headline to the
  next step ("Pick a fix." → "Pick a time." → "Done.").
- **Outcome:** a toast whips in, or a counter runs, to show the result.
```js
const cur = P.cursor("#root", { x: 980, y: 1900 });
P.rise("#app", t, { y: 260, d: 0.5 }); P.rise(".row", t + 0.2, { y: 50, stagger: 0.07 });
let c = P.click(cur, t + 0.6, { x: 560, y: 820, target: "#row2" });
P.out("#step1 .t", c, { d: 0.16 }); P.slam("#step2 .t", c + 0.15);
c = P.click(cur, c + 0.1, { x: 640, y: 1440, target: "#cta", move: 0.35 });
P.swap("#cta", c - 0.28, "Booked ✓"); P.burst("#root", 640, 1440, c - 0.26); P.punch("#app", c - 0.26);
P.whipIn("#toast", c + 0.2, { dir: "right" }); P.counter("#kpi", t, { to: 42, d: 2.4 });
```
- **Variant (dashboard):** items land on a calendar or grid every 0.25 s while a counter climbs (salon example).

## 3. Testimonial / quote beat (2.5-3 s)

- Avatar pops; stars pop in with a 0.06 s stagger.
- The quote reveals word by word (stagger 0.04-0.05).
- About 0.8 s after the quote starts, a highlight sweeps through the key phrase.
- The name line rises at +1.1 s.
- Hold the quote with a slow `drift` plus two `punch`es on beats, then exit everything upward with a 0.03 s stagger.
- **Layers:** a giant faded quote mark behind, serif quote text, a sans name, and stat cards beside the quote on 16:9.
```js
P.drift("#s3", t, 3, { scale: 1.04 }); P.pop("#ava", t); P.pop("#stars i", t + 0.1, { from: 0.2 });
P.lines("#q", t + 0.2, { stagger: 0.05 }); P.highlight("#q .key", t + 1.05, { h: "70%" });
P.rise("#who", t + 1.4, { y: 30 }); P.punch("#qcard", t + 2.0, { s: 1.03 });
P.whipIn("#stat1", t + 0.45, { dir: "right" }); P.counter("#stat1 b", t + 0.55, { to: 38, fmt: (v) => v + "%" });
P.out(["#ava", "#q", "#who"], t + 2.8, { y: -140, stagger: 0.03 });
```

## 4. Offer / price beat (about 2.5 s)

- A small label rises, the product line slams, and the price pops at 300-440 px while counting up from 0 (0.6-0.7 s).
- The price shakes, the old price appears and is struck through, and the included items rise in at 0.12 s each.
- Punch the price once more, then whip everything out.
```js
P.rise("#label .t", t, { y: 30 }); P.slam("#what .t", t + 0.05);
P.pop("#price", t + 0.2, { from: 0.4 }); P.counter("#price", t + 0.25, { to: 49, d: 0.7, fmt: (v) => "$" + v });
P.shake("#price", t + 0.95); P.pop("#was .t", t + 1.0); P.strike("#was .t", t + 1.3);
P.rise(".inc", t + 1.5, { x: -60, y: 0, stagger: 0.12 }); P.punch("#price", t + 2.0, { s: 1.08, r: -2 });
P.whipOut(["#label", "#what", "#price", "#was", ".inc"], t + 2.55, { dir: "left", d: 0.2 });
```
- For a "free" offer, put the free part in giant italic type and add a "No card needed" pill.

## 5. End card (2.5-3 s, last beat)

- Switch to a flat accent-coloured field (`wipe` in).
- The logo rises; two lines slam 0.2 s apart (sans, then italic serif); the button pops with a burst and a ring.
- The URL types in; the button bobs and rings again until the end. The last frame still moves.
```js
P.show("#end", t); P.wipe("#end", t, { dir: "up", d: 0.4 }); P.rise("#logo", t + 0.2, { y: -40 });
P.slam("#e1 .t", t + 0.3); P.slam("#e2 .t", t + 0.5, { from: 1.9, r0: -5 });
P.pop("#btn", t + 0.75, { from: 0.45, d: 0.5 }); P.burst("#end", 540, 1175, t + 0.8); P.ring("#btn", t + 0.85);
P.type("#url", "yourshop.com", t + 1.05, { cps: 30, caret: "#caret" });
P.bob("#btn", t + 1.6, { amp: 10, period: 0.25, until: END }); P.ring("#btn", t + 1.75);
```

## 6. Scene-to-scene carries

Never fade to black. Pick one of these per cut and vary them through the video.
- **Pixel cover-wipe** (hook → body): `const m = P.pixelWipe("#root", 2.45)`, then swap scenes at `m`. Takes about 0.33 s.
- **Fly through** an object: `P.through("#app", t, { s: 2.6 })` while the next scene's first slam lands at t + 0.25.
- **Carry an object across:** the same element (thumbnail, quote, chip) tweens from its old size and position to its
  new role; for example, a thumbnail grows into the full ad over 0.36 s with power3.inOut. Hide its twin at the
  same frame.
- **Whip out left, next scene in** at the same time t (0.2 s, power3.in) with the new headline slamming at t + 0.05.
- **Clear-and-slam** inside a scene: old lines `out` upward (0.2 s, stagger 0.03) at t; the new line slams at t + 0.1-0.15.
- **Overlap:** show the next scene 0.05 s before hiding the old one. Exits start 0.1-0.3 s before the next scene.

## Checklist before rendering

- [ ] Hook ends by 3.0 s with at least 4 landed elements.
- [ ] Every 1 s window has a motion start.
- [ ] Each scene has a product-like object, a texture or glow layer, and a two-font type pair.
- [ ] Type sizes follow the table above.
- [ ] The end card keeps moving to the last frame.
