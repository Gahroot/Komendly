// Import US businesses WITH a website from Overture Maps Places into KlyPlace (source "overture").
//   set -a; . ../.env.local; set +a; npx tsx scripts/import-places.ts [--release 2026-10-21.0] [--parquet file] [--dry]
// Reads the public GeoParquet on S3 with DuckDB (no credentials; ~4 min for the US), maps taxonomy.primary to Kly
// niches, keeps open places (confidence >= 0.5) whose own site isn't a directory/platform, one per domain, then
// inserts new ids only (existing rows and their usedAt are untouched). Run monthly after each Overture release.
import { DuckDBInstance } from "@duckdb/node-api";
import { categoryToNiche, dedupeByDomain, OVERTURE_CATEGORIES, toKlyPlace, type OverturePlaceRow } from "../src/places";

const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const release = arg("--release") ?? process.env.OVERTURE_RELEASE ?? "2026-10-21.0";
const dry = process.argv.includes("--dry");
const src = arg("--parquet") ?? `s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*.parquet`;

const cats = [...new Set(Object.values(OVERTURE_CATEGORIES).flat())].sort();
const t0 = Date.now();
const duck = await DuckDBInstance.create(":memory:");
const c = await duck.connect();
await c.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';");
const local = Boolean(arg("--parquet"));
// --parquet: a pre-extracted file with the output columns below (same shape as this SELECT).
const sql = local
  ? `SELECT id, name, to_json(websites)::VARCHAR AS websites, to_json(phones)::VARCHAR AS phones, city, state, postcode, category, confidence::DOUBLE AS confidence, status, lon::DOUBLE AS lon, lat::DOUBLE AS lat FROM read_parquet('${src}') WHERE category IN (${cats.map((x) => `'${x}'`).join(",")})`
  : `SELECT id, names.primary AS name, to_json(websites)::VARCHAR AS websites, to_json(phones)::VARCHAR AS phones, addresses[1].locality AS city, addresses[1].region AS state, addresses[1].postcode AS postcode,
       taxonomy.primary AS category, confidence::DOUBLE AS confidence, operating_status AS status, ((bbox.xmin+bbox.xmax)/2)::DOUBLE AS lon, ((bbox.ymin+bbox.ymax)/2)::DOUBLE AS lat
     FROM read_parquet('${src}')
     WHERE bbox.xmin BETWEEN -180 AND -60 AND bbox.ymin BETWEEN 15 AND 72 AND addresses[1].country = 'US' AND len(websites) > 0
       AND taxonomy.primary IN (${cats.map((x) => `'${x}'`).join(",")})`;
// Stream in chunks (a full US pull is ~2M matching rows: materialising them all at once doesn't fit Kly's container).
// Lists come back as JSON text and numbers as DOUBLE (cast in SQL), so each chunk's rows are plain JS values.
type RawRow = Omit<OverturePlaceRow, "websites" | "phones"> & { websites: string | null; phones: string | null };
const list = (j: string | null): string[] | null => (j ? (JSON.parse(j) as string[] | null) : null);
const byCategory = categoryToNiche();
const mapped: ReturnType<typeof toKlyPlace>[] = [];
let rawCount = 0;
const result = await c.stream(sql);
const cols = result.columnNames();
for (;;) {
  const chunk = await result.fetchChunk();
  if (!chunk || chunk.rowCount === 0) break;
  for (const r of chunk.getRowObjects(cols) as unknown as RawRow[]) {
    rawCount++;
    const p = toKlyPlace({ ...r, websites: list(r.websites), phones: list(r.phones) }, byCategory, release);
    if (p) mapped.push(p);
  }
}
const raw = { length: rawCount };
const places = dedupeByDomain(mapped.filter((p): p is NonNullable<typeof p> => p !== null));
const perNiche: Record<string, number> = {};
for (const p of places) perNiche[p.niche] = (perNiche[p.niche] ?? 0) + 1;
console.log(JSON.stringify({ release, rows: raw.length, kept: mapped.length, uniqueDomains: places.length, readMs: Date.now() - t0, perNiche: Object.fromEntries(Object.entries(perNiche).sort((a, b) => b[1] - a[1])) }, null, 1));

if (!dry) {
  const db = (await import("../src/db")).createDb();
  let inserted = 0;
  for (let i = 0; i < places.length; i += 1000) {
    const r = await db.klyPlace.createMany({ data: places.slice(i, i + 1000), skipDuplicates: true });
    inserted += r.count;
  }
  console.log(JSON.stringify({ inserted, totalMs: Date.now() - t0 }));
  await db.$disconnect();
}
