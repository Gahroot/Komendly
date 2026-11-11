// Reels safe zones + no fake UI. Pure geometry (tested) plus a Playwright inspector that steps a
// HyperFrames composition's GSAP timeline and reads every visible text box before it is rendered.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ratio } from "../../../../src/lib/ads/contracts";

/** Share of the frame kept free of text: Reels UI covers the top ~14% and bottom ~35%; 6% sides. */
export const REELS_SAFE = { top: 0.14, bottom: 0.35, side: 0.06 } as const;

export interface TextBox {
  t: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text sits on a small rounded filled/bordered shape (reads as a tappable button). */
  pill: boolean;
}

export interface SafeZoneReport {
  ok: boolean;
  checked: boolean;
  issues: string[];
}

/** Allowed text box (px) for a ratio; null when the ratio has no feed-UI overlay rule. */
export function safeRect(ratio: Ratio, width: number, height: number): { x0: number; y0: number; x1: number; y1: number } | null {
  if (ratio !== "9:16") return null;
  return { x0: width * REELS_SAFE.side, y0: height * REELS_SAFE.top, x1: width * (1 - REELS_SAFE.side), y1: height * (1 - REELS_SAFE.bottom) };
}

const where = (b: TextBox, r: { x0: number; y0: number; x1: number; y1: number }, H: number): string[] => {
  const tol = H * 0.01;
  const out: string[] = [];
  if (b.y + b.h > r.y1 + tol) out.push(`reaches ${Math.round(((b.y + b.h) / H) * 100)}% down (bottom 35% is covered by the Reels caption/CTA)`);
  if (b.y < r.y0 - tol) out.push(`starts ${Math.round((b.y / H) * 100)}% down (top 14% is covered by the Reels header)`);
  if (b.x < r.x0 - tol || b.x + b.w > r.x1 + tol) out.push("is within 6% of a side edge");
  return out;
};

/** Issues for sampled text boxes (deduped by text), most important first. */
export function safeZoneIssues(boxes: TextBox[], ratio: Ratio, width: number, height: number): string[] {
  const r = safeRect(ratio, width, height);
  const seen = new Map<string, string>();
  for (const b of [...boxes].sort((a, c) => a.t - c.t || a.text.localeCompare(c.text))) {
    const label = b.text.replace(/\s+/g, " ").trim().slice(0, 60);
    if (label.length < 2) continue;
    // Off-frame (entering/leaving) boxes are not readable text.
    if (b.w <= 0 || b.h <= 0 || b.x >= width || b.y >= height || b.x + b.w <= 0 || b.y + b.h <= 0) continue;
    if (b.pill && !seen.has(`pill:${label}`)) seen.set(`pill:${label}`, `"${label}" (at ${b.t.toFixed(1)}s) is drawn as a button/pill: Meta rejects fake UI. Show it as plain text, no rounded filled or outlined shape.`);
    if (r && !seen.has(`zone:${label}`)) {
      const w = where(b, r, height);
      if (w.length) seen.set(`zone:${label}`, `"${label}" (at ${b.t.toFixed(1)}s) ${w.join("; ")}. Keep all text between ${Math.round(REELS_SAFE.top * 100)}% and ${Math.round((1 - REELS_SAFE.bottom) * 100)}% of the height.`);
    }
  }
  return [...seen.values()].slice(0, 12);
}

/** Sample times: every `step` s plus 0.2 s before the end (the end card). */
export function sampleTimes(duration: number, step = 0.4): number[] {
  const out: number[] = [];
  for (let t = 0.1; t < duration; t += step) out.push(Math.round(t * 100) / 100);
  if (duration > 0.3) out.push(Math.round((duration - 0.2) * 100) / 100);
  return out;
}

/** Text written for ./brand/review.txt so the agent fixes the exact elements. */
export function safeZoneReview(issues: string[]): string {
  return ["The video breaks Meta Reels placement rules (hard rules, not style):", ...issues.map((i) => `- ${i}`), "Move every word, the CTA and the URL up into the safe band; keep the CTA as plain text (e.g. 'Book online at site.com')."].join("\n");
}

/** The few rules that matter (Meta placement, honesty), in ./brand/rules.txt. Everything else is creative freedom. */
export function motionRules(ratio: Ratio): string {
  const tall = ratio === "9:16";
  return [
    "RULES (Meta rejects or buries the ad otherwise; everything else is yours to design boldly):",
    tall
      ? "1. Words in the safe band (1080x1920): every readable word, the CTA and the URL sits between y=270 and y=1248 and x=65..1015 (Reels UI covers the top 14% and bottom 35%). Fill the WHOLE frame with the design (backdrops, images, characters, props reach every edge); only words stay in the band."
      : "1. Keep every word, the CTA and the URL at least 6% from every edge; fill the whole frame with the design.",
    "2. The CTA is plain text with the URL (e.g. 'Book online at site.com'), not a button or pill. No fake system UI (phone notifications, play buttons, fake ratings). Showing the brand's own real product or screens in motion is fine.",
    "3. Honest: names, prices, numbers and claims come from the site; never invent reviews or results.",
    "4. End on the logo + brand name + the CTA with the URL, held about 1.5 s, INSIDE the ad's own world (same background, logo and CTA animate in over it): never a flat white or new plain card, no brightness flash.",
    "5. Check scene changes: look at stills just before and just after every cut and make sure scene changes are clean and there are no stutters (no blank or half-built frame, no jump back, nothing popping in late or twice).",
    "",
    "CRAFT (the renderer checks these; frozen stretches come back to you to fix):",
    "6. Something acts every 2-3 s: a hero DOES something (the product or the brand's real screens in use, a cursor typing into or clicking the site's real booking/quote flow, cards flying out, a number counting up, a before->after wipe on a real site photo, or a simple drawn mascot/character reacting). Use the site's real product images/screens when ./brand has them; otherwise a simple drawn character or the product as hero.",
    "7. Layers: every scene has >= 3 depth layers moving at different speeds (background world, mid props/images, foreground type). One persistent background world runs through the whole ad (built from the brand's colours and setting), never a hard switch to a new flat colour each beat. Include at least one stacked-card / fanned 3D-ish beat.",
    "8. No holds: nothing on screen may stay frozen longer than 0.4 s (keep a camera drift, parallax, type wiggle or light sweep running). No two consecutive beats share a layout; >= 6 distinct compositions in 15 s, including one full-screen number or word slam.",
    "9. Beat sync: ./brand/music.mp3 starts at t=0; ./brand/beats.json lists its beats in video seconds. Every scene change and text slam starts exactly on a listed beat (biggest moments on `strong`). Put a hit SFX from ./brand/sfx (hit-*, click-* for UI presses) on major transitions and presses, quieter than the music.",
    "10. Hook: the first 0.5 s is a motion hit (word slam / fast zoom) on the buyer's frustration line, never a static headline. Kinetic type: per-word slams, scale or mask reveals, highlight bars; not fade-in captions.",
  ].join("\n");
}

/** Steps a composition in headless Chrome and returns every visible text box per sample time. */
export async function inspectComposition(dir: string, opts: { executablePath?: string; signal?: AbortSignal } = {}): Promise<{ width: number; height: number; duration: number; boxes: TextBox[] } | null> {
  const html = await readFile(join(dir, "index.html"), "utf8").catch(() => "");
  if (!html) return null;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ ...(opts.executablePath ? { executablePath: opts.executablePath } : {}), args: ["--force-color-profile=srgb", "--disable-dev-shm-usage", "--allow-file-access-from-files"] });
  try {
    const m = /data-width="(\d+)"[^>]*data-height="(\d+)"/.exec(html) ?? /data-height="(\d+)"[^>]*data-width="(\d+)"/.exec(html);
    const width = Number(m?.[1] ?? 1080);
    const height = Number(m?.[2] ?? 1920);
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`file://${join(dir, "index.html")}`, { waitUntil: "load", timeout: 30_000 });
    // tsx/esbuild (keepNames) wraps inner functions in __name(): define it in the page so evaluate() bodies run.
    await page.evaluate("globalThis.__name = globalThis.__name || ((f) => f)");
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(300);
    const duration = await page.evaluate(() => {
      const w = window as unknown as { __timelines?: Record<string, { duration(): number }> };
      const tl = Object.values(w.__timelines ?? {})[0];
      const root = document.querySelector("[data-composition-id]");
      return Number(root?.getAttribute("data-duration")) || (tl ? tl.duration() : 0);
    });
    const boxes: TextBox[] = [];
    for (const t of sampleTimes(Math.min(duration || 15, 60))) {
      if (opts.signal?.aborted) break;
      const got = await page.evaluate((time: number) => {
        const w = window as unknown as { __timelines?: Record<string, { seek(t: number, s?: boolean): void; pause(): void }> };
        for (const tl of Object.values(w.__timelines ?? {})) { tl.pause(); tl.seek(time, false); }
        // Emulate the HyperFrames clip visibility for numeric data-start/data-duration.
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-start][data-duration]"))) {
          if (el.hasAttribute("data-composition-id")) continue;
          const s = Number(el.getAttribute("data-start"));
          const d = Number(el.getAttribute("data-duration"));
          if (Number.isFinite(s) && Number.isFinite(d)) el.style.visibility = time >= s && time < s + d ? "" : "hidden";
        }
        const root = (document.querySelector("[data-composition-id]") as HTMLElement | null) ?? document.body;
        const rb = root.getBoundingClientRect();
        const out: Array<{ text: string; x: number; y: number; w: number; h: number; pill: boolean }> = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const alpha = (c: string) => { const a = /rgba?\(([^)]+)\)/.exec(c)?.[1]?.split(",").map((s) => s.trim()); return a ? (a.length > 3 ? Number(a[3]) : 1) : 0; };
        const byEl = new Map<Element, { text: string; x0: number; y0: number; x1: number; y1: number }>();
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = (n.textContent ?? "").trim();
          const el = n.parentElement;
          if (!el || text.length < 1 || ["SCRIPT", "STYLE", "TITLE"].includes(el.tagName)) continue;
          let op = 1;
          let hidden = false;
          for (let e: Element | null = el; e; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.display === "none" || cs.visibility === "hidden") { hidden = true; break; }
            op *= Number(cs.opacity);
          }
          if (hidden || op < 0.25 || alpha(getComputedStyle(el).color) < 0.25) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width < 2 || r.height < 2) continue;
            // Group by the nearest block-level ancestor so word-split spans form one line.
            let key: Element = el;
            while (key.parentElement && key !== root && getComputedStyle(key).display.startsWith("inline")) key = key.parentElement;
            const cur = byEl.get(key);
            if (cur) { cur.text += ` ${text}`; cur.x0 = Math.min(cur.x0, r.left); cur.y0 = Math.min(cur.y0, r.top); cur.x1 = Math.max(cur.x1, r.right); cur.y1 = Math.max(cur.y1, r.bottom); }
            else byEl.set(key, { text, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
          }
        }
        const sx = rb.width ? root.offsetWidth / rb.width : 1;
        for (const [el, b] of byEl) {
          const textOnly = b.text.replace(/\s+/g, " ").trim();
          const H = root.offsetHeight;
          let pill = false;
          for (let e: Element | null = el, i = 0; e && e !== root && i < 3; e = e.parentElement, i++) {
            const cs = getComputedStyle(e);
            const r = e.getBoundingClientRect();
            const filled = alpha(cs.backgroundColor) > 0.3 || (cs.backgroundImage !== "none" && !cs.backgroundImage.includes("url(")) || (parseFloat(cs.borderTopWidth) >= 2 && cs.borderTopStyle !== "none" && parseFloat(cs.borderLeftWidth) >= 2);
            const radius = parseFloat(cs.borderTopLeftRadius) || 0;
            if (filled && r.height > 0 && r.height * sx < H * 0.16 && r.width < rb.width * 0.95 && radius >= r.height * 0.3 && textOnly.length <= 48) { pill = true; break; }
          }
          out.push({ text: textOnly, x: (b.x0 - rb.left) * sx, y: (b.y0 - rb.top) * sx, w: (b.x1 - b.x0) * sx, h: (b.y1 - b.y0) * sx, pill });
        }
        return out;
      }, t);
      for (const b of got) boxes.push({ t, ...b });
    }
    return { width, height, duration, boxes };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Inspect + judge. Never throws: an inspector failure is "not checked", not a failed ad. */
export async function checkSafeZones(dir: string, ratio: Ratio, opts: { executablePath?: string; signal?: AbortSignal } = {}): Promise<SafeZoneReport> {
  try {
    const r = await inspectComposition(dir, opts);
    if (!r || !r.boxes.length) return { ok: true, checked: false, issues: [] };
    const issues = safeZoneIssues(r.boxes, ratio, r.width, r.height);
    return { ok: issues.length === 0, checked: true, issues };
  } catch (e) {
    return { ok: true, checked: false, issues: [`inspector error: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`] };
  }
}

/** QC check from the render meta (visualBrief.render.safeZone); null when the render recorded none. */
export function safeZoneCheck(visualBrief: unknown): { name: string; pass: boolean; detail?: string } | null {
  const z = (visualBrief as { render?: { safeZone?: { ok?: unknown; checked?: unknown; issues?: unknown } } } | null)?.render?.safeZone;
  if (!z || z.checked !== true) return null;
  const issues = Array.isArray(z.issues) ? z.issues.filter((x): x is string => typeof x === "string") : [];
  return { name: "motion_safe_zone", pass: z.ok === true, ...(issues.length ? { detail: issues.slice(0, 6).join(" | ") } : {}) };
}

/** Vision prompt for a video's end-card frame: Reels placement + fake-UI rules. */
export const END_CARD_POLICY_SYSTEM =
  "You check the final frame of a 9:16 Reels video ad against Meta placement rules. Fail when any CTA, website URL or key text sits in the bottom 35% or top 14% of the frame (covered by Reels UI), or when the CTA is drawn as a button/pill/rounded box or any fake UI (play button, notification, checkbox, cursor). Pass when the CTA is plain text inside the safe band.";
