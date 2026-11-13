// Import businesses with an email on their own domain from US government open-data licence lists (src/gov.ts) into
// KlyPlace (source "gov:<dataset>", release "<socrata id>@<YYYY-MM-DD>").
//   set -a; . ../.env.local; set +a; npx tsx scripts/import-gov.ts [--dataset gov:nyc-dob,gov:gnv] [--dry]
// Pulls each Socrata dataset via its public SODA API (no key needed; pages of 50k rows, active licences with an email
// only), maps licence types to Kly niches, keeps one row per email domain, skips domains already in KlyPlace (Overture /
// FSQ / earlier runs), then inserts new ids only (createMany skipDuplicates). --dry prints counts and writes nothing.
import { GOV_DATASETS, toGovPlace } from "../src/gov";
import { dedupeByDomain } from "../src/places";

const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dry = process.argv.includes("--dry");
const only = arg("--dataset")?.split(",");
const snapshot = new Date().toISOString().slice(0, 10);
const PAGE = 50_000;

type Place = NonNullable<ReturnType<typeof toGovPlace>>;
const all: Place[] = [];
for (const ds of GOV_DATASETS.filter((d) => !only || only.includes(d.source))) {
  let rows = 0;
  const mapped: Place[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `https://${ds.host}/resource/${ds.resource}.json?${new URLSearchParams({ $where: ds.where, $order: ":id", $limit: String(PAGE), $offset: String(offset) })}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`${ds.source} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = (await res.json()) as Record<string, unknown>[];
    rows += page.length;
    for (const r of page) {
      const p = toGovPlace(ds, ds.map(r), snapshot);
      if (p) mapped.push(p);
    }
    if (page.length < PAGE) break;
  }
  const uniq = dedupeByDomain(mapped);
  console.log(JSON.stringify({ source: ds.source, dataset: `${ds.host}/${ds.resource}`, rowsWithEmail: rows, businessEmail: mapped.length, pctBusinessEmail: rows ? Math.round((mapped.length / rows) * 100) : 0, uniqueDomains: uniq.length }));
  all.push(...mapped);
}
let places = dedupeByDomain(all);
const perNiche: Record<string, number> = {};
for (const p of places) perNiche[p.niche] = (perNiche[p.niche] ?? 0) + 1;
console.log(JSON.stringify({ total: places.length, perNiche: Object.fromEntries(Object.entries(perNiche).sort((a, b) => b[1] - a[1])) }, null, 1));

if (!dry) {
  const db = (await import("../src/db")).createDb();
  const known = new Set<string>();
  for (let i = 0; i < places.length; i += 5000) {
    const got = await db.klyPlace.findMany({ where: { domain: { in: places.slice(i, i + 5000).map((p) => p.domain) } }, select: { domain: true } });
    for (const g of got) known.add(g.domain);
  }
  places = places.filter((p) => !known.has(p.domain));
  let inserted = 0;
  for (let i = 0; i < places.length; i += 1000) inserted += (await db.klyPlace.createMany({ data: places.slice(i, i + 1000), skipDuplicates: true })).count;
  console.log(JSON.stringify({ alreadyKnownDomains: known.size, inserted }));
  await db.$disconnect();
}
