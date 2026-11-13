// `komendly launch`: local/staging apps are recorded on this machine (the Ozzy servers can't reach them).
// A trimmed copy of the engine's recorder: hero with a gliding cursor on the main call to action, a smooth scroll
// down the page, a short tour of up to 3 key pages, plus full-page screenshots. Uses playwright-core (optional
// dependency, loaded on demand) driving the Chrome already installed here; nothing is downloaded.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type LaunchAspect = "16:9" | "9:16";
export interface Footage { filename: string; shows: string }
export interface Recording { dir: string; files: string[]; footage: Footage[] }
export type Recorder = (o: { url: string; aspect: LaunchAspect; log: (line: string) => void }) => Promise<Recording | null>;

export const LAUNCH_LIMITS = { maxPages: 3, maxClipMs: 14_000, navTimeoutMs: 25_000 } as const;

export const NO_BROWSER_HINT =
  "To record a local app, Chrome and the recorder need to be on this machine: install Google Chrome, then run `npm i -D playwright-core` in your project (or deploy and pass a public https:// address).";

/** True for addresses only this machine can open (localhost, private IPs, .local/.internal/.test, dotless hosts). */
export function isLocalUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch {
    return false;
  }
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || !h.includes(".") && !h.includes(":")) return true;
  if (/\.(local|internal|test|lan|home\.arpa)$/.test(h)) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  return /^f[cd][0-9a-f]{2}:/.test(h) || h.startsWith("fe80:");
}

/** Adds a scheme when missing (http for local hosts, https otherwise). */
export function withScheme(raw: string): string {
  const t = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  return `${isLocalUrl(t) ? "http" : "https"}://${t}`;
}

export interface PageLink { href: string; text: string; nav: boolean }
const SKIP_PATH = /\/(log-?in|sign-?in|sign-?up|register|auth|logout|sign-?out|account|cart|checkout|privacy|terms|legal|cookie|careers|jobs|contact|status|press)(\/|$)|^\/blog\/.+|^\/docs\/.+/i;
const KEY_WORDS = /feature|product|how-it-works|how it works|solution|use-?case|integration|pricing|demo|tour|platform|changelog|what'?s new|new|launch|showcase|example|templates?|dashboard|app/i;

/** Pages to tour besides the first one: the best same-origin nav links. Deterministic. */
export function pickTourPages(base: string, links: PageLink[], max: number = LAUNCH_LIMITS.maxPages): string[] {
  const origin = new URL(base).origin;
  const norm = (u: URL) => `${u.origin}${u.pathname.replace(/\/+$/, "") || "/"}`;
  const homeKey = norm(new URL(base));
  const scored = new Map<string, number>();
  for (const l of links) {
    let u: URL;
    try {
      u = new URL(l.href, base);
    } catch {
      continue;
    }
    if (u.origin !== origin || /\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|xml|json)$/i.test(u.pathname) || SKIP_PATH.test(u.pathname)) continue;
    const key = norm(u);
    if (key === homeKey) continue;
    let score = (l.nav ? 3 : 0) + (KEY_WORDS.test(`${u.pathname} ${l.text}`) ? 5 : 0);
    if (score <= 0) continue;
    score -= u.pathname.split("/").filter(Boolean).length * 0.3;
    scored.set(key, Math.max(scored.get(key) ?? -Infinity, score));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([k]) => k);
}

/** Where Chrome usually lives when the `chrome` channel isn't found. */
export function chromeCandidates(platform: NodeJS.Platform, env: Record<string, string | undefined>): string[] {
  if (platform === "darwin") return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"];
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter((r): r is string => Boolean(r));
    return roots.flatMap((r) => [join(r, "Google", "Chrome", "Application", "chrome.exe"), join(r, "Microsoft", "Edge", "Application", "msedge.exe")]);
  }
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium", "/usr/bin/microsoft-edge"];
}

/** Read what shipped from the repo when --notes is missing. */
export function gitNotes(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["log", "-n", "10", "--oneline", "--no-decorate"], { cwd, timeout: 5000 }, (err, stdout) => {
      const text = err ? "" : stdout.trim();
      resolve(text ? `Recent changes:\n${text}`.slice(0, 3900) : null);
    });
  });
}

// ---- Minimal playwright-core surface (the package is optional, so no compile-time types) ----
interface PwMouse { move(x: number, y: number): Promise<void> }
interface PwVideo { path(): Promise<string> }
interface PwPage {
  goto(url: string, o: { waitUntil: string; timeout: number }): Promise<{ status(): number } | null>;
  evaluate(script: string): Promise<unknown>;
  waitForLoadState(state: string, o: { timeout: number }): Promise<void>;
  screenshot(o: { path: string; type: "jpeg"; quality: number; fullPage: boolean; timeout: number }): Promise<unknown>;
  mouse: PwMouse;
  video(): PwVideo | null;
  close(): Promise<void>;
  url(): string;
}
interface PwContext { newPage(): Promise<PwPage>; addInitScript(script: string): Promise<void>; close(): Promise<void> }
interface PwBrowser { newContext(o: Record<string, unknown>): Promise<PwContext>; close(): Promise<void> }
interface PwChromium { launch(o: { channel?: string; executablePath?: string; headless: boolean }): Promise<PwBrowser> }

async function loadChromium(): Promise<PwChromium | null> {
  const name = "playwright-core";
  try {
    const mod = (await import(name)) as { chromium?: PwChromium; default?: { chromium?: PwChromium } };
    return mod.chromium ?? mod.default?.chromium ?? null;
  } catch {
    return null;
  }
}

async function launchChrome(): Promise<PwBrowser | null> {
  const chromium = await loadChromium();
  if (!chromium) return null;
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    for (const p of chromeCandidates(process.platform, process.env)) {
      if (!existsSync(p)) continue;
      try {
        return await chromium.launch({ executablePath: p, headless: true });
      } catch {
        // try the next one
      }
    }
  }
  return null;
}

const CURSOR_INIT = `(() => { const go = () => { if (document.getElementById("__oz_c")) return;
  const st = document.createElement("style"); st.textContent = "html{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important}#__oz_c{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}";
  document.documentElement.appendChild(st); const c = document.createElement("div"); c.id = "__oz_c";
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 10.5-6.6 1.3L16 21l-3 1.4-3.6-7.3L4 19.6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(c); document.addEventListener("mousemove", (e) => { c.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, true); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go(); })();`;

const FACTS_JS = `(() => {
  const vh = innerHeight, vw = innerWidth; let cta = null, best = -1;
  for (const el of document.querySelectorAll("a, button, [role=button]")) { const r = el.getBoundingClientRect(); const t = (el.textContent || "").trim();
    if (r.width < 8 || r.height < 8 || r.top < 0 || r.bottom > vh || r.right > vw || !t || t.length > 40) continue;
    const s = (/get started|start|try|sign ?up|book|demo|join|download|create|free|launch|new/i.test(t) ? 10 : 0) + Math.min(4, r.width * r.height / 4000) - (el.closest("header, nav") ? 3 : 0);
    if (s > best) { best = s; cta = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } }
  const links = [...document.querySelectorAll("a[href]")].slice(0, 400).map((a) => ({ href: a.href, text: (a.textContent || "").trim().slice(0, 60), nav: !!a.closest("header, nav, [role=navigation]") }));
  return { title: document.title || "", cta: best >= 2 ? cta : null, links, scrollHeight: document.documentElement.scrollHeight };
})()`;

const scrollTo = (y: number, ms: number) => `new Promise((res) => { const el = document.scrollingElement || document.documentElement; const f = el.scrollTop, t0 = performance.now();
  const e = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const s = (n) => { const k = Math.min(1, (n - t0) / ${ms}); el.scrollTop = f + (${y} - f) * e(k); if (k < 1) requestAnimationFrame(s); else res(); }; requestAnimationFrame(s); })`;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function glide(page: PwPage, from: { x: number; y: number }, to: { x: number; y: number }, ms: number): Promise<void> {
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps < 0.5 ? 4 * (i / steps) ** 3 : 1 - (-2 * (i / steps) + 2) ** 3 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * 40);
    await wait(16);
  }
  from.x = to.x;
  from.y = to.y;
}

interface Facts { title: string; cta: { x: number; y: number } | null; links: PageLink[]; scrollHeight: number }

/** Records `url` with the local Chrome. Returns null when playwright-core or Chrome isn't available. */
export async function recordLocal(o: { url: string; aspect: LaunchAspect; log: (line: string) => void }): Promise<Recording | null> {
  const browser = await launchChrome();
  if (!browser) return null;
  const dir = await mkdtemp(join(tmpdir(), "komendly-launch-"));
  const vp = o.aspect === "9:16" ? { width: 540, height: 960 } : { width: 1600, height: 900 };
  const tag = o.aspect === "9:16" ? "9x16" : "16x9";
  const files: string[] = [];
  const footage: Footage[] = [];
  try {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, colorScheme: "light", recordVideo: { dir, size: vp }, ...(o.aspect === "9:16" ? { isMobile: true, hasTouch: false } : {}) });
    await context.addInitScript(CURSOR_INIT);
    // One page per clip: Playwright writes each page's video when it closes.
    const clip = async (url: string, name: string, shows: string, act: (page: PwPage, f: Facts) => Promise<void>): Promise<Facts | null> => {
      const page = await context.newPage();
      let facts: Facts | null = null;
      try {
        const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: LAUNCH_LIMITS.navTimeoutMs });
        if (!r || r.status() >= 400) return null;
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
        facts = (await page.evaluate(FACTS_JS)) as Facts;
        await Promise.race([act(page, facts), wait(LAUNCH_LIMITS.maxClipMs)]);
        const shot = join(dir, `page-${name}-${tag}.jpg`);
        await page.evaluate("window.scrollTo(0, 0)");
        if (await page.screenshot({ path: shot, type: "jpeg", quality: 85, fullPage: true, timeout: 30_000 }).then(() => true, () => false)) {
          files.push(shot);
          footage.push({ filename: `page-${name}-${tag}.jpg`, shows: `${shows} (full-page screenshot)` });
        }
      } finally {
        const video = page.video();
        await page.close();
        if (video && facts) {
          const target = join(dir, `${name}-${tag}.webm`);
          await rename(await video.path(), target);
          files.push(target);
          footage.push({ filename: `${name}-${tag}.webm`, shows });
        }
      }
      return facts;
    };
    o.log(`Recording ${o.url}…`);
    const cur = { x: vp.width * 0.72, y: vp.height * 0.8 };
    const home = await clip(o.url, "home", "the homepage: hero with the cursor on the main call to action, then a smooth scroll down", async (page, f) => {
      await page.mouse.move(cur.x, cur.y);
      await wait(1200);
      if (f.cta) {
        await glide(page, cur, f.cta, 1300);
        await wait(1400);
      }
      const max = Math.max(0, f.scrollHeight - vp.height);
      for (let i = 1; i <= 3 && max > 0; i++) {
        const y = Math.min(max, Math.round(i * vp.height * 0.9));
        await Promise.all([page.evaluate(scrollTo(y, 1600)), glide(page, cur, { x: vp.width * (i % 2 ? 0.62 : 0.4), y: vp.height * 0.5 }, 1500)]);
        await wait(600);
        if (y >= max) break;
      }
    });
    if (!home) throw new Error(`Couldn't open ${o.url}. Is your app running?`);
    for (const url of pickTourPages(o.url, home.links)) {
      const path = new URL(url).pathname;
      o.log(`Recording ${path}…`);
      const slug = path.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "page";
      await clip(url, slug, `the ${path} page`, async (page, f) => {
        await wait(1000);
        const max = Math.max(0, f.scrollHeight - vp.height);
        for (let i = 1; i <= 2 && max > 0; i++) {
          await page.evaluate(scrollTo(Math.min(max, Math.round(i * vp.height * 0.75)), 1700));
          await wait(700);
        }
      }).catch(() => null);
    }
    await context.close();
  } finally {
    await browser.close().catch(() => undefined);
  }
  // Leftover unnamed videos (pages that failed) aren't uploaded.
  const known = new Set(files);
  return { dir, files: (await readdir(dir)).map((f) => join(dir, f)).filter((f) => known.has(f)).sort(), footage };
}
