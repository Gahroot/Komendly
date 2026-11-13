// Live smoke test of every lead source (read-only: no DB, no emails). For one niche/city it prints, per source, the
// candidate count, how many have a phone (source tag/listing or the business's own site), and 5 samples.
//   CODEX_AUTH_FILE=$HOME/.ezcoder/auth.json npx tsx scripts/source-smoke.ts [--niche roofers] [--city "Denver, CO"]
import { createKlyAI } from "../src/ai";
import { findOwnSiteEmail, osmSource, pool } from "../src/finder";
import { codexSearchSource, createSourceRuntime, searchSource, type Candidate, type LeadSource } from "../src/sources";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

async function main(): Promise<void> {
  const niche = arg("niche", "roofers");
  const city = arg("city", "Denver, CO");
  const rt = createSourceRuntime();
  const ai = createKlyAI(undefined, process.env);
  let costMicros = 0;
  for (const src of [osmSource, searchSource, codexSearchSource] as LeadSource[]) {
    const t0 = Date.now();
    let cands: Candidate[] = [];
    try {
      cands = await src.find(niche, city, { rt, ai, onBlock: (e, why) => console.log(`  [${src.id}] BLOCKED ${e}: ${why}`), onCost: (m) => (costMicros += m) });
    } catch (e) {
      console.log(`${src.id}: FAILED ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (src.id === "codex_search" && !ai) console.log("codex_search: no Codex login (set CODEX_AUTH_FILE)");
    const rows: Array<{ c: Candidate; phone: string | null; via: string; email: boolean }> = [];
    await pool(cands, 8, async (c) => {
      const site = await findOwnSiteEmail(c.website);
      const phone = (c.source === "osm" ? c.phone ?? site?.phone : site?.phone ?? c.phone) ?? null;
      const via = !phone ? "-" : site?.phone && phone === site.phone ? "site" : c.phoneSource ?? c.source;
      rows.push({ c, phone, via, email: Boolean(site?.email) });
    });
    rows.sort((a, b) => a.c.name.localeCompare(b.c.name));
    const withPhone = rows.filter((r) => r.phone).length;
    const reachable = rows.filter((r) => r.phone || r.email).length;
    console.log(`\n${src.id}: ${cands.length} candidates, ${withPhone} with phone, ${rows.filter((r) => r.email).length} with email, ${reachable} reachable (${Math.round((Date.now() - t0) / 1000)}s)`);
    for (const r of rows.slice(0, 5)) console.log(`  - ${r.c.name} | ${r.c.website} | ${r.phone ?? "no phone"} (${r.via})`);
  }
  console.log(`\nCodex est. cost: $${(costMicros / 1e6).toFixed(4)}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
