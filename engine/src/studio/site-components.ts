// Ozzy Studio: real pieces of the business's own website (hero, pricing card, reviews, product and feature cards)
// cut out as crisp PNGs into ./brand/site/, so videos can show their actual site, on-brand and accurate.
// Captured once per brand profile version, cached in storage next to the brand (ws/<ws>/brand/<bp>/site/...).
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Route } from "playwright";
import type { Storage } from "../storage/s3";
import { brandKey } from "../storage/keys";
import { DISMISS_COOKIES_JS } from "./capture-record";

export type ComponentKind = "hero" | "pricing" | "testimonial" | "product" | "feature" | "card" | "cta" | "section";
export interface ComponentCandidate { id: number; x: number; y: number; w: number; h: number; kind: ComponentKind; label: string }
export interface SiteComponent { file: string; kind: ComponentKind; label: string; width: number; height: number }

export const MAX_SITE_COMPONENTS = 8;
const KIND_RANK: Record<ComponentKind, number> = { hero: 0, pricing: 1, testimonial: 2, product: 3, feature: 4, card: 5, cta: 6, section: 7 };
const PER_KIND: Partial<Record<ComponentKind, number>> = { hero: 1, section: 2, cta: 1 };
const VIEW = { width: 1440, height: 900, scale: 2 };

/** Overlap of two boxes as a share of the smaller one (1 = one sits inside the other). */
export function overlapShare(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const small = Math.min(a.w * a.h, b.w * b.h);
  return small > 0 ? (ix * iy) / small : 0;
}

/** Pure: best distinct components, by kind (hero, pricing, reviews, products, features...), then page order. */
export function pickComponents(cands: ComponentCandidate[], max = MAX_SITE_COMPONENTS): ComponentCandidate[] {
  const sorted = [...cands].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.y - b.y || a.x - b.x);
  const out: ComponentCandidate[] = [];
  const perKind = new Map<ComponentKind, number>();
  for (const c of sorted) {
    if (out.length >= max) break;
    if ((perKind.get(c.kind) ?? 0) >= (PER_KIND[c.kind] ?? 3)) continue;
    if (out.some((o) => overlapShare(o, c) > 0.6)) continue;
    out.push(c);
    perKind.set(c.kind, (perKind.get(c.kind) ?? 0) + 1);
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function componentFile(c: Pick<ComponentCandidate, "kind">, i: number): string {
  return `${String(i + 1).padStart(2, "0")}-${c.kind}.png`;
}

export function describeComponent(c: SiteComponent): string {
  return `./brand/site/${c.file} (${c.kind}${c.label ? `: "${c.label}"` : ""}, ${c.width}x${c.height})`;
}

// In-page: tag candidate elements with data-ozzy-c and describe them. String, not a function (tsx would inject helpers).
const FIND_JS = `(() => {
  const vw = innerWidth, out = [];
  const sel = "section, header, article, main > div, form, figure, blockquote, li, [class*=hero i], [class*=card i], [class*=pricing i], [class*=price i], [class*=plan i], [class*=testimonial i], [class*=review i], [class*=feature i], [class*=product i], [class*=benefit i], [class*=cta i], [class*=banner i]";
  const skip = (el) => el.closest("nav, footer, [role=dialog], [class*=cookie i], [class*=consent i], [id*=cookie i]");
  let id = 0;
  for (const el of document.querySelectorAll(sel)) {
    if (!(el instanceof HTMLElement) || skip(el)) continue;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || +st.opacity < 0.5 || st.position === "fixed") continue;
    const y = r.top + scrollY, w = r.width, h = r.height;
    if (w < 220 || h < 120 || w > vw + 2 || h > 1500 || w * h < 40000) continue;
    const text = (el.innerText || "").replace(/\\s+/g, " ").trim();
    const hasImg = !!el.querySelector("img, picture, svg, video, [style*=background-image]");
    if (text.length < 12 && !hasImg) continue;
    const tag = ((el.className && typeof el.className === "string" ? el.className : "") + " " + el.id).toLowerCase();
    let kind = "section";
    if (y < 900 && el.querySelector("h1")) kind = "hero";
    else if (/pricing|plan|price/.test(tag) || /\\$\\s?\\d+.{0,12}(\\/|per )\\s?(mo|month|yr|year)/i.test(text)) kind = "pricing";
    else if (/testimonial|review|quote/.test(tag) || el.tagName === "BLOCKQUOTE" || /★|⭐/.test(text)) kind = "testimonial";
    else if (/product/.test(tag)) kind = "product";
    else if (/feature|benefit/.test(tag)) kind = "feature";
    else if (/card/.test(tag) || el.tagName === "ARTICLE" || el.tagName === "LI" || el.tagName === "FIGURE") kind = "card";
    else if (/cta|banner/.test(tag) || el.tagName === "FORM") kind = "cta";
    if ((kind === "card" || el.tagName === "LI") && text.length < 12 && !hasImg) continue;
    const head = el.querySelector("h1, h2, h3, h4");
    const label = ((head && head.textContent) || text).replace(/\\s+/g, " ").trim().slice(0, 70);
    el.setAttribute("data-ozzy-c", String(id));
    out.push({ id: id++, x: Math.round(r.left + scrollX), y: Math.round(y), w: Math.round(w), h: Math.round(h), kind, label });
  }
  return out;
})()`;

// After the hero: hide sticky/fixed bars (headers, chat bubbles) so they aren't stamped over other sections.
const HIDE_FLOATING_JS = `(() => { for (const el of document.querySelectorAll("body *")) { if (!(el instanceof HTMLElement)) continue; const p = getComputedStyle(el).position; if (p === "fixed" || p === "sticky") el.style.setProperty("visibility", "hidden", "important"); } return 1; })()`;

/** A cut-out that is basically one flat colour (an image that never loaded): not worth showing. */
export async function isBlankPng(file: string): Promise<boolean> {
  const sharp = (await import("sharp")).default;
  const st = await sharp(file).greyscale().resize(64, 64, { fit: "fill" }).stats().catch(() => null);
  return !st || (st.channels[0]?.stdev ?? 0) < 6;
}

const SCROLL_ALL_JS = `new Promise((res) => { let y = 0; const H = () => document.documentElement.scrollHeight; const step = () => { y += innerHeight * 0.8; scrollTo(0, y); if (y < Math.min(H(), 12000)) setTimeout(step, 120); else { scrollTo(0, 0); setTimeout(res, 400); } }; step(); })`;

/** Capture components of `url` into outDir. Never throws (returns [] on any problem). */
export async function captureSiteComponents(o: { browser: Browser; url: string; outDir: string; guard?: (route: Route) => Promise<void>; timeoutMs?: number; log?: (msg: string, data?: Record<string, unknown>) => void }): Promise<SiteComponent[]> {
  const context = await o.browser.newContext({ viewport: { width: VIEW.width, height: VIEW.height }, deviceScaleFactor: VIEW.scale }).catch(() => null);
  if (!context) return [];
  const deadline = Date.now() + (o.timeoutMs ?? 30_000);
  try {
    if (o.guard) await context.route("**/*", o.guard);
    const page = await context.newPage();
    await page.goto(o.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => undefined);
    await page.evaluate(DISMISS_COOKIES_JS).catch(() => 0);
    await page.evaluate(SCROLL_ALL_JS).catch(() => undefined);
    await page.evaluate("document.fonts ? document.fonts.ready.then(() => 1) : 1").catch(() => undefined);
    await page.evaluate(DISMISS_COOKIES_JS).catch(() => 0);
    const cands = (await page.evaluate(FIND_JS)) as ComponentCandidate[];
    const picked = pickComponents(cands);
    o.log?.("site components found", { url: o.url, candidates: cands.length, picked: picked.length });
    await mkdir(o.outDir, { recursive: true });
    const out: SiteComponent[] = [];
    let hidFloating = false;
    for (const [i, c] of picked.entries()) {
      if (Date.now() > deadline) break;
      if (c.kind !== "hero" && !hidFloating) { await page.evaluate(HIDE_FLOATING_JS).catch(() => 0); hidFloating = true; }
      const file = componentFile(c, i);
      const ok = await page.locator(`[data-ozzy-c="${c.id}"]`).first().screenshot({ path: join(o.outDir, file), type: "png", timeout: 8_000, animations: "disabled" }).then(() => true, () => false);
      if (!ok) o.log?.("site component screenshot failed", { kind: c.kind });
      if (ok && (await isBlankPng(join(o.outDir, file)))) { await rm(join(o.outDir, file), { force: true }); continue; }
      if (ok) out.push({ file, kind: c.kind, label: c.label, width: Math.round(c.w * VIEW.scale), height: Math.round(c.h * VIEW.scale) });
    }
    return out;
  } catch (e) {
    o.log?.("site components capture failed", { url: o.url, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    return [];
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Cached per brand-profile version: download the cached set, or capture once and store it. Never throws. */
export async function installSiteComponents(o: {
  storage: Storage; project: string; workspaceId: string; brandProfileId: string; version: string; url: string;
  browser: () => Promise<Browser>; guard?: (route: Route) => Promise<void>; assertUrl?: (url: string) => Promise<unknown>;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}): Promise<SiteComponent[]> {
  const dir = join(o.project, "brand", "site");
  const prefix = brandKey(o.workspaceId, o.brandProfileId, "site", o.version);
  const manifestKey = `${prefix}/manifest.json`;
  try {
    const cached = await o.storage.get(manifestKey).then((b) => JSON.parse(b.toString("utf8")) as SiteComponent[], () => null);
    if (cached) {
      await mkdir(dir, { recursive: true });
      const got = await Promise.all(cached.map((c) => o.storage.get(`${prefix}/${c.file}`).then((b) => writeFile(join(dir, c.file), b)).then(() => c, () => null)));
      return got.filter((c): c is SiteComponent => c !== null);
    }
    if (o.assertUrl) await o.assertUrl(o.url);
    const comps = await captureSiteComponents({ browser: await o.browser(), url: o.url, outDir: dir, ...(o.guard ? { guard: o.guard } : {}), ...(o.log ? { log: o.log } : {}) });
    const { readFile } = await import("node:fs/promises");
    await Promise.all(comps.map(async (c) => o.storage.put(`${prefix}/${c.file}`, await readFile(join(dir, c.file)), "image/png")));
    await o.storage.put(manifestKey, Buffer.from(JSON.stringify(comps)), "application/json");
    return comps;
  } catch (e) {
    o.log?.("site components skipped", { error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    return [];
  }
}
