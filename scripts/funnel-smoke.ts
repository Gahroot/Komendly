// HTTP-level synthetic funnel check (no browser). Usage: npx tsx scripts/funnel-smoke.ts [baseUrl=https://www.komendly.com]
// Exit 1 if any check fails. Needs no env. Logic lives in src/lib/funnel-checks.ts (shared with /api/cron/funnel-monitor).
import { checkOfferApi, checkPage, checkSitemap, PAGE_SPECS, type CheckResult, type PageSpec } from "../src/lib/funnel-checks";

// Additive: newer public pages (creative hubs, SEO hubs). Must answer 200 (or a redirect), never a 5xx.
const EXTRA_PAGES: PageSpec[] = ["/makeover", "/nominate", "/showcase", "/reviews-to-ads", "/100-businesses", "/ad-copy-library", "/ad-inspiration", "/rescue", "/launch-gifts", "/giveaways", "/nonprofits", "/seasonal", "/vote", "/challenge"].map((path) => ({ path, statuses: [200, 307, 308] }));

const base = (process.argv[2] ?? "https://www.komendly.com").replace(/\/$/, "");

async function get(path: string) {
  const r = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "user-agent": "komendly-funnel-smoke" } });
  return { status: r.status, body: await r.text(), location: r.headers.get("location") };
}

async function main() {
  const results: CheckResult[] = [];
  for (const spec of [...PAGE_SPECS, ...EXTRA_PAGES]) {
    try { results.push(...checkPage(spec, await get(spec.path))); } catch (e) { results.push(...checkPage(spec, { error: String(e) })); }
  }
  try { const s = await get("/sitemap.xml"); results.push(s.status === 200 ? checkSitemap(s.body, base) : { name: "sitemap.xml", ok: false, detail: `status ${s.status}` }); } catch (e) { results.push({ name: "sitemap.xml", ok: false, detail: String(e) }); }
  try { const o = await get("/api/ads-billing/offer"); results.push(checkOfferApi(o.status, o.body)); } catch (e) { results.push({ name: "api /api/ads-billing/offer", ok: false, detail: String(e) }); }
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail}`);
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} passed against ${base}`);
  process.exit(bad ? 1 : 0);
}
main();
