import { placesIn } from "../src/finder";
import { createSourceRuntime } from "../src/sources";
const rt = createSourceRuntime();
const combos: [string,string][] = [["roofers","Houston, TX"],["plumbers","Denver, CO"],["electricians","Seattle, WA"],["plumbers","Chicago, IL"],["roofers","Dallas, TX"],["electricians","Phoenix, AZ"],["plumbers","Boston, MA"]];
const seen = new Set<string>(); const out: string[] = [];
for (const [n,c] of combos) {
  try { for (const p of await placesIn(n,c,undefined,undefined,rt)) { const h = new URL(p.website).hostname.replace(/^www\./,""); if (!seen.has(h)) { seen.add(h); out.push(p.website); } } } catch (e) { console.error(n,c,String(e)); }
  console.error(n,c,out.length); if (out.length >= 150) break;
}
console.log(JSON.stringify(out.slice(0,150)));
