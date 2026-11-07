// Playwright crawler: homepage + up to ~6 key pages. Every browser request passes the
// SSRF guard (route interception; redirects are fetched hop by hop with maxRedirects 0).
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import { assertPublicUrl, BlockedUrlError, safeFetch, UA } from "../../net/ssrf";

export interface CrawledPage {
  url: string;
  title: string;
  description: string;
  og: Record<string, string>;
  text: string;
  screenshot?: Buffer; // jpeg
}

export interface CrawledImage {
  sourceUrl: string;
  width: number;
  height: number;
  alt: string;
  bytes: Buffer;
  mime: string;
  thumb: Buffer; // small jpeg for vision classification
}

export interface CrawlResult {
  finalUrl: string;
  pages: CrawledPage[];
  colors: Array<{ hex: string; weight: number; where: string }>;
  fonts: Array<{ family: string; role: "heading" | "body"; files: Array<{ url: string; bytes: Buffer; mime: string }> }>;
  logo: { sourceUrl: string; bytes: Buffer; mime: string } | null;
  images: CrawledImage[];
}

export interface CrawlLimits {
  maxPages: number;
  pageTimeoutMs: number;
  totalTimeoutMs: number;
  maxImages: number;
  maxImageBytes: number;
  maxTextChars: number;
}

export const DEFAULT_LIMITS: CrawlLimits = {
  maxPages: 7,
  pageTimeoutMs: 8_000,
  totalTimeoutMs: 22_000,
  maxImages: 8,
  maxImageBytes: 8 * 1024 * 1024,
  maxTextChars: 12_000,
};

const KEY_PAGE_PATTERNS: Array<[RegExp, number]> = [
  [/pric|plans?\b/i, 10],
  [/feature|product|how-it-works|solution|platform|services?/i, 8],
  [/testimonial|review|customer|case-stud|success|stories/i, 8],
  [/about|story|team|why/i, 6],
  [/landing|start|demo|get-started|signup|trial/i, 4],
  [/faq/i, 3],
];

export function rankKeyLinks(base: string, links: Array<{ href: string; text: string }>, max: number): string[] {
  const origin = new URL(base).origin;
  const scored = new Map<string, number>();
  for (const l of links) {
    let u: URL;
    try {
      u = new URL(l.href, base);
    } catch {
      continue;
    }
    if (u.origin !== origin || /\.(pdf|zip|png|jpe?g|gif|svg|mp4)$/i.test(u.pathname)) continue;
    u.hash = "";
    u.search = "";
    const key = u.toString().replace(/\/$/, "");
    if (key === base.replace(/\/$/, "") || key === origin) continue;
    const hay = `${u.pathname} ${l.text}`;
    let score = 0;
    for (const [re, w] of KEY_PAGE_PATTERNS) if (re.test(hay)) score = Math.max(score, w);
    if (/blog|news|legal|privacy|terms|cookie|careers|jobs|login|sign-?in|cart|account/i.test(u.pathname)) score = 0;
    if (score > 0) scored.set(key, Math.max(scored.get(key) ?? 0, score - u.pathname.split("/").length * 0.1));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([k]) => k);
}

async function guardRoute(route: Route): Promise<void> {
  const url = route.request().url();
  if (route.request().resourceType() === "media" || /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url)) return route.abort("blockedbyclient");
  if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
  try {
    await assertPublicUrl(url);
  } catch {
    return route.abort("blockedbyclient");
  }
  try {
    // maxRedirects 0: the browser follows redirects itself, re-entering this guard per hop.
    const resp = await route.fetch({ maxRedirects: 0, timeout: 20_000 });
    return route.fulfill({ response: resp });
  } catch {
    return route.abort("failed");
  }
}

const EXTRACT_PAGE_JS = (maxText: number) => {
  const meta = (sel: string) => document.querySelector(sel)?.getAttribute("content") ?? "";
  const og: Record<string, string> = {};
  document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]').forEach((m) => {
    const k = m.getAttribute("property") ?? m.getAttribute("name") ?? "";
    og[k] = m.getAttribute("content") ?? "";
  });
  const links = [...document.querySelectorAll("a[href]")].map((a) => ({
    href: (a as HTMLAnchorElement).href,
    text: (a.textContent ?? "").trim().slice(0, 80),
  }));
  return {
    title: document.title,
    description: meta('meta[name="description"]'),
    og,
    text: (document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").slice(0, maxText),
    links,
  };
};

const BRAND_JS = () => {
  const toHex = (c: string): string | null => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return null;
    return "#" + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("");
  };
  const tally = new Map<string, { weight: number; where: string }>();
  const add = (c: string, w: number, where: string) => {
    const h = toHex(c);
    if (!h) return;
    const cur = tally.get(h);
    tally.set(h, { weight: (cur?.weight ?? 0) + w, where: cur?.where ?? where });
  };
  const sample = (sel: string, w: number, where: string, props: Array<"color" | "backgroundColor" | "borderColor">) => {
    document.querySelectorAll(sel).forEach((el, i) => {
      if (i > 40) return;
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const cs = getComputedStyle(el);
      for (const p of props) add(cs[p], w, where);
    });
  };
  sample("body", 3, "bg", ["backgroundColor", "color"]);
  sample("header, nav", 3, "header", ["backgroundColor"]);
  sample("h1, h2", 3, "heading", ["color"]);
  sample("button, a[class*=btn], a[class*=button], [role=button], input[type=submit]", 5, "cta", ["backgroundColor", "color", "borderColor"]);
  sample("a", 1, "link", ["color"]);
  sample("section, footer", 1, "section", ["backgroundColor"]);
  const fontOf = (sel: string) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fontFamily : "";
  };
  // Logo candidates: things inside a link to the homepage (absolute or relative) or the header
  // win; "logo" in class/id/alt/src helps; customer-logo walls (outside header/home links) score low.
  const isHome = (a: Element | null) => {
    if (!a) return false;
    try {
      const u = new URL((a as HTMLAnchorElement).href, location.href);
      return u.origin === location.origin && (u.pathname === "/" || u.pathname === "") ;
    } catch {
      return false;
    }
  };
  const logos: Array<{ src: string; svg?: string; score: number }> = [];
  const scoreOf = (el: Element, hay: string) => {
    const r = el.getBoundingClientRect();
    let sc = 0;
    if (isHome(el.closest("a"))) sc += 6;
    if (el.closest("header,nav,[role=banner]")) sc += 3;
    if (/logo|brand/i.test(hay)) sc += 3;
    if (r.top > 400) sc -= 6; // below the fold: likely a customer-logo wall
    if (r.width < 24 || r.height < 12) sc -= 5;
    return sc;
  };
  document.querySelectorAll("img").forEach((img) => {
    const i = img as HTMLImageElement;
    const hay = `${i.className} ${i.alt} ${i.src} ${i.id}`;
    const sc = scoreOf(i, hay);
    if ((i.currentSrc || i.src) && sc >= 4) logos.push({ src: i.currentSrc || i.src, score: sc });
  });
  document.querySelectorAll("svg").forEach((s) => {
    const r = s.getBoundingClientRect();
    if (r.width < 40) return;
    const hay = `${(s.parentElement?.className ?? "").toString()} ${s.getAttribute("class") ?? ""} ${s.id} ${s.querySelector("[id*=logo i]") ? "logo" : ""} ${s.getAttribute("aria-label") ?? ""} ${s.closest("a")?.getAttribute("aria-label") ?? ""}`;
    const sc = scoreOf(s, hay) + 1; // vector beats raster at equal score
    if (sc < 4) return;
    const clone = s.cloneNode(true) as SVGElement;
    if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    // Resolve currentColor so the mark keeps its rendered colour outside the page.
    const col = getComputedStyle(s).color;
    if (col) clone.setAttribute("color", col);
    if (!clone.getAttribute("width")) clone.setAttribute("width", String(Math.round(r.width)));
    if (!clone.getAttribute("height")) clone.setAttribute("height", String(Math.round(r.height)));
    logos.push({ src: "", svg: clone.outerHTML, score: sc });
  });
  const icons = [...document.querySelectorAll("link[rel*=icon]")].map((l) => (l as HTMLLinkElement).href);
  // Real content images: <img>/<picture> (natural size), og:image, and CSS background-images
  // on large hero/section blocks. Logos, icons, sprites and tiny images are skipped.
  const skip = /logo|icon|sprite|pixel|avatar|badge|flag|emoji|spinner|placeholder|blank\.gif/i;
  const imgs: Array<{ src: string; w: number; h: number; alt: string }> = [];
  document.querySelectorAll("img").forEach((el) => {
    const i = el as HTMLImageElement;
    const src = i.currentSrc || i.src;
    const r = i.getBoundingClientRect();
    const w = i.naturalWidth || Math.round(r.width);
    const h = i.naturalHeight || Math.round(r.height);
    if (!src || src.startsWith("data:") || skip.test(`${src} ${i.className} ${i.alt}`)) return;
    if (i.closest("header,nav,footer") && r.height < 120) return;
    if (w >= 300 && h >= 200) imgs.push({ src, w, h, alt: i.alt });
  });
  document.querySelectorAll("section, header, main > div, [class*=hero i], [class*=banner i], [style*=background]").forEach((el, n) => {
    if (n > 200) return;
    const bg = getComputedStyle(el).backgroundImage;
    const m = /url\(["']?([^"')]+)["']?\)/.exec(bg);
    const r = el.getBoundingClientRect();
    if (!m?.[1] || m[1].startsWith("data:") || skip.test(m[1]) || r.width < 400 || r.height < 250) return;
    try {
      imgs.push({ src: new URL(m[1], location.href).href, w: Math.round(r.width), h: Math.round(r.height), alt: "background" });
    } catch {
      /* bad url */
    }
  });
  const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
  if (ogImg) {
    try {
      imgs.push({ src: new URL(ogImg, location.href).href, w: 1200, h: 630, alt: "og:image" });
    } catch {
      /* bad url */
    }
  }
  const images = imgs;
  return {
    colors: [...tally.entries()].map(([hex, v]) => ({ hex, ...v })),
    headingFont: fontOf("h1") || fontOf("h2"),
    bodyFont: fontOf("p") || fontOf("body"),
    logos: logos.sort((a, b) => b.score - a.score).slice(0, 4),
    icons,
    images,
  };
};

export class SiteUnreachableError extends Error {
  readonly userMessage: string;
  constructor(message: string) {
    super(message);
    this.name = "SiteUnreachableError";
    this.userMessage = "We couldn't open this website. Check the address is right and the site is publicly reachable, then try again.";
  }
}

/** Bound a promise by a deadline (rejects; the caller tears down the browser). */
function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, rej) => {
      t = setTimeout(() => rej(new Error(`${what} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Crawl with fallbacks: parallel browser crawl -> fresh browser, single tab ->
 * plain fetch + HTML parse. Only throws SiteUnreachableError/BlockedUrlError when all fail.
 */
export async function crawlSite(url: string, limits: CrawlLimits = DEFAULT_LIMITS, signal?: AbortSignal): Promise<CrawlResult> {
  await assertPublicUrl(url);
  const errors: string[] = [];
  for (const tabs of [3, 1]) {
    try {
      const budget = tabs === 3 ? limits.totalTimeoutMs : Math.round(limits.totalTimeoutMs * 0.7);
      const r = await crawlWithBrowser(url, { ...limits, totalTimeoutMs: budget }, tabs, signal);
      if (r.pages.some((p) => p.text.trim().length >= 50)) return r;
      errors.push(`browser(${tabs}): no readable text`);
    } catch (e) {
      if (e instanceof BlockedUrlError || signal?.aborted) throw e;
      errors.push(`browser(${tabs}): ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }
  try {
    const r = await crawlWithFetch(url, limits, signal);
    if (r.pages.some((p) => p.text.trim().length >= 50)) return r;
    errors.push("fetch: no readable text");
  } catch (e) {
    if (e instanceof BlockedUrlError) throw e;
    errors.push(`fetch: ${e instanceof Error ? e.message : String(e)}`);
  }
  throw new SiteUnreachableError(`crawl failed: ${errors.join(" | ")}`);
}

// ---- plain fetch fallback ----------------------------------------------------
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)));
}

export function htmlToPage(html: string, url: string): { page: CrawledPage; links: Array<{ href: string; text: string }>; icons: string[] } {
  const attr = (tag: string, name: string) => new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1] ?? "";
  const og: Record<string, string> = {};
  let description = "";
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = attr(tag, "property") || attr(tag, "name");
    const content = decodeEntities(attr(tag, "content"));
    if (/^(og|twitter):/i.test(key)) og[key] = content;
    if (/^description$/i.test(key)) description = content;
  }
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "");
  const links: Array<{ href: string; text: string }> = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(m[1] ?? "", "href");
    if (!href) continue;
    try {
      links.push({ href: new URL(href, url).toString(), text: decodeEntities((m[2] ?? "").replace(/<[^>]+>/g, " ")).trim().slice(0, 80) });
    } catch {
      /* bad href */
    }
  }
  const icons: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/rel\s*=\s*["'][^"']*icon/i.test(m[0])) {
      try {
        icons.push(new URL(attr(m[0], "href"), url).toString());
      } catch {
        /* bad */
      }
    }
  }
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|p|div|li|h[1-6]|section|article|tr|header|footer)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { page: { url, title, description, og, text }, links, icons };
}

async function crawlWithFetch(url: string, limits: CrawlLimits, signal?: AbortSignal): Promise<CrawlResult> {
  const deadline = Date.now() + limits.totalTimeoutMs;
  const home = await safeFetch(url, { maxBytes: 5_000_000, timeoutMs: limits.pageTimeoutMs, signal });
  if (home.status >= 400) throw new Error(`HTTP ${home.status}`);
  const h = htmlToPage(home.body.toString("utf8"), home.url);
  h.page.text = h.page.text.slice(0, limits.maxTextChars);
  const pages: CrawledPage[] = [h.page];
  const targets = rankKeyLinks(home.url, h.links, limits.maxPages - 1);
  await Promise.all(
    targets.map(async (t) => {
      if (Date.now() > deadline) return;
      try {
        const r = await safeFetch(t, { maxBytes: 3_000_000, timeoutMs: Math.min(limits.pageTimeoutMs, deadline - Date.now()), signal });
        if (r.status < 400 && /html/i.test(r.contentType)) {
          const p = htmlToPage(r.body.toString("utf8"), r.url).page;
          pages.push({ ...p, text: p.text.slice(0, limits.maxTextChars) });
        }
      } catch {
        /* skip */
      }
    }),
  );
  pages.sort((a, b) => (a.url === home.url ? -1 : b.url === home.url ? 1 : targets.indexOf(a.url) - targets.indexOf(b.url)));
  let logo: CrawlResult["logo"] = null;
  for (const src of [...h.icons.filter((i) => /apple-touch|\.svg|\.png/i.test(i)), h.page.og["og:image"] ?? ""].filter(Boolean)) {
    try {
      const f = await safeFetch(src, { maxBytes: 2_000_000, timeoutMs: 8_000 });
      if (f.status === 200 && f.contentType.startsWith("image/")) {
        logo = { sourceUrl: src, bytes: f.body, mime: f.contentType.split(";")[0] ?? "image/png" };
        break;
      }
    } catch {
      /* next */
    }
  }
  const theme = /<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i.exec(home.body.toString("utf8"))?.[1];
  return {
    finalUrl: home.url,
    pages,
    colors: theme && /^#[0-9a-f]{6}$/i.test(theme) ? [{ hex: theme.toLowerCase(), weight: 5, where: "theme-color" }] : [],
    fonts: [],
    logo,
    images: await downloadImages(fetchImages(home.body.toString("utf8"), home.url, h.page.og["og:image"]), limits, deadline + 4_000, signal),
  };
}

function fetchImages(html: string, base: string, og: string | undefined): Array<{ src: string; w: number; h: number; alt: string }> {
  const out: Array<{ src: string; w: number; h: number; alt: string }> = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || src.startsWith("data:") || /logo|icon|sprite|pixel|avatar/i.test(tag)) continue;
    try {
      out.push({ src: new URL(src, base).href, w: Number(/width=["']?(\d+)/i.exec(tag)?.[1] ?? 800), h: Number(/height=["']?(\d+)/i.exec(tag)?.[1] ?? 600), alt: /alt=["']([^"']*)/i.exec(tag)?.[1] ?? "" });
    } catch {
      /* bad */
    }
  }
  if (og) {
    try {
      out.push({ src: new URL(og, base).href, w: 1200, h: 630, alt: "og:image" });
    } catch {
      /* bad */
    }
  }
  return out;
}

const imageKey = (src: string) => {
  try {
    const u = new URL(src);
    return `${u.host}${u.pathname.replace(/[-_@](\d{2,4}x\d{0,4}|\d{2,4}w)(?=\.)/i, "")}`;
  } catch {
    return src;
  }
};

export async function downloadImages(
  candidates: Array<{ src: string; w: number; h: number; alt: string }>,
  limits: CrawlLimits,
  deadline: number,
  signal?: AbortSignal,
): Promise<CrawledImage[]> {
  const sharp = (await import("sharp")).default;
  const best = new Map<string, { src: string; w: number; h: number; alt: string }>();
  for (const c of candidates) {
    const k = imageKey(c.src);
    const cur = best.get(k);
    if (!cur || c.w * c.h > cur.w * cur.h) best.set(k, c);
  }
  const picked = [...best.values()].sort((a, b) => b.w * b.h - a.w * a.h || a.src.localeCompare(b.src)).slice(0, limits.maxImages + 6);
  const out: Array<CrawledImage | null> = new Array(picked.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const n = next++;
        const c = picked[n];
        if (!c || Date.now() > deadline || signal?.aborted) return;
        try {
          const f = await safeFetch(c.src, { maxBytes: limits.maxImageBytes, timeoutMs: 8_000, signal });
          if (f.status !== 200 || !/^image\/(png|jpe?g|webp|gif|avif)/.test(f.contentType)) continue;
          const meta = await sharp(f.body).metadata();
          const width = meta.width ?? c.w;
          const height = meta.height ?? c.h;
          if (width < 300 || height < 200) continue;
          let bytes = f.body;
          let mime = f.contentType.split(";")[0] ?? "image/jpeg";
          // Normalise formats renderers may not handle well (avif/gif) to PNG.
          if (/avif|gif/.test(mime)) {
            bytes = await sharp(f.body).png().toBuffer();
            mime = "image/png";
          }
          const thumb = await sharp(f.body).resize(512, 512, { fit: "inside" }).flatten({ background: "#ffffff" }).jpeg({ quality: 60 }).toBuffer();
          out[n] = { sourceUrl: c.src, width, height, alt: c.alt, bytes, mime, thumb };
        } catch {
          /* skip image */
        }
      }
    }),
  );
  return out.filter((x): x is CrawledImage => x !== null).slice(0, limits.maxImages);
}

async function crawlWithBrowser(url: string, limits: CrawlLimits, tabs: number, signal?: AbortSignal): Promise<CrawlResult> {
  const deadline = Date.now() + limits.totalTimeoutMs;
  const browser: Browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-blink-features=AutomationControlled"] });
  const onAbort = () => void browser.close();
  signal?.addEventListener("abort", onAbort, { once: true });
  // Hard total deadline: kill the browser (any pending call rejects) a little after the budget.
  const killer = setTimeout(() => void browser.close().catch(() => undefined), limits.totalTimeoutMs + 15_000);
  try {
    const ctx: BrowserContext = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 800 },
      serviceWorkers: "block",
      acceptDownloads: false,
      javaScriptEnabled: true,
    });
    // tsx/esbuild (keepNames) wraps functions in __name(); define it in the page so
    // page.evaluate of our in-page functions works under both tsx and plain tsc output.
    await ctx.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });
    await ctx.route("**/*", guardRoute);
    const fontFiles = new Map<string, { bytes: Buffer; mime: string }>();
    ctx.on("response", async (r) => {
      try {
        if (r.request().resourceType() !== "font" || fontFiles.size >= 8) return;
        const b = await r.body();
        if (b.length < 2_000_000) fontFiles.set(r.url(), { bytes: b, mime: r.headers()["content-type"] ?? "font/woff2" });
      } catch {
        /* ignore */
      }
    });

    const visit = (page: Page, target: string, shot = true) => within(visitInner(page, target, shot), limits.pageTimeoutMs + 3_000, `page ${target}`);
    const visitInner = async (page: Page, target: string, shot = true) => {
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: limits.pageTimeoutMs });
      await page.waitForLoadState("networkidle", { timeout: shot ? 5_000 : 2_500 }).catch(() => undefined);
      // Trigger lazy images
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)).catch(() => undefined);
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
      const info = await page.evaluate(EXTRACT_PAGE_JS, limits.maxTextChars);
      const screenshot = shot ? await page.screenshot({ type: "jpeg", quality: 70 }).catch(() => undefined) : undefined;
      return { info, screenshot };
    };

    const page = await ctx.newPage();
    const home = await visit(page, url);
    const finalUrl = page.url();
    await assertPublicUrl(finalUrl);
    const brand = await within(page.evaluate(BRAND_JS), 8_000, "brand scan");
    const pages: CrawledPage[] = [
      { url: finalUrl, title: home.info.title, description: home.info.description, og: home.info.og, text: home.info.text, screenshot: home.screenshot },
    ];
    const allImages = [...brand.images];
    // Key pages in parallel (3 tabs), results kept in rank order.
    const targets = rankKeyLinks(finalUrl, home.info.links, limits.maxPages - 1);
    const results: Array<{ page: CrawledPage; images: typeof brand.images } | null> = new Array(targets.length).fill(null);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(tabs, targets.length) }, async () => {
        const tab = await ctx.newPage();
        try {
          for (;;) {
            const i = next++;
            const target = targets[i];
            if (!target || Date.now() > deadline || signal?.aborted) break;
            try {
              const p = await visit(tab, target, false);
              const extra = await within(tab.evaluate(BRAND_JS), 6_000, "brand scan");
              results[i] = { page: { url: tab.url(), title: p.info.title, description: p.info.description, og: p.info.og, text: p.info.text }, images: extra.images };
            } catch {
              /* skip page */
            }
          }
        } finally {
          await tab.close().catch(() => undefined);
        }
      }),
    );
    for (const r of results) {
      if (!r) continue;
      pages.push(r.page);
      allImages.push(...r.images);
    }

    // Images: dedupe (ignoring CDN size params), biggest first; download 4 at a time, measure
    // real pixels and thumbnail with sharp (no page round-trips).
    const images = await downloadImages(allImages, limits, deadline + 4_000, signal);

    // Logo: best candidate, then apple-touch/icon, then og:image.
    let logo: CrawlResult["logo"] = null;
    for (const c of brand.logos) {
      if (c.svg) {
        logo = { sourceUrl: finalUrl, bytes: Buffer.from(c.svg), mime: "image/svg+xml" };
        break;
      }
      try {
        const f = await safeFetch(c.src, { maxBytes: 2_000_000 });
        if (f.status === 200 && f.contentType.startsWith("image/")) {
          logo = { sourceUrl: c.src, bytes: f.body, mime: f.contentType.split(";")[0] ?? "image/png" };
          break;
        }
      } catch {
        /* next */
      }
    }
    if (!logo) {
      const fallbacks = [...brand.icons.filter((i) => /apple-touch|\.svg|\.png/i.test(i)), home.info.og["og:image"] ?? ""].filter(Boolean);
      for (const src of fallbacks) {
        try {
          const f = await safeFetch(src, { maxBytes: 2_000_000 });
          if (f.status === 200 && f.contentType.startsWith("image/")) {
            logo = { sourceUrl: src, bytes: f.body, mime: f.contentType.split(";")[0] ?? "image/png" };
            break;
          }
        } catch {
          /* next */
        }
      }
    }

    const fontFamilies = (css: string) => css.split(",")[0]?.replace(/["']/g, "").trim() ?? "";
    const matchFiles = (fam: string) =>
      [...fontFiles.entries()]
        .filter(([u]) => u.toLowerCase().replace(/[-_ ]/g, "").includes(fam.toLowerCase().replace(/[-_ ]/g, "")))
        .map(([u, v]) => ({ url: u, ...v }));
    const fonts: CrawlResult["fonts"] = [];
    const hf = fontFamilies(brand.headingFont);
    const bf = fontFamilies(brand.bodyFont);
    if (hf) fonts.push({ family: hf, role: "heading", files: matchFiles(hf) });
    if (bf && bf !== hf) fonts.push({ family: bf, role: "body", files: matchFiles(bf) });

    return {
      finalUrl,
      pages,
      colors: brand.colors.sort((a, b) => b.weight - a.weight).slice(0, 12),
      fonts,
      logo,
      images,
    };
  } catch (e) {
    if (e instanceof BlockedUrlError) throw e;
    throw e;
  } finally {
    clearTimeout(killer);
    signal?.removeEventListener("abort", onAbort);
    await browser.close().catch(() => undefined);
  }
}
