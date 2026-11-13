// Dev check: capture website components for a few public sites (no DB, no storage). npx tsx scripts/site-components-smoke.mts <url>...
import { chromium } from "playwright";
import { captureSiteComponents } from "../src/studio/site-components";
import { guardRoute } from "../src/jobs/extract/crawl";
(async () => {
  const browser = await chromium.launch();
  for (const url of process.argv.slice(2)) {
    const outDir = `/Users/groot/.ezcoder/goals/ezmotionkom/harness/site-components/${new URL(url).hostname}`;
    const t = Date.now();
    const comps = await captureSiteComponents({ browser, url, outDir, guard: guardRoute, log: (m, d) => console.log(m, d) });
    console.log(url, `${Date.now() - t}ms`, comps.map((c) => `${c.file} ${c.label.slice(0, 40)}`));
  }
  await browser.close();
})();
