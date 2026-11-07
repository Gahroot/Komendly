// Collect the largest real images of a site (img, srcset, og:image, CSS background-image) for previews.
// Usage: npx tsx scripts/crawl-site-images.ts <url> [outDir]
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const url = process.argv[2] ?? "";
const domain = new URL(url).hostname.replace(/^www\./, "");
const out = process.argv[3] ?? `/Users/groot/.ezcoder/goals/website2ads/render-preview/sites/${domain}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => undefined);
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, "screenshot-desktop.jpg"), type: "jpeg", quality: 90 });
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const m = await ctx.newPage();
  await m.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => undefined);
  await m.waitForTimeout(1500);
  await m.screenshot({ path: join(out, "screenshot-mobile.jpg"), type: "jpeg", quality: 90 });
  await ctx.close();
}
for (let y = 0; y < 8; y++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(400); }
const found = await page.evaluate(() => {
  const urls = new Set<string>();
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
  if (og) urls.add(new URL(og, location.href).href);
  for (const img of [...document.images]) {
    const best = img.currentSrc || img.src;
    if (best && img.naturalWidth >= 400) urls.add(best);
  }
  for (const el of [...document.querySelectorAll<HTMLElement>("*")]) {
    const bg = getComputedStyle(el).backgroundImage;
    for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) if (m[1] && !m[1].startsWith("data:")) urls.add(new URL(m[1], location.href).href);
  }
  return { urls: [...urls], title: document.title, text: document.body.innerText.slice(0, 6000) };
});
const kept: Array<{ file: string; src: string; width: number; height: number; alpha: boolean }> = [];
let i = 0;
for (const src of found.urls) {
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height || meta.width < 500 || meta.format === "svg") continue;
    const file = `img-${String(i++).padStart(2, "0")}.${meta.hasAlpha ? "png" : "jpg"}`;
    const img = sharp(buf).rotate();
    await writeFile(join(out, file), meta.hasAlpha ? await img.png().toBuffer() : await img.jpeg({ quality: 92 }).toBuffer());
    kept.push({ file, src, width: meta.width, height: meta.height, alpha: !!meta.hasAlpha });
  } catch { /* skip */ }
}
kept.sort((a, b) => b.width * b.height - a.width * a.height);
await writeFile(join(out, "images.json"), JSON.stringify({ url, title: found.title, images: kept }, null, 1));
await writeFile(join(out, "page-text.txt"), found.text);
await browser.close();
console.log(domain, kept.length, "images");
