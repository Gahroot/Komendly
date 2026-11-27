// Competitive scan. Usage: npx tsx scripts/competitive-scan.ts [--fetch]
// Without --fetch: regenerates docs/product/competitive.{md,json} from src/lib/product-intel/competitive.ts (no network).
// With --fetch: also fetches each entrant's public pricing/feature page (robots.txt respected, 1 request / 2 s, identified UA)
// into docs/product/competitive-scan.json as RAW CANDIDATE facts (prices seen, keywords). A human reviews them and edits
// competitive.ts: nothing from a scan is auto-scored. Never run in the engine.
import { mkdir, writeFile } from "node:fs/promises";
import { buildCompetitiveData, ENTRANTS, renderCompetitiveMarkdown, validateEntrants } from "../src/lib/product-intel/competitive";

const UA = "KomendlyCompetitiveScan/1.0 (+https://www.komendly.com; contact nolan@komendly.com)";
const today = new Date().toISOString().slice(0, 10);

/** Minimal robots.txt check: the longest matching Allow/Disallow in the `*` group (or ours) wins; no file = allowed. */
export function robotsAllows(robots: string, path: string): boolean {
  let applies = false, best: { len: number; allow: boolean } | null = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") applies = v === "*" || /komendly/i.test(v);
    else if (applies && (k === "allow" || k === "disallow") && v && path.startsWith(v) && (!best || v.length > best.len)) best = { len: v.length, allow: k === "allow" };
  }
  return best ? best.allow : true;
}

async function scanOne(url: string) {
  const u = new URL(url);
  const out: Record<string, unknown> = { url, checked: today };
  try {
    const rob = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
    if (rob.ok && !robotsAllows(await rob.text(), u.pathname)) return { ...out, status: "skipped_by_robots" };
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(20000) });
    const html = (await res.text()).slice(0, 600_000);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ");
    return { ...out, status: res.status, prices: [...new Set(text.match(/\$\s?\d[\d,.]*(?:\s?\/\s?(?:mo|month|yr|year))?/gi) ?? [])].slice(0, 15),
      keywords: ["free trial", "facebook", "instagram", "meta", "publish", "a/b", "optimi", "template"].filter((k) => text.toLowerCase().includes(k)) };
  } catch (e) {
    return { ...out, status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const errs = validateEntrants(ENTRANTS);
  if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
  await mkdir("docs/product", { recursive: true });
  if (process.argv.includes("--fetch")) {
    const results = [];
    for (const e of ENTRANTS) for (const url of e.scanUrls) { results.push({ entrant: e.slug, ...(await scanOne(url)) }); await new Promise((r) => setTimeout(r, 2000)); }
    await writeFile("docs/product/competitive-scan.json", JSON.stringify(results, null, 2) + "\n");
    console.log(`scanned ${results.length} pages -> docs/product/competitive-scan.json (review before editing competitive.ts)`);
  }
  const data = buildCompetitiveData(today);
  await writeFile("docs/product/competitive.json", JSON.stringify(data, null, 2) + "\n");
  await writeFile("docs/product/competitive.md", renderCompetitiveMarkdown(data));
  console.log("wrote docs/product/competitive.{md,json}");
}
if (process.argv[1]?.endsWith("competitive-scan.ts")) void main();
