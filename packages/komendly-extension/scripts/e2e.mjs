// Loads build/ unpacked in a real Chromium and checks the button on the Ad Library.
// Usage: npm run build && node scripts/e2e.mjs [--fixture]   (default: live page, falls back to the saved fixture)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { chromiumPath } from "./chromium.mjs";

const root = new URL("..", import.meta.url).pathname;
const ext = join(root, "build");
const out = join(root, "e2e-out");
const profile = join(out, "profile");
rmSync(profile, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const LIVE = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=plumber&search_type=keyword_unordered&media_type=all";
const forceFixture = process.argv.includes("--fixture");

// Unpacked extension id = first 32 hex chars of sha256(absolute path), mapped 0-f -> a-p.
const extId = [...createHash("sha256").update(ext).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");

const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: chromiumPath(),
  headless: true,
  viewport: { width: 1280, height: 800 },
  locale: "en-US",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const result = { extId, mode: forceFixture ? "fixture" : "live" };
try {
  // 1. Save a website in the popup (stored in chrome.storage.sync).
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 372, height: 560 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.fill("#site", "joesplumbing.com");
  await popup.click("#site-form button");
  await popup.waitForSelector("#site-status:has-text('Saved')");
  await popup.screenshot({ path: join(out, "popup.png") });
  await popup.close();

  // 2. Ad Library page (live, or the saved fixture served at the real URL).
  const page = await ctx.newPage();
  const useFixture = async () => {
    result.mode = "fixture";
    await page.route("https://www.facebook.com/ads/library/**", (r) => r.fulfill({ contentType: "text/html", body: readFileSync(join(root, "test/fixtures/ad-library-search-live.html"), "utf8") }));
    await page.goto(LIVE);
  };
  if (forceFixture) await useFixture();
  else {
    await page.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60_000 });
    try {
      await page.waitForSelector('[data-komendly="button"]', { timeout: 25_000 });
    } catch {
      console.log("live page showed no ad cards (login wall?) -> fixture");
      await useFixture();
    }
  }
  await page.waitForSelector('[data-komendly="button"]', { timeout: 15_000 });
  await page.waitForTimeout(1500);
  result.buttons = await page.locator('[data-komendly="button"]').count();
  result.libraryIds = await page.evaluate(() => (document.body.innerText.match(/Library ID: \d+/g) || []).length);
  await page.screenshot({ path: join(out, `ad-library-${result.mode}.png`) });

  // 3. Click the first button; komendly.com is stubbed so nothing hits production.
  await ctx.route("https://www.komendly.com/**", (r) => r.fulfill({ contentType: "text/html", body: "<h1>stub</h1>" }));
  const [opened] = await Promise.all([ctx.waitForEvent("page"), page.locator('[data-komendly="button"] button').first().click()]);
  await opened.waitForLoadState("domcontentloaded").catch(() => undefined);
  result.openedUrl = opened.url();
  const q = new URL(result.openedUrl).searchParams;
  const ok = result.buttons > 0 && result.buttons <= result.libraryIds && new URL(result.openedUrl).pathname === "/remix" && q.get("utm_source") === "chrome_ext" && q.get("website") === "https://joesplumbing.com/" && /ads\/library\/\?id=\d+/.test(q.get("ad_url") ?? "");
  result.ok = ok;
} finally {
  writeFileSync(join(out, "e2e-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await ctx.close();
}
if (!result.ok) process.exit(1);
