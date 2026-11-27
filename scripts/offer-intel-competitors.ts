// Regenerates src/lib/offer-intel/competitors.json from the verified competitor data used by /compare and /alternatives
// (src/lib/growth/organic/compare.ts). To REFRESH the facts themselves: re-read each vendor's public page (web_fetch or
// a browser), edit compare.ts (bump VERIFIED_ON, keep the source URL per fact), then run this script. The engine never
// fetches competitor pages. Usage: npx tsx scripts/offer-intel-competitors.ts
import { writeFileSync } from "node:fs";
import { COMPETITORS, VERIFIED_ON } from "../src/lib/growth/organic/compare";

const out = { verifiedOn: VERIFIED_ON, competitors: COMPETITORS.map((c) => ({ slug: c.slug, name: c.name, site: c.site, summary: c.summary, facts: c.facts.map((f) => f.text), sources: [...new Set(c.facts.map((f) => f.source))] })) };
writeFileSync("src/lib/offer-intel/competitors.json", JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${out.competitors.length} competitors (verified ${VERIFIED_ON})`);
