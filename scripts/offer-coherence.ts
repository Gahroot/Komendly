// Page-coherence check (CRO): flags prices / guarantee days / spots / free-ad counts in our own copy that contradict
// public-offer.ts and billing-config.ts. Usage: npx tsx scripts/offer-coherence.ts [--live https://www.komendly.com]
// Reads source files (no env needed). With --live it also fetches the rendered pages. Exit code 1 when issues exist.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkCoherence, htmlToText, type PageText } from "../src/lib/offer-intel/coherence";

const FILES = ["src/app/page.tsx", "src/app/free-ads/page.tsx", "src/app/pricing/page.tsx", "src/app/ads/team/page.tsx", "src/components/billing/team-offer.tsx", "src/components/ads/autopilot-offer-card.tsx", "src/components/ads/unlock-upsell-modal.tsx", "src/components/ads/offer-download-modal.tsx", "src/lib/ads/roofer-offer.ts", "src/lib/ads/dream-copy.ts"];
export function lifecycleFiles(root = process.cwd()): string[] {
  const dir = join(root, "src/lib/ads/lifecycle");
  return readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.includes("test")).map((f) => `src/lib/ads/lifecycle/${f}`);
}
async function main() {
  const pages: PageText[] = [...FILES, ...lifecycleFiles()].flatMap((f) => { try { return [{ id: f, text: readFileSync(join(process.cwd(), f), "utf8") }]; } catch { return []; } });
  const live = process.argv.indexOf("--live");
  if (live > 0) {
    const base = (process.argv[live + 1] ?? "https://www.komendly.com").replace(/\/$/, "");
    for (const p of ["/", "/free-ads", "/pricing", "/ads/team"]) {
      try { pages.push({ id: `live:${p}`, text: htmlToText(await (await fetch(base + p)).text()) }); } catch (e) { console.warn("fetch failed", p, e instanceof Error ? e.message : e); }
    }
  }
  const issues = checkCoherence(pages);
  for (const i of issues) console.log(`${i.page}: ${i.kind} found ${i.found}, expected ${i.expected}\n   ...${i.context}...`);
  console.log(`${pages.length} pages checked, ${issues.length} issue(s)`);
  process.exit(issues.length ? 1 : 0);
}
void main();
