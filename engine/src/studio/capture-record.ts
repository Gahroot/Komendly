// Records real footage of a website for launch videos: smooth scrolls, the hero with a gliding cursor on the main
// call to action, and short tours of key pages. Frames come from Chromium's screencast at device resolution (crisp
// text, far sharper than Playwright's built-in VP8 recorder) and are encoded to H.264 MP4 with ffmpeg.
// Browser-agnostic: the caller passes a Playwright Browser and an optional request guard (SSRF in the engine).
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, BrowserContext, Page, Route } from "playwright";
import { STUDIO_CAPTURE_LIMITS, type StudioLaunchAspect } from "../../../src/lib/studio/contracts";
import { run } from "../modules/ezmotion/runtime";

export interface Viewport { width: number; height: number; scale: number }

/** CSS viewport x device scale = output pixels (1920x1080 landscape, 1080x1920 portrait). */
export function viewportFor(aspect: StudioLaunchAspect): Viewport {
  return aspect === "9:16" ? { width: 432, height: 768, scale: 2.5 } : { width: 1280, height: 720, scale: 1.5 };
}

export interface PageLink { href: string; text: string; nav: boolean }

const SKIP_PATH = /\/(log-?in|sign-?in|sign-?up|register|auth|account|cart|checkout|privacy|terms|legal|cookie|careers|jobs|contact|status|press|imprint|impressum)(\/|$)|^\/blog\/.+|^\/docs\/.+/i;
const KEY_WORDS = /feature|product|how-it-works|how it works|solution|use-?case|integration|pricing|demo|tour|platform|changelog|what'?s new|new|launch|showcase|example|templates?|studio|agents?/i;

/** Pages to tour besides the landing page: given paths (same origin) or the best nav links. Deterministic. */
export function pickTourPages(base: string, links: PageLink[], paths: string[] | undefined, max: number = STUDIO_CAPTURE_LIMITS.maxPages): string[] {
  const origin = new URL(base).origin;
  const home = new URL(base);
  const norm = (u: URL) => `${u.origin}${u.pathname.replace(/\/+$/, "") || "/"}`;
  const homeKey = norm(home);
  if (paths && paths.length) {
    const out: string[] = [];
    for (const p of paths) {
      let u: URL;
      try { u = new URL(p, base); } catch { continue; }
      if (u.origin !== origin || norm(u) === homeKey) continue;
      u.hash = "";
      if (!out.includes(u.toString())) out.push(u.toString());
      if (out.length >= max) break;
    }
    return out;
  }
  const scored = new Map<string, number>();
  for (const l of links) {
    let u: URL;
    try { u = new URL(l.href, base); } catch { continue; }
    if (u.origin !== origin || !/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|xml|json)$/i.test(u.pathname) || SKIP_PATH.test(u.pathname)) continue;
    const key = norm(u);
    if (key === homeKey || key === origin) continue;
    let score = l.nav ? 3 : 0;
    if (KEY_WORDS.test(`${u.pathname} ${l.text}`)) score += 5;
    if (score <= 0) continue;
    score -= u.pathname.split("/").filter(Boolean).length * 0.3;
    scored.set(key, Math.max(scored.get(key) ?? -Infinity, score));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([k]) => k);
}

export interface Frame { file: string; t: number }

/** ffconcat list for irregular screencast frames (each frame lasts until the next; the last until `endT`). */
export function frameConcat(frames: Frame[], endT: number): string {
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? endT;
    const d = Math.max(1 / 60, next - f.t);
    lines.push(`file '${f.file.replace(/'/g, "'\\''")}'`, `duration ${d.toFixed(4)}`);
  });
  const last = frames[frames.length - 1];
  if (last) lines.push(`file '${last.file.replace(/'/g, "'\\''")}'`);
  return `${lines.join("\n")}\n`;
}

/** A filename-safe slug for a page ("/features/ai" -> "features-ai"). */
export function pageSlug(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "home";
  } catch {
    return "page";
  }
}

export interface CapturedClip { file: string; filename: string; shows: string; seconds: number; width: number; height: number; bytes: number }
export interface CapturedShot { file: string; filename: string; shows: string }
export interface CaptureResult {
  clips: CapturedClip[];
  shots: CapturedShot[];
  logo: string | null;
  brand: { name?: string; colors: string[] };
  pages: Array<{ url: string; title: string }>;
}

// ---- In-page helpers (run in the browser) ------------------------------------------------------------------------

/** Fake cursor + hidden scrollbars, installed on every document. */
export const CURSOR_INIT = `(() => {
  const install = () => {
    if (document.getElementById("__ozzy_cursor")) return;
    const st = document.createElement("style");
    st.textContent = "html{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important}#__ozzy_cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .25s;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));will-change:transform}#__ozzy_cursor.on{opacity:1}#__ozzy_cursor .r{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.55);transform:scale(0);opacity:0}#__ozzy_cursor .r.go{animation:ozr .5s ease-out}@keyframes ozr{0%{transform:scale(.2);opacity:.9}100%{transform:scale(1.6);opacity:0}}";
    document.documentElement.appendChild(st);
    const c = document.createElement("div");
    c.id = "__ozzy_cursor";
    c.innerHTML = '<div class="r"></div><svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 10.5-6.6 1.3L16 21l-3 1.4-3.6-7.3L4 19.6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    document.addEventListener("mousemove", (e) => { c.classList.add("on"); c.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, true);
    document.addEventListener("mousedown", () => { const r = c.querySelector(".r"); if (r) { r.classList.remove("go"); void r.offsetWidth; r.classList.add("go"); } }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();`;

export const DISMISS_COOKIES_JS = `(() => {
  const known = ["#onetrust-accept-btn-handler", "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", "#CybotCookiebotDialogBodyButtonAccept", ".cc-allow", ".cc-accept", "[data-testid='uc-accept-all-button']", "#didomi-notice-agree-button", ".fc-cta-consent", "#truste-consent-button", "[aria-label='Accept all']", "[data-cky-tag='accept-button']", "#hs-eu-confirmation-button", ".onetrust-close-btn-handler", ".cky-btn-accept", ".cc-btn.cc-dismiss", ".cc-accept-all", "#accept-cookies", "#acceptCookies", ".accept-cookies", "[data-testid='cookie-policy-dialog-accept-button']", "[data-testid='accept-cookies']", ".gdpr-accept", "#gdpr-accept"];
  let clicked = 0;
  for (const s of known) { const b = document.querySelector(s); if (b instanceof HTMLElement && b.offsetParent !== null) { b.click(); clicked++; } }
  const okText = /^(accept( all)?( cookies)?|allow( all)?( cookies)?|i agree|agree( to all)?|got it|ok(ay)?|accept & close|understood|alle akzeptieren|tout accepter|aceptar( todo)?|accetta( tutto)?)$/i;
  const bannerish = (el) => { for (let n = el, i = 0; n && i < 8; n = n.parentElement, i++) { const h = ((n.id || "") + " " + (typeof n.className === "string" ? n.className : "") + " " + (n.getAttribute && (n.getAttribute("aria-label") || "")) ).toLowerCase(); if (/cookie|consent|gdpr|privacy|cmp|banner|notice/.test(h)) return true; } return false; };
  for (const b of document.querySelectorAll("button, a, [role=button]")) {
    const t = (b.textContent || "").trim();
    if (t.length < 40 && okText.test(t) && bannerish(b) && b instanceof HTMLElement && b.offsetParent !== null) { b.click(); clicked++; }
  }
  // Anything still fixed on screen that looks like a consent / cookie layer: hide it.
  for (const el of document.querySelectorAll("body *")) {
    if (!(el instanceof HTMLElement)) continue;
    const pos = getComputedStyle(el).position;
    if (pos !== "fixed" && pos !== "sticky") continue;
    const h = ((el.id || "") + " " + (typeof el.className === "string" ? el.className : "")).toLowerCase();
    if (/cookie|consent|gdpr|cmp-|onetrust|cookiebot|usercentrics|didomi|truste|osano|termly/.test(h)) { el.style.setProperty("display", "none", "important"); clicked++; }
  }
  return clicked;
})()`;

interface PageFacts {
  title: string;
  siteName: string;
  links: PageLink[];
  cta: { x: number; y: number; color: string | null } | null;
  heading: { x: number; y: number } | null;
  themeColor: string | null;
  scrollHeight: number;
  logo: { x: number; y: number; width: number; height: number } | null;
}

const FACTS_JS = `(() => {
  const hex = (c) => { const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/.exec(c || ""); if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return null; return "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join(""); };
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 8 && r.height > 8 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.1 ? r : null; };
  const vw = innerWidth, vh = innerHeight;
  const links = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const nav = !!a.closest("header, nav, [role=navigation]");
    links.push({ href: a.href, text: (a.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 60), nav });
  }
  let cta = null, best = -1;
  const ctaRe = /get started|start|try|sign ?up|book|demo|join|download|create|free|launch|get /i;
  for (const el of document.querySelectorAll("a, button, [role=button]")) {
    const r = vis(el); if (!r || r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) continue;
    const t = (el.textContent || "").trim(); if (!t || t.length > 40) continue;
    const bg = hex(getComputedStyle(el).backgroundColor);
    let score = (ctaRe.test(t) ? 10 : 0) + (bg && bg !== "#ffffff" && bg !== "#000000" ? 4 : bg ? 2 : 0) + Math.min(4, (r.width * r.height) / 4000) - (el.closest("header, nav") ? 3 : 0);
    if (score > best) { best = score; cta = { x: r.left + r.width / 2, y: r.top + r.height / 2, color: bg }; }
  }
  if (best < 6) cta = cta && best >= 2 ? cta : null;
  let heading = null;
  for (const h of document.querySelectorAll("h1, h2")) { const r = vis(h); if (r && r.top >= 0 && r.top < vh * 0.8) { heading = { x: r.left + Math.min(r.width, vw) / 2, y: r.top + r.height / 2 }; break; } }
  let logo = null;
  const lc = document.querySelector("header a[href='/'] img, header a[href='/'] svg, a[href='/'] img, a[href='/'] svg, header [class*=logo] img, header [class*=logo] svg, [class*=logo] img, img[alt*=logo i], header img, header svg");
  if (lc) { const r = vis(lc); if (r && r.top < vh && r.width < vw * 0.6) logo = { x: r.left, y: r.top, width: r.width, height: r.height }; }
  const meta = (n) => document.querySelector(n)?.getAttribute("content") || "";
  const siteName = meta("meta[property='og:site_name']") || (document.title || "").split(/[|·•–—-]/)[0].trim();
  return { title: document.title || "", siteName: siteName.slice(0, 80), links: links.slice(0, 400), cta, heading, themeColor: meta("meta[name='theme-color']") || null, scrollHeight: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0), logo };
})()`;

// ---- Recording -------------------------------------------------------------------------------------------------

export interface RecordOptions {
  browser: Browser;
  url: string;
  paths?: string[];
  aspect: StudioLaunchAspect;
  outDir: string;
  ffmpeg: string;
  signal: AbortSignal;
  /** Request guard (SSRF) installed on the context; omit for trusted local recording. */
  guard?: (route: Route) => Promise<void>;
  maxPages?: number;
  onStep?: (label: string) => void;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  if (signal?.aborted) return rej(signal.reason);
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(signal.reason); }, { once: true });
});
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

class Cursor {
  x: number;
  y: number;
  constructor(private page: Page, vp: Viewport) {
    this.x = vp.width * 0.72;
    this.y = vp.height * 0.8;
  }
  async glide(x: number, y: number, ms: number, signal: AbortSignal): Promise<void> {
    const steps = Math.max(8, Math.round(ms / 16));
    const sx = this.x, sy = this.y;
    // A gentle arc, like a real hand.
    const bend = Math.min(80, Math.hypot(x - sx, y - sy) * 0.15);
    for (let i = 1; i <= steps; i++) {
      if (signal.aborted) return;
      const k = ease(i / steps);
      const arc = Math.sin(Math.PI * k) * bend;
      await this.page.mouse.move(sx + (x - sx) * k, sy + (y - sy) * k - arc);
      await sleep(16, signal);
    }
    this.x = x;
    this.y = y;
  }
}

// String script (not a function): bundlers/tsx inject helpers into serialized functions that don't exist in the page.
const SMOOTH_SCROLL_JS = (target: number, dur: number) => `new Promise((resolve) => {
  const el = document.scrollingElement || document.documentElement;
  const from = el.scrollTop, t0 = performance.now();
  const e = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const step = (now) => { const k = Math.min(1, (now - t0) / ${dur}); el.scrollTop = from + (${target} - from) * e(k); if (k < 1) requestAnimationFrame(step); else resolve(); };
  requestAnimationFrame(step);
})`;

async function smoothScroll(page: Page, to: number, ms: number): Promise<void> {
  await page.evaluate(SMOOTH_SCROLL_JS(Math.round(to), Math.round(ms)));
}

async function settle(page: Page, signal: AbortSignal): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.evaluate("document.fonts ? document.fonts.ready.then(() => 1) : 1").catch(() => undefined);
  await page.evaluate(DISMISS_COOKIES_JS).catch(() => 0);
  await page.keyboard.press("Escape").catch(() => undefined);
  await sleep(700, signal);
  await page.evaluate(DISMISS_COOKIES_JS).catch(() => 0);
}

/** Record one clip of `page` while `act` runs; returns the encoded MP4 (null if nothing was captured). */
async function recordClip(context: BrowserContext, page: Page, vp: Viewport, o: RecordOptions, name: string, act: () => Promise<void>): Promise<{ file: string; seconds: number; bytes: number } | null> {
  const dir = join(o.outDir, `frames-${name}`);
  await mkdir(dir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const frames: Frame[] = [];
  const writes: Promise<void>[] = [];
  let n = 0;
  cdp.on("Page.screencastFrame", (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    const file = join(dir, `f${String(n++).padStart(5, "0")}.jpg`);
    frames.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 });
    writes.push(writeFile(file, Buffer.from(f.data, "base64")));
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
  });
  const W = Math.round(vp.width * vp.scale), H = Math.round(vp.height * vp.scale);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const started = Date.now();
  // Keep frames flowing even on static pages (screencast only sends changes): a 1px cursor nudge.
  try {
    await Promise.race([act(), sleep(STUDIO_CAPTURE_LIMITS.maxClipSeconds * 1000, o.signal)]);
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => undefined);
  }
  const endT = (frames[0]?.t ?? 0) + (Date.now() - started) / 1000;
  await Promise.all(writes);
  await cdp.detach().catch(() => undefined);
  if (frames.length < 2) return null;
  const list = join(dir, "list.ffconcat");
  await writeFile(list, frameConcat(frames, endT));
  const out = join(o.outDir, `${name}.mp4`);
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=white,fps=30,format=yuv420p`;
  const r = await run(o.ffmpeg, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-movflags", "+faststart", "-an", out], { signal: o.signal, timeoutMs: 120_000 });
  if (r.code !== 0) {
    o.log?.("capture encode failed", { name, error: (r.stderr || r.stdout).slice(-300) });
    return null;
  }
  const bytes = (await stat(out)).size;
  if (bytes > STUDIO_CAPTURE_LIMITS.maxClipBytes) return null;
  return { file: out, seconds: Math.round(Math.min(endT - (frames[0]?.t ?? 0), STUDIO_CAPTURE_LIMITS.maxClipSeconds) * 10) / 10, bytes };
}

async function facts(page: Page): Promise<PageFacts> {
  return (await page.evaluate(FACTS_JS)) as PageFacts;
}

async function fullShot(page: Page, file: string, vp: Viewport, scrollHeight: number): Promise<boolean> {
  await page.evaluate("window.scrollTo(0, 0)").catch(() => undefined);
  const h = Math.min(scrollHeight || vp.height, 7_000);
  return page.screenshot({ path: file, type: "jpeg", quality: 85, fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: h }, timeout: 30_000 }).then(() => true, () => false);
}

/** Record the site. Throws only when the landing page can't be opened at all. */
export async function recordSite(o: RecordOptions): Promise<CaptureResult> {
  const vp = viewportFor(o.aspect);
  const tag = o.aspect === "9:16" ? "9x16" : "16x9";
  await mkdir(o.outDir, { recursive: true });
  const context = await o.browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    acceptDownloads: false,
    ...(o.aspect === "9:16" ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", hasTouch: false } : {}),
  });
  const result: CaptureResult = { clips: [], shots: [], logo: null, brand: { colors: [] }, pages: [] };
  try {
    if (o.guard) await context.route("**/*", o.guard);
    await context.addInitScript(CURSOR_INIT);
    context.setDefaultNavigationTimeout(STUDIO_CAPTURE_LIMITS.navTimeoutMs);
    const page = await context.newPage();
    page.on("dialog", (d) => void d.dismiss().catch(() => undefined));
    page.on("popup", (p) => void p.close().catch(() => undefined));
    const cursor = new Cursor(page, vp);

    o.onStep?.("Opening your site");
    const resp = await page.goto(o.url, { waitUntil: "domcontentloaded" });
    if (!resp || resp.status() >= 400) throw new Error(`site answered ${resp?.status() ?? "nothing"}`);
    await settle(page, o.signal);
    const home = await facts(page);
    result.pages.push({ url: page.url(), title: home.title });
    if (home.siteName) result.brand.name = home.siteName;
    for (const c of [home.cta?.color, home.themeColor]) if (c && /^#[0-9a-f]{6}$/i.test(c) && !result.brand.colors.includes(c.toLowerCase())) result.brand.colors.push(c.toLowerCase());

    if (home.logo) {
      const logo = join(o.outDir, "logo.png");
      const pad = 6;
      const ok = await page.screenshot({ path: logo, type: "png", omitBackground: true, clip: { x: Math.max(0, home.logo.x - pad), y: Math.max(0, home.logo.y - pad), width: home.logo.width + pad * 2, height: home.logo.height + pad * 2 } }).then(() => true, () => false);
      if (ok) result.logo = logo;
    }

    // 1. The hero: cursor glides to the main call to action and hovers it.
    o.onStep?.("Recording your homepage");
    await page.mouse.move(cursor.x, cursor.y);
    const hero = await recordClip(context, page, vp, o, `hero-${tag}`, async () => {
      await sleep(700, o.signal);
      if (home.cta) {
        await cursor.glide(home.cta.x, home.cta.y, 1300, o.signal);
        await page.mouse.move(home.cta.x + 1, home.cta.y);
        await sleep(1400, o.signal);
        await cursor.glide(home.cta.x + vp.width * 0.08, home.cta.y + vp.height * 0.12, 900, o.signal);
      } else if (home.heading) {
        await cursor.glide(home.heading.x, home.heading.y + 30, 1500, o.signal);
        await sleep(1200, o.signal);
      } else {
        await cursor.glide(vp.width * 0.5, vp.height * 0.55, 1500, o.signal);
      }
      await sleep(900, o.signal);
    });
    if (hero) result.clips.push({ ...hero, filename: `hero-${tag}.mp4`, shows: `the homepage hero${home.cta ? " with the cursor on the main call to action" : ""}`, width: Math.round(vp.width * vp.scale), height: Math.round(vp.height * vp.scale) });

    // 2. Smooth scroll down the landing page.
    o.onStep?.("Scrolling through your homepage");
    const maxY = Math.max(0, home.scrollHeight - vp.height);
    if (maxY > vp.height * 0.4) {
      const scroll = await recordClip(context, page, vp, o, `scroll-home-${tag}`, async () => {
        await sleep(400, o.signal);
        const stops = Math.min(4, Math.max(1, Math.ceil(maxY / (vp.height * 0.9))));
        for (let i = 1; i <= stops; i++) {
          const y = Math.min(maxY, Math.round(i * vp.height * 0.9));
          await Promise.all([smoothScroll(page, y, 1600), cursor.glide(vp.width * (i % 2 ? 0.62 : 0.4), vp.height * (0.45 + 0.08 * (i % 3)), 1500, o.signal)]);
          await sleep(650, o.signal);
          if (y >= maxY) break;
        }
      });
      if (scroll) result.clips.push({ ...scroll, filename: `scroll-home-${tag}.mp4`, shows: "a smooth scroll down the homepage", width: Math.round(vp.width * vp.scale), height: Math.round(vp.height * vp.scale) });
    }
    if (await fullShot(page, join(o.outDir, `page-home-${tag}.jpg`), vp, home.scrollHeight)) result.shots.push({ file: join(o.outDir, `page-home-${tag}.jpg`), filename: `page-home-${tag}.jpg`, shows: "the full homepage (screenshot)" });

    // 3. Key pages.
    const tour = pickTourPages(page.url(), home.links, o.paths, o.maxPages ?? STUDIO_CAPTURE_LIMITS.maxPages);
    for (const url of tour) {
      if (o.signal.aborted) break;
      const slug = pageSlug(url);
      try {
        o.onStep?.(`Recording ${new URL(url).pathname}`);
        const r = await page.goto(url, { waitUntil: "domcontentloaded" });
        if (!r || r.status() >= 400) continue;
        await settle(page, o.signal);
        const f = await facts(page);
        result.pages.push({ url: page.url(), title: f.title });
        const max = Math.max(0, f.scrollHeight - vp.height);
        const clip = await recordClip(context, page, vp, o, `page-${slug}-${tag}`, async () => {
          await sleep(800, o.signal);
          if (f.heading) await cursor.glide(f.heading.x, f.heading.y + 24, 1100, o.signal);
          await sleep(500, o.signal);
          for (let i = 1; i <= 2 && max > 0; i++) {
            const y = Math.min(max, Math.round(i * vp.height * 0.75));
            await Promise.all([smoothScroll(page, y, 1700), cursor.glide(vp.width * (i % 2 ? 0.58 : 0.42), vp.height * 0.55, 1500, o.signal)]);
            await sleep(700, o.signal);
            if (y >= max) break;
          }
          await sleep(400, o.signal);
        });
        if (clip) result.clips.push({ ...clip, filename: `page-${slug}-${tag}.mp4`, shows: `the ${new URL(url).pathname} page ("${f.title.slice(0, 80)}")`, width: Math.round(vp.width * vp.scale), height: Math.round(vp.height * vp.scale) });
        const shot = join(o.outDir, `page-${slug}-${tag}.jpg`);
        if (await fullShot(page, shot, vp, f.scrollHeight)) result.shots.push({ file: shot, filename: `page-${slug}-${tag}.jpg`, shows: `the full ${new URL(url).pathname} page (screenshot)` });
      } catch (e) {
        if (o.signal.aborted) break;
        o.log?.("capture page failed", { url, error: e instanceof Error ? e.message : String(e) });
      }
    }
  } finally {
    await context.close().catch(() => undefined);
  }
  return result;
}
