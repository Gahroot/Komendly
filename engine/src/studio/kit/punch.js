/* punch.js — seek-safe motion helpers for HyperFrames + GSAP (distilled from hand-made frontier ads).
 *
 *   const tl = gsap.timeline({ paused: true });
 *   const P = Punch(tl, { seed: 7 });
 *   P.slam("#h1", 0); P.slam("#h2", 0.2, { from: 1.8 }); P.pop("#card", 0.4);
 *   window.__timelines = window.__timelines || {}; window.__timelines["main"] = tl;
 *
 * Rules every helper follows:
 * - Adds tweens to the PAUSED timeline at absolute times (seconds). Returns the end time, so `t = P.rise(el, t)` chains.
 * - No timers, no Math.random (use P.rnd / P.seeded), no tl.call: text changes run inside tween onUpdate from progress,
 *   so any frame can be rendered first (HyperFrames seeks frames out of order).
 * - Colours/fonts come from CSS vars with fallbacks: --accent, --accent-2, --ink, --paper, --muted, --display, --serif, --text.
 * - An element's FIRST entrance may use the helper defaults. If the same element enters a second time, pass { again: true }
 *   (stops the from-state being applied at build time).
 * - Build all DOM (split, cursor, pixelWipe, burst, stars) BEFORE you start the timeline's first tweens on those elements,
 *   and after fonts load (P.fit measures text).
 */
(function (root) {
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const $ = (el) => (typeof el === "string" ? document.querySelector(el) : el);
  const $$ = (el) => (typeof el === "string" ? Array.from(document.querySelectorAll(el)) : Array.isArray(el) ? el.map($) : el instanceof NodeList ? Array.from(el) : [el]);
  const ir = (o) => (o.again ? { immediateRender: false } : {});

  function Punch(tl, opts = {}) {
    const rnd = seeded(opts.seed ?? 1);
    const P = { tl, rnd, seeded, $, $$ };

    /* ---------------- entrances ---------------- */

    /** Big type lands from oversized + transparent to rest, fast (0.28-0.36 s). The hook workhorse.
     *  @example P.slam("#h1 .t", 0.18, { from: 1.8, r0: -4 }) */
    P.slam = (el, at, o = {}) => {
      const d = o.d ?? 0.32;
      tl.fromTo(el, { opacity: 0, scale: o.from ?? 1.5, x: o.x ?? 0, y: o.y ?? 0, rotation: o.r0 ?? 0 },
        { opacity: 1, scale: 1, x: 0, y: 0, rotation: o.r ?? 0, duration: d, ease: o.ease ?? "expo.out", ...ir(o) }, at);
      return at + d;
    };

    /** Springy grow from small (chips, buttons, stickers, cards, single hero words).
     *  @example P.pop("#price-tag", 1.2, { from: 0.4, r0: -20, r: -3 }) */
    P.pop = (el, at, o = {}) => {
      const d = o.d ?? 0.45;
      tl.fromTo(el, { opacity: 0, scale: o.from ?? 0.3, x: o.x ?? 0, y: o.y ?? 0, rotation: o.r0 ?? 0 },
        { opacity: 1, scale: 1, x: 0, y: 0, rotation: o.r ?? 0, duration: d, ease: o.ease ?? "back.out(2.2)", ...ir(o) }, at);
      return at + d;
    };

    /** Slide up + fade in (UI panels, sub lines, labels). Pass `stagger` with a list selector.
     *  @example P.rise(".step", 3.7, { y: 60, stagger: 0.12 }) */
    P.rise = (el, at, o = {}) => {
      const d = o.d ?? 0.42;
      const n = $$(el).length;
      tl.fromTo(el, { opacity: 0, y: o.y ?? 80, x: o.x ?? 0 },
        { opacity: 1, y: 0, x: 0, duration: d, ease: o.ease ?? "expo.out", stagger: o.stagger ?? 0, ...ir(o) }, at);
      return at + d + (o.stagger ?? 0) * Math.max(0, n - 1);
    };

    /** Fast exit: fade + move (default up). Use 0.18-0.25 s, power2.in, right before the next beat.
     *  @example P.out(["#h1 .t", "#h2 .t"], 1.25, { y: -140, stagger: 0.03 }) */
    P.out = (el, at, o = {}) => {
      const d = o.d ?? 0.22;
      tl.to(el, { opacity: 0, x: o.x ?? 0, y: o.y ?? -90, scale: o.s ?? 1, rotation: o.r ?? 0, duration: d, ease: o.ease ?? "power2.in", stagger: o.stagger ?? 0 }, at);
      return at + d;
    };

    /** Whip in from off-frame with motion skew (dir: left|right|up|down).
     *  @example P.whipIn("#panel", 2.1, { dir: "right" }) */
    P.whipIn = (el, at, o = {}) => {
      const d = o.d ?? 0.34, dist = o.dist ?? 1400, sk = o.skew ?? 14;
      const v = { left: [-dist, 0, sk], right: [dist, 0, -sk], up: [0, -dist, 0], down: [0, dist, 0] }[o.dir ?? "left"];
      tl.fromTo(el, { opacity: 1, x: v[0], y: v[1], skewX: v[2] }, { x: 0, y: 0, skewX: 0, duration: d, ease: o.ease ?? "expo.out", ...ir(o) }, at);
      return at + d;
    };

    /** Whip out to off-frame with skew + tilt (the hook "clear the stage" move, 0.22 s).
     *  @example P.whipOut("#h2 .t", 1.3, { dir: "left", r: -8 }) */
    P.whipOut = (el, at, o = {}) => {
      const d = o.d ?? 0.22, dist = o.dist ?? 1400, sk = o.skew ?? 18;
      const v = { left: [-dist, 0, sk], right: [dist, 0, -sk], up: [0, -dist, 0], down: [0, dist, 0] }[o.dir ?? "right"];
      tl.to(el, { x: v[0], y: v[1], skewX: v[2], rotation: o.r ?? 0, opacity: o.fade === false ? 1 : 0, duration: d, ease: o.ease ?? "power3.in" }, at);
      return at + d;
    };

    /** Split an element's words into masked spans (call once at build time). Keeps <em>/<i>/<b> styling per word.
     *  @example const words = P.split("#headline") */
    P.split = (el) => {
      const host = $(el); const out = [];
      const walk = (node, wrap) => {
        Array.from(node.childNodes).forEach((c) => {
          if (c.nodeType === 3) {
            const frag = document.createDocumentFragment();
            c.textContent.split(/(\s+)/).forEach((w) => {
              if (!w) return;
              if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(" ")); return; }
              const m = document.createElement("span"); m.className = "pw";
              m.style.cssText = "display:inline-block;overflow:hidden;vertical-align:top;padding:0 .04em .08em;margin:0 -.04em -.08em";
              const i = document.createElement("span"); i.className = "pwi"; i.style.display = "inline-block"; i.textContent = w;
              m.appendChild(i); frag.appendChild(m); out.push(i);
            });
            c.replaceWith(frag);
          } else if (c.nodeType === 1 && c.tagName !== "BR") walk(c);
        });
      };
      walk(host);
      return out;
    };

    /** Masked word-by-word rise (editorial headline reveal). Splits on first use.
     *  @example P.lines("#quote", 6.2, { stagger: 0.06 }) */
    P.lines = (el, at, o = {}) => {
      const host = $(el);
      const ws = host.__pw || (host.__pw = P.split(host));
      const d = o.d ?? 0.5, st = o.stagger ?? 0.06;
      tl.set(host, { opacity: 1 }, at);
      tl.fromTo(ws, { yPercent: 115 }, { yPercent: 0, duration: d, ease: o.ease ?? "expo.out", stagger: st, ...ir(o) }, at);
      return at + d + st * (ws.length - 1);
    };

    /* ---------------- emphasis ---------------- */

    /** Draw a bar through text (the "No X. No Y." beat) and grey the text. Element must be position:relative or inline-block.
     *  @example P.strike("#h1 .t", 0.34) */
    P.strike = (el, at, o = {}) => {
      const host = $(el);
      let bar = host.querySelector(":scope > .p-strike");
      if (!bar) {
        bar = document.createElement("i"); bar.className = "p-strike";
        bar.style.cssText = `position:absolute;left:-3%;top:52%;width:106%;height:${o.h ?? "0.14em"};margin-top:-0.07em;display:block;` +
          "background:var(--accent,#ffcf4a);box-shadow:0 0 18px var(--accent,#ffcf4a);transform-origin:0 50%;transform:scaleX(0);pointer-events:none";
        if (getComputedStyle(host).position === "static") host.style.position = "relative";
        host.appendChild(bar);
      }
      const d = o.d ?? 0.16;
      tl.fromTo(bar, { scaleX: 0, rotation: o.r ?? -3 }, { scaleX: 1, rotation: o.r ?? -3, duration: d, ease: "power3.out" }, at);
      if (o.dim !== false) tl.to(host, { color: o.dimColor ?? "var(--muted,#8d86a0)", duration: 0.1 }, at + d * 0.5);
      return at + d;
    };

    /** Marker sweep behind words (highlighter). Works on inline elements.
     *  @example P.highlight("#q .key", 7.0, { d: 0.6 }) */
    P.highlight = (el, at, o = {}) => {
      $$(el).forEach((e) => {
        e.style.backgroundImage = `linear-gradient(${o.color ?? "var(--accent,#ffcf4a)"},${o.color ?? "var(--accent,#ffcf4a)"})`;
        e.style.backgroundRepeat = "no-repeat"; e.style.backgroundPosition = "0 88%"; e.style.backgroundSize = "0% 38%";
        e.style.boxDecorationBreak = e.style.webkitBoxDecorationBreak = "clone";
      });
      const d = o.d ?? 0.5;
      tl.fromTo(el, { backgroundSize: `0% ${o.h ?? "38%"}` }, { backgroundSize: `100% ${o.h ?? "38%"}`, duration: d, ease: o.ease ?? "expo.out", ...ir(o) }, at);
      return at + d;
    };

    /** Camera-style shake (impact, "every. single. week."). 
     *  @example P.shake("#scene2", 1.8, { amp: 12 }) */
    P.shake = (el, at, o = {}) => {
      const a = o.amp ?? 12, d = o.d ?? 0.3;
      tl.to(el, { keyframes: { x: [a, -a * 0.8, a * 0.5, -a * 0.3, 0], rotation: [0.6, -0.5, 0.3, 0, 0] }, duration: d, ease: "none" }, at);
      return at + d;
    };

    /** Beat punch: snap a resting element slightly bigger/tilted then settle (put one on every music beat).
     *  @example [6.4, 6.9, 7.4].forEach((t, k) => P.punch("#hero", t, { r: k % 2 ? 1.6 : -1.6 })) */
    P.punch = (el, at, o = {}) => {
      const d = o.d ?? 0.32;
      tl.fromTo(el, { scale: o.s ?? 1.06, rotation: o.r ?? 0 }, { scale: 1, rotation: 0, duration: d, ease: "power3.out", immediateRender: false }, at);
      return at + d;
    };

    /** Wiggle (rotate yoyo) to keep a held word alive. 
     *  @example P.wiggle("#h5 .t", 1.95, { deg: 5, n: 5 }) */
    P.wiggle = (el, at, o = {}) => {
      const n = o.n ?? 5, d = o.d ?? 0.1;
      tl.to(el, { rotation: o.deg ?? 5, duration: d, yoyo: true, repeat: n % 2 ? n : n + 1, ease: "sine.inOut" }, at);
      return at + d * ((n % 2 ? n : n + 1) + 1);
    };

    /** Bob up/down (stepped looks pixel-y: ease "steps(3)"). Yoyo count is computed from `until`.
     *  @example P.bob("#cta", 13.9, { amp: 18, until: 15 }) */
    P.bob = (el, at, o = {}) => {
      const per = o.period ?? 0.3, until = o.until ?? at + 1.2;
      const rep = Math.max(1, Math.floor((until - at) / per) - 1) | 1;
      tl.to(el, { y: `-=${o.amp ?? 18}`, duration: per, yoyo: true, repeat: rep, ease: o.ease ?? "sine.inOut" }, at);
      return at + per * (rep + 1);
    };

    /** Slow linear push (camera drift / Ken Burns) so no frame is ever static.
     *  @example P.drift("#scene1", 0, 3, { scale: 1.06, y: -20 }) */
    P.drift = (el, at, dur, o = {}) => {
      tl.fromTo(el, { scale: o.from ?? 1, x: 0, y: 0 }, { scale: o.scale ?? 1.05, x: o.x ?? 0, y: o.y ?? 0, duration: dur, ease: "none", immediateRender: false }, at);
      return at + dur;
    };

    /** Expanding ring pulse around a CTA (needs a positioned element; ring inherits its border-radius).
     *  @example P.ring("#btn", 13.0) */
    P.ring = (el, at, o = {}) => {
      const host = $(el);
      const ring = document.createElement("i");
      ring.style.cssText = "position:absolute;inset:-6px;border-radius:inherit;border:4px solid var(--accent,#ffcf4a);pointer-events:none;opacity:0";
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.appendChild(ring);
      const d = o.d ?? 0.6;
      tl.fromTo(ring, { opacity: 0.9, scale: 1 }, { opacity: 0, scale: o.s ?? 1.18, duration: d, ease: "power2.out", immediateRender: false }, at);
      return at + d;
    };

    /* ---------------- text that changes ---------------- */

    /** Count a number up (prices, stats, "of 11 ready"). fmt formats the value.
     *  @example P.counter("#saved", 8.2, { from: 0, to: 1240, d: 0.9, fmt: (v) => "$" + v.toLocaleString("en-US") }) */
    P.counter = (el, at, o = {}) => {
      const e = $(el), from = o.from ?? 0, to = o.to ?? 100, d = o.d ?? 0.8, dec = o.decimals ?? 0;
      const fmt = o.fmt ?? ((v) => v.toFixed(dec));
      const p = { v: from };
      e.textContent = fmt(from);
      tl.fromTo(p, { v: from }, { v: to, duration: d, ease: o.ease ?? "power2.out", immediateRender: false,
        onUpdate: () => { e.textContent = fmt(dec ? +p.v.toFixed(dec) : Math.round(p.v)); } }, at);
      return at + d;
    };

    /** Type text into an element at `cps` chars/sec (chat prompts, URLs, search bars). Optional blinking caret element.
     *  @example P.type("#prompt", "book a tune-up for saturday", 0.3, { cps: 30, caret: "#caret" }) */
    P.type = (el, text, at, o = {}) => {
      const e = $(el), d = o.d ?? text.length / (o.cps ?? 26), c = o.caret ? $(o.caret) : null;
      const p = { n: 0 };
      e.textContent = o.keep ? e.textContent : "";
      tl.fromTo(p, { n: 0 }, { n: text.length, duration: d, ease: "none", immediateRender: false,
        onUpdate: () => { e.textContent = text.slice(0, Math.ceil(p.n - 1e-6)); } }, at);
      if (c) P.blink(c, at + d + 0.05, { n: o.blinks ?? 4 });
      return at + d;
    };

    /** Blink (caret, notification dot) with hard steps.
     *  @example P.blink("#caret", 2.0, { n: 6 }) */
    P.blink = (el, at, o = {}) => {
      const n = o.n ?? 4, per = o.period ?? 0.26;
      tl.to(el, { opacity: 0, duration: per, ease: "steps(1)", yoyo: true, repeat: n * 2 - 1 }, at);
      return at + per * n * 2;
    };

    /** Swap an element's text/HTML at a time (status labels: "building" → "done"). Seek-safe both ways.
     *  @example P.swap("#status", 4.55, "Booked ✓") */
    P.swap = (el, at, html) => {
      const e = $(el), before = e.innerHTML, p = { v: 0 };
      tl.fromTo(p, { v: 0 }, { v: 1, duration: 0.001, immediateRender: false, onUpdate: () => { e.innerHTML = p.v >= 1 ? html : before; } }, at);
      return at;
    };

    /* ---------------- product / UI ---------------- */

    /** Create a pointer cursor inside `host` (call at build time). Returns the element.
     *  @example const cur = P.cursor("#root", { x: 900, y: 1700 }) */
    P.cursor = (host, o = {}) => {
      const c = document.createElement("div");
      c.className = "p-cursor";
      c.style.cssText = `position:absolute;left:0;top:0;width:${o.size ?? 64}px;height:${o.size ?? 64}px;z-index:50;pointer-events:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.45))`;
      c.innerHTML = '<svg viewBox="0 0 32 32" width="100%" height="100%"><path d="M6 3 L6 25 L11.5 19.8 L15.4 28.4 L19.4 26.6 L15.6 18.2 L23 18.2 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
      $(host).appendChild(c);
      tl.set(c, { x: o.x ?? 0, y: o.y ?? 0 }, 0);
      return c;
    };

    /** Move the cursor to (x, y) in host px, then press: cursor squash, target dips, ring flash.
     *  @example P.click(cur, 3.1, { x: 540, y: 1220, target: "#book-btn" }) */
    P.click = (cur, at, o = {}) => {
      const mv = o.move ?? 0.45;
      tl.to(cur, { x: o.x, y: o.y, duration: mv, ease: "power3.inOut" }, at);
      const t = at + mv;
      tl.to(cur, { scale: 0.82, duration: 0.07, ease: "power2.out", transformOrigin: "20% 10%" }, t);
      tl.to(cur, { scale: 1, duration: 0.2, ease: "back.out(3)" }, t + 0.08);
      if (o.target) {
        tl.to(o.target, { scale: 0.94, duration: 0.07, ease: "power2.out" }, t);
        tl.to(o.target, { scale: 1, duration: 0.3, ease: "back.out(2.5)" }, t + 0.08);
        if (o.ring !== false) P.ring(o.target, t + 0.02, { d: 0.45, s: 1.12 });
      }
      return t + 0.3;
    };

    /** Deal cards in from below, each tilted, staggered (feeds, notifications, request piles, ad grids).
     *  @example P.stack(".req", 0.15, { stagger: 0.2, y: 420 }) */
    P.stack = (els, at, o = {}) => {
      const list = $$(els), st = o.stagger ?? 0.12, d = o.d ?? 0.32, tilts = o.r ?? [-1.8, 1.8];
      list.forEach((e, k) => tl.fromTo(e, { opacity: 0, y: o.y ?? 420, x: o.x ?? 0, rotation: 0, scale: o.from ?? 1 },
        { opacity: 1, y: 0, x: 0, scale: 1, rotation: tilts[k % tilts.length], duration: d, ease: o.ease ?? "back.out(1.6)", ...ir(o) }, at + k * st));
      return at + d + st * (list.length - 1);
    };

    /** Fling an element off-frame with spin (clearing a pile / dismissing a card).
     *  @example P.fly("#card", 1.3, { y: 1500, r: -24 }) */
    P.fly = (el, at, o = {}) => {
      const d = o.d ?? 0.4;
      tl.to(el, { x: o.x ?? 0, y: o.y ?? 1500, rotation: o.r ?? -20, duration: d, ease: o.ease ?? "power3.in", stagger: o.stagger ?? 0 }, at);
      return at + d;
    };

    /** Explode chips out of one origin point into their laid-out places (URL → audience/offer/pains chips).
     *  @example P.fan(".chip", 1.04, { ox: 540, oy: 955 }) */
    P.fan = (els, at, o = {}) => {
      const list = $$(els), st = o.stagger ?? 0.06, d = o.d ?? 0.45;
      list.forEach((e, k) => {
        const cx = e.offsetLeft + e.offsetWidth / 2, cy = e.offsetTop + e.offsetHeight / 2;
        tl.fromTo(e, { x: (o.ox ?? 0) - cx, y: (o.oy ?? 0) - cy, scale: 0.2, opacity: 0, rotation: 0 },
          { x: 0, y: 0, scale: 1, opacity: 1, rotation: (k % 2 ? 1 : -1) * (2 + (k % 3)), duration: d, ease: "back.out(1.8)", ...ir(o) }, at + k * st);
      });
      return at + d + st * (list.length - 1);
    };

    /* ---------------- transitions ---------------- */

    /** Clip-path reveal (dir: left|right|up|down). `hide: true` wipes it away instead.
     *  @example P.wipe("#photo", 4.0, { dir: "up", d: 0.5 }) */
    P.wipe = (el, at, o = {}) => {
      const d = o.d ?? 0.45;
      const closed = { left: "inset(0 100% 0 0)", right: "inset(0 0 0 100%)", up: "inset(100% 0 0 0)", down: "inset(0 0 100% 0)" }[o.dir ?? "left"];
      const open = "inset(0 0% 0 0%)";
      if (o.hide) tl.fromTo(el, { clipPath: open }, { clipPath: closed, duration: d, ease: o.ease ?? "power3.in", immediateRender: false }, at);
      else tl.fromTo(el, { clipPath: closed, opacity: 1 }, { clipPath: "inset(0% 0% 0% 0%)", duration: d, ease: o.ease ?? "expo.out", ...ir(o) }, at);
      return at + d;
    };

    /** Zoom through an element into the next scene (scale up + fade, 0.35 s). Pair with the next scene's slam.
     *  @example P.through("#scene1", 4.8) */
    P.through = (el, at, o = {}) => {
      const d = o.d ?? 0.35;
      tl.to(el, { scale: o.s ?? 3.2, opacity: 0, duration: d, ease: "power3.in", transformOrigin: o.origin ?? "50% 50%" }, at);
      return at + d;
    };

    /** Pixel-grid cover wipe: cells grow diagonally to cover the frame, then shrink. Swap scenes at the returned mid time.
     *  @example const mid = P.pixelWipe("#root", 2.45); P.show("#s2", mid); P.hide("#s1", mid) */
    P.pixelWipe = (host, at, o = {}) => {
      const h = $(host), W = h.clientWidth, H = h.clientHeight, cell = o.cell ?? Math.ceil(Math.max(W, H) / 21);
      const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), r = seeded(o.seed ?? 5);
      const wrap = document.createElement("div");
      wrap.style.cssText = "position:absolute;inset:0;z-index:40;pointer-events:none";
      const pal = o.colors ?? ["var(--accent,#ffcf4a)", "var(--accent-2,#a970ff)", "var(--ink,#1b1040)", "var(--accent-2,#a970ff)"];
      const cells = [];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const c = document.createElement("i"); const v = r();
        c.style.cssText = `position:absolute;left:${x * cell}px;top:${y * cell}px;width:${cell + 1}px;height:${cell + 1}px;display:block;transform:scale(0);background:${pal[v < 0.1 ? 0 : v < 0.35 ? 1 : v < 0.5 ? 3 : 2]}`;
        c.dataset.k = x + y; wrap.appendChild(c); cells.push(c);
      }
      h.appendChild(wrap);
      const step = o.step ?? 0.0065, half = 0.12 + step * (cols + rows);
      tl.fromTo(cells, { scale: 0 }, { scale: 1, duration: 0.12, ease: "power2.out", stagger: (i, e) => +e.dataset.k * step }, at);
      tl.to(cells, { scale: 0, duration: 0.13, ease: "power2.in", stagger: (i, e) => +e.dataset.k * step, immediateRender: false }, at + half);
      return at + half;
    };

    /** Hard visibility switches for whole scenes (seek-safe sets).
     *  @example P.show("#s2", 2.79); P.hide("#s1", 2.79) */
    P.show = (el, at) => { tl.set(el, { autoAlpha: 1 }, at); return at; };
    P.hide = (el, at) => { tl.set(el, { autoAlpha: 0 }, at); return at; };

    /* ---------------- texture & particles ---------------- */

    /** Particle burst from a point (small squares in accent colours). Build-time DOM + tweens.
     *  @example P.burst("#root", 540, 900, 0.66, { n: 12, r: 420 }) */
    P.burst = (host, x, y, at, o = {}) => {
      const n = o.n ?? 12, r = seeded(o.seed ?? Math.floor(rnd() * 1e6)), d = o.d ?? 0.6, sz = o.size ?? 22;
      for (let k = 0; k < n; k++) {
        const e = document.createElement("i");
        e.style.cssText = `position:absolute;left:${x - sz / 2}px;top:${y - sz / 2}px;width:${sz}px;height:${sz}px;opacity:0;z-index:30;pointer-events:none;` +
          `background:${k % 3 ? "var(--accent,#ffcf4a)" : "var(--accent-2,#a970ff)"};box-shadow:0 0 14px var(--accent,#ffcf4a)`;
        $(host).appendChild(e);
        const a = (k / n) * Math.PI * 2 + r() * 0.5, rad = (o.r ?? 400) * (0.6 + r() * 0.4);
        tl.fromTo(e, { x: 0, y: 0, opacity: 1, scale: 1 }, { x: Math.cos(a) * rad, y: Math.sin(a) * rad * (o.squash ?? 0.75), opacity: 0, scale: 0.4, duration: d, ease: "power3.out", immediateRender: false }, at);
      }
      return at + d;
    };

    /** Twinkling star / pixel field across `host` from 0 to `until` (seeded, stepped opacity). Cheap depth layer.
     *  @example P.stars("#bg", { n: 60, until: 15 }) */
    P.stars = (host, o = {}) => {
      const h = $(host), r = seeded(o.seed ?? 7), until = o.until ?? 15;
      const W = h.clientWidth, H = h.clientHeight * (o.top ?? 1);
      for (let k = 0; k < (o.n ?? 60); k++) {
        const e = document.createElement("i"), s = r() > 0.8 ? 7 : 4;
        e.style.cssText = `position:absolute;left:${(r() * W).toFixed(0)}px;top:${(r() * H).toFixed(0)}px;width:${s}px;height:${s}px;` +
          `background:${k % 9 ? "var(--paper,#fff7e6)" : "var(--accent,#ffcf4a)"};opacity:${(0.3 + r() * 0.6).toFixed(2)};pointer-events:none`;
        h.appendChild(e);
        const per = 0.4 + r() * 0.9;
        tl.to(e, { opacity: 0.12, duration: per, ease: "steps(3)", yoyo: true, repeat: Math.ceil(until / per) }, r() * 1.2);
      }
      return until;
    };

    /** Glow blob that rises in behind a beat (radial gradient in --accent-2). Returns the element.
     *  @example P.glow("#s1", 1.45, { x: 540, y: 520, size: 1100 }) */
    P.glow = (host, at, o = {}) => {
      const g = document.createElement("div"), sz = o.size ?? 1000;
      g.style.cssText = `position:absolute;left:${(o.x ?? 540) - sz / 2}px;top:${(o.y ?? 600) - sz / 2}px;width:${sz}px;height:${sz}px;border-radius:50%;pointer-events:none;z-index:0;` +
        `background:radial-gradient(closest-side,${o.color ?? "var(--accent-2,#7b3cf0)"},transparent);opacity:0;mix-blend-mode:${o.blend ?? "screen"}`;
      const hh = $(host); hh.insertBefore(g, hh.firstChild);
      tl.fromTo(g, { opacity: 0, y: 300 }, { opacity: o.opacity ?? 0.7, y: 0, duration: o.d ?? 0.7, ease: "power2.out", immediateRender: false }, at);
      return g;
    };

    /** Shrink a single-line element's font-size until it fits its parent's width (build time, after fonts load).
     *  @example P.fit("#h1 .t") */
    P.fit = (el, o = {}) => {
      $$(el).forEach((e) => {
        const max = o.max ?? e.parentElement.clientWidth;
        const w = e.scrollWidth;
        if (w > max) e.style.fontSize = Math.floor(parseFloat(getComputedStyle(e).fontSize) * (max / w) * 0.98) + "px";
      });
    };

    return P;
  }

  Punch.seeded = seeded;
  root.Punch = Punch;
})(typeof window !== "undefined" ? window : globalThis);
