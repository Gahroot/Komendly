// Import Meta Ad Library advertisers (businesses already running Meta ads) into KlyPlace (source "adlib",
// release "adlib-<YYYY-MM-DD>"); the finder hands them out before every other source (src/adlib.ts).
//   set -a; . ../.env.local; set +a; npx tsx scripts/import-adlib.ts [--dir /path/to/adlib] [--dry]
// Reads every <dir>/*.jsonl (default ~/.ezcoder/goals/paying-custys/adlib; one advertiser per line; a half-written last
// line of a growing file is skipped), maps niche/state, drops rows without an own-site domain or with a directory /
// platform one (isExcludedDomain), keeps one row per domain (most active ads), skips domains already in KlyPlace or
// OutboundLead, then inserts new ids only (createMany skipDuplicates). --dry still reads the DB (read-only) to report
// what would be inserted, but writes nothing; without DATABASE_URL it skips the DB check.
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { toAdlibPlace, type AdlibRow } from "../src/adlib";
import { dedupeByDomain } from "../src/places";
import { LEAD_SIGNAL_EVENT } from "../src/adlib";
import { detectAdlibSignals, type AdlibSignalRow, type LeadSignal } from "../src/signals";

const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dry = process.argv.includes("--dry");
const dir = arg("--dir") ?? join(homedir(), ".ezcoder/goals/paying-custys/adlib");
const release = `adlib-${new Date().toISOString().slice(0, 10)}`;

const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
type Place = Exclude<ReturnType<typeof toAdlibPlace>, { skip: unknown }>;
const mapped: Place[] = [];
const signalsByDomain = new Map<string, LeadSignal[]>();
const skipped: Record<string, number> = {};
let lines = 0;
for (const f of files) {
  for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    lines++;
    let r: AdlibRow;
    try {
      r = JSON.parse(line) as AdlibRow;
    } catch {
      skipped.bad_json = (skipped.bad_json ?? 0) + 1;
      continue;
    }
    const p = toAdlibPlace(r, release);
    if ("skip" in p) skipped[p.skip] = (skipped[p.skip] ?? 0) + 1;
    else {
      mapped.push(p);
      const s = detectAdlibSignals(r as AdlibSignalRow, new Date());
      if (s.length) signalsByDomain.set(p.domain, s);
    }
  }
}
let places = dedupeByDomain(mapped) as Place[];
console.log(JSON.stringify({ dir, files: files.length, lines, mapped: mapped.length, uniqueDomains: places.length, skipped }));

if (!process.env.DATABASE_URL) {
  if (!dry) throw new Error("DATABASE_URL is not set");
  console.log(JSON.stringify({ note: "no DATABASE_URL: skipped the already-known-domain check", wouldInsert: places.length }));
} else {
  const db = (await import("../src/db")).createDb();
  const inPlaces = new Set<string>();
  const inLeads = new Set<string>();
  for (let i = 0; i < places.length; i += 5000) {
    const domains = places.slice(i, i + 5000).map((p) => p.domain);
    for (const g of await db.klyPlace.findMany({ where: { domain: { in: domains } }, select: { domain: true } })) inPlaces.add(g.domain);
    for (const g of await db.outboundLead.findMany({ where: { domain: { in: domains } }, select: { domain: true } })) inLeads.add(g.domain);
  }
  // Known advertisers already imported from Overture/fsq and not handed out yet: retag them 'adlib' so they get priority
  // (only unused rows, never ones already turned into leads). Their own location/niche data is kept.
  const retag = places.filter((p) => inPlaces.has(p.domain) && !inLeads.has(p.domain)).map((p) => p.domain);
  places = places.filter((p) => !inPlaces.has(p.domain) && !inLeads.has(p.domain));
  const perNiche: Record<string, number> = {};
  for (const p of places) perNiche[p.niche] = (perNiche[p.niche] ?? 0) + 1;
  const counts = { alreadyInKlyPlace: inPlaces.size, alreadyOutboundLead: [...inLeads].filter((d) => !inPlaces.has(d)).length, perNiche: Object.fromEntries(Object.entries(perNiche).sort((a, b) => b[1] - a[1])) };
  const retagWhere = { domain: { in: retag }, usedAt: null, source: { not: "adlib" } };
  if (dry) console.log(JSON.stringify({ signalDomains: signalsByDomain.size, ...counts, wouldInsert: places.length, wouldRetag: await db.klyPlace.count({ where: retagWhere }) }, null, 1));
  else {
    let inserted = 0;
    for (let i = 0; i < places.length; i += 1000) inserted += (await db.klyPlace.createMany({ data: places.slice(i, i + 1000), skipDuplicates: true })).count;
    const retagged = retag.length ? (await db.klyPlace.updateMany({ where: retagWhere, data: { source: "adlib" } })).count : 0;
    // Intent signals (stale_creative / single_ad / creative_gap) as AdsEvent rows the finder reads back by domain.
    const sigDomains = [...signalsByDomain.keys()];
    const known = new Set((await db.adsEvent.findMany({ where: { name: LEAD_SIGNAL_EVENT }, select: { props: true } })).map((e) => (e.props as { domain?: string }).domain));
    const fresh = sigDomains.filter((d) => !known.has(d));
    if (fresh.length) await db.adsEvent.createMany({ data: fresh.map((d) => ({ name: LEAD_SIGNAL_EVENT, props: { domain: d, release, signals: signalsByDomain.get(d) } as never })) });
    console.log(JSON.stringify({ ...counts, inserted, retagged, signalEvents: fresh.length }, null, 1));
  }
  await db.$disconnect();
}
