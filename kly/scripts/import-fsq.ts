// Import US businesses WITH their own website from Foursquare OS Places into KlyPlace (source "fsq").
//   set -a; . ../.env.local; set +a; npx tsx scripts/import-fsq.ts [--release 2026-10-15] [--files 3] [--parquet a.parquet,b.parquet] [--dry]
// Data: Apache-2.0, gated on Hugging Face (free account + accept terms, then HF_TOKEN = a read token):
// https://huggingface.co/datasets/foursquare/fsq-os-places. One file (~120 MB of 100) is read at a time with column and
// country pushdown, so memory stays flat and progress is logged per file. Keeps open, recently refreshed places in a Kly
// niche whose own site isn't a directory/platform, one per domain, skips domains already in KlyPlace, keeps the listed
// email when it's on the business's own domain, then inserts new ids only (createMany skipDuplicates).
import { DuckDBInstance } from "@duckdb/node-api";
import { fsqCategoryIds, toFsqPlace, type FsqPlaceRow } from "../src/fsq";
import { dedupeByDomain } from "../src/places";

const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const release = arg("--release") ?? process.env.FSQ_RELEASE ?? "2026-10-15";
const dry = process.argv.includes("--dry");
const maxFiles = Number(arg("--files") ?? Infinity);
const REPO = "foursquare/fsq-os-places";
const token = process.env.HF_TOKEN;

async function remoteFiles(): Promise<string[]> {
  const res = await fetch(`https://huggingface.co/api/datasets/${REPO}/tree/main/release/dt=${release}/places/parquet`, token ? { headers: { authorization: `Bearer ${token}` } } : {});
  if (!res.ok) throw new Error(`HF listing ${res.status}`);
  const list = (await res.json()) as { path: string }[];
  return list.map((f) => f.path).filter((p) => p.endsWith(".parquet")).sort().map((p) => `hf://datasets/${REPO}/${p}`);
}

const files = (arg("--parquet")?.split(",") ?? (await remoteFiles())).slice(0, maxFiles);
if (!arg("--parquet") && !token) throw new Error("HF_TOKEN is required (gated dataset: free HF account + accept the dataset terms)");
const t0 = Date.now();
const duck = await DuckDBInstance.create(":memory:");
const c = await duck.connect();
await c.run("INSTALL httpfs; LOAD httpfs;");
if (token) await c.run(`CREATE SECRET hf (TYPE huggingface, TOKEN '${token.replace(/'/g, "")}')`);
const cats = fsqCategoryIds().map((x) => `'${x}'`).join(",");
type RawRow = Omit<FsqPlaceRow, "category_ids" | "unresolved_flags"> & { category_ids: string | null; unresolved_flags: string | null };
const list = (j: string | null): string[] | null => (j ? (JSON.parse(j) as string[] | null) : null);
const mapped: NonNullable<ReturnType<typeof toFsqPlace>>[] = [];
let rows = 0;
for (const [i, f] of files.entries()) {
  const sql = `SELECT fsq_place_id, name, website, email, tel, locality, region, postcode, country, latitude::DOUBLE AS latitude, longitude::DOUBLE AS longitude,
      CAST(date_closed AS VARCHAR) AS date_closed, CAST(date_refreshed AS VARCHAR) AS date_refreshed,
      to_json(fsq_category_ids)::VARCHAR AS category_ids, to_json(unresolved_flags)::VARCHAR AS unresolved_flags
    FROM read_parquet('${f.replace(/'/g, "")}')
    WHERE country = 'US' AND website IS NOT NULL AND date_closed IS NULL AND len(list_intersect(fsq_category_ids, [${cats}])) > 0`;
  const result = await c.stream(sql);
  const cols = result.columnNames();
  let n = 0;
  for (;;) {
    const chunk = await result.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    for (const r of chunk.getRowObjects(cols) as unknown as RawRow[]) {
      n++;
      const p = toFsqPlace({ ...r, category_ids: list(r.category_ids), unresolved_flags: list(r.unresolved_flags) }, release);
      if (p) mapped.push(p);
    }
  }
  rows += n;
  console.error(`file ${i + 1}/${files.length} rows=${n} kept=${mapped.length} ${Math.round((Date.now() - t0) / 1000)}s`);
}
let places = dedupeByDomain(mapped) as typeof mapped;
const db = dry ? null : (await import("../src/db")).createDb();
let existingDomains = 0;
if (db) {
  // Domains Overture (or an earlier fsq import) already has stay with their existing row.
  const known = new Set<string>();
  for (let i = 0; i < places.length; i += 5000) {
    const got = await db.klyPlace.findMany({ where: { domain: { in: places.slice(i, i + 5000).map((p) => p.domain) } }, select: { domain: true } });
    for (const g of got) known.add(g.domain);
  }
  existingDomains = known.size;
  places = places.filter((p) => !known.has(p.domain));
}
const perNiche: Record<string, { places: number; withEmail: number }> = {};
for (const p of places) {
  const e = (perNiche[p.niche] ??= { places: 0, withEmail: 0 });
  e.places++;
  if (p.email) e.withEmail++;
}
console.log(JSON.stringify({
  release, files: files.length, rows, kept: mapped.length, uniqueDomains: places.length + existingDomains, existingDomains, new: places.length,
  withEmail: places.filter((p) => p.email).length, readMs: Date.now() - t0,
  perNiche: Object.fromEntries(Object.entries(perNiche).sort((a, b) => b[1].places - a[1].places)),
}, null, 1));

if (db) {
  let inserted = 0;
  for (let i = 0; i < places.length; i += 1000) inserted += (await db.klyPlace.createMany({ data: places.slice(i, i + 1000), skipDuplicates: true })).count;
  console.log(JSON.stringify({ inserted, totalMs: Date.now() - t0 }));
  await db.$disconnect();
}
