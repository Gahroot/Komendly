// Dev-only: save a live Meta Ad Library results page as a test fixture (test/fixtures/<name>.html).
// Usage: node scripts/capture-fixture.mjs "<ad library url>" <name>
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { chromiumPath } from "./chromium.mjs";

const [url = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=plumber&search_type=keyword_unordered&media_type=all", name = "live"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "en-US", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(10_000);
for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 1500); await page.waitForTimeout(2500); }
const html = await page.content();
writeFileSync(`e2e-out/${name}.raw.html`, html);
await page.screenshot({ path: `e2e-out/${name}.png` });
console.log(`saved ${html.length} chars, "Library ID" x${(html.match(/Library ID/g) || []).length}`);
await browser.close();
