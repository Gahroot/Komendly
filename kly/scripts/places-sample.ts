// Measure the own-site email crawler on a random sample of Overture places (no DB writes).
//   npx tsx scripts/places-sample.ts <extracted.parquet> [n=100] [concurrency=12]
import { DuckDBInstance } from "@duckdb/node-api";
import { defaultHasMx, findOwnSiteEmail, pool } from "../src/finder";
import { categoryToNiche, OVERTURE_CATEGORIES, toKlyPlace, type OverturePlaceRow } from "../src/places";
import { METROS } from "../src/targets";

const [file, nArg, cArg] = process.argv.slice(2);
if (!file) throw new Error("usage: places-sample.ts <parquet> [n] [concurrency]");
const n = Number(nArg ?? 100);
const cats = [...new Set(Object.values(OVERTURE_CATEGORIES).flat())];
const c = await (await DuckDBInstance.create(":memory:")).connect();
const metroKeys = METROS.map((m) => { const [city, st] = m.split(", "); return `'${(city ?? "").toLowerCase().replace(/'/g, "''")}|${st}'`; });
const inMetros = (await c.runAndReadAll(`SELECT count(DISTINCT websites[1]) n FROM read_parquet('${file}') WHERE category IN (${cats.map((x) => `'${x}'`).join(",")}) AND lower(city) || '|' || state IN (${metroKeys.join(",")})`)).getRowObjectsJson();
const raw = (await c.runAndReadAll(`SELECT * FROM (SELECT * FROM read_parquet('${file}') WHERE category IN (${cats.map((x) => `'${x}'`).join(",")})) USING SAMPLE reservoir(${n * 2} ROWS) REPEATABLE (42)`)).getRowObjectsJson() as unknown as OverturePlaceRow[];
const byCat = categoryToNiche();
const places = raw.flatMap((r) => { const p = toKlyPlace({ ...r, confidence: Number(r.confidence), lon: null, lat: null }, byCat, "sample"); return p ? [p] : []; }).slice(0, n);
const t0 = Date.now();
const out = { candidates: places.length, site: 0, email: 0, mxOk: 0, phone: 0 };
await pool(places, Number(cArg ?? 12), async (p) => {
  const f = await findOwnSiteEmail(p.website);
  if (!f) return;
  out.site++;
  if (f.phone ?? p.phone) out.phone++;
  if (!f.email) return;
  out.email++;
  if (await defaultHasMx(f.email.split("@")[1] ?? "").catch(() => true)) out.mxOk++;
});
console.log(JSON.stringify({ inMetrosUniqueSites: inMetros, ...out, ms: Date.now() - t0 }));
