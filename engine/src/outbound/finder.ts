// Outbound lead finder: local businesses of one niche in a list of cities from OpenStreetMap (Nominatim geocode +
// Overpass), each with a website; then a PUBLIC business email found on that business's OWN site (home page,
// then up to 3 contact/about pages). Never guesses addresses; skips leads without one.
import { randomBytes } from "node:crypto";
import { contactLinks, domainOfUrl, extractOwnEmails, isSuppressed, timezoneFor, WEBMAIL } from "../../../src/lib/ads/outbound/policy";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import { safeFetch } from "../net/ssrf";

const OSM_UA = "Komendly-lead-finder/1.0 (+https://www.komendly.com)";

/** OSM tags for common niches; anything else falls back to a name match. */
const NICHE_TAGS: Record<string, string[]> = {
  roofer: ['nwr["craft"="roofer"]', 'nwr["shop"="roofing"]'],
  plumber: ['nwr["craft"="plumber"]'],
  electrician: ['nwr["craft"="electrician"]'],
  hvac: ['nwr["craft"="hvac"]', 'nwr["shop"="hvac"]'],
  landscaper: ['nwr["craft"="gardener"]', 'nwr["landscaping"]'],
  painter: ['nwr["craft"="painter"]'],
  dentist: ['nwr["amenity"="dentist"]'],
  hairdresser: ['nwr["shop"="hairdresser"]'],
  bakery: ['nwr["shop"="bakery"]'],
  gym: ['nwr["leisure"="fitness_centre"]'],
  cafe: ['nwr["amenity"="cafe"]'],
  restaurant: ['nwr["amenity"="restaurant"]'],
};

export function nicheSelectors(niche: string): string[] {
  const key = niche.trim().toLowerCase().replace(/(ing|s)$/, "").replace(/ /g, "");
  const known = NICHE_TAGS[key] ?? NICHE_TAGS[key.replace(/e$/, "")];
  if (known) return known;
  const safe = niche.replace(/[^a-z0-9 ]/gi, "").trim();
  return [`nwr["name"~"${safe}",i]["website"]`];
}

export interface Place {
  name: string;
  website: string;
  city: string;
  state: string | null;
  lon: number | null;
}

interface FetchJson {
  (url: string, init: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }): Promise<unknown>;
}

const defaultFetchJson: FetchJson = async (url, init) => {
  const res = await fetch(url, { ...init, headers: { "User-Agent": OSM_UA, ...init.headers } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res.json();
};

/** Bounding box of a city via Nominatim ("Denver, CO"). */
export async function geocodeCity(city: string, fetchJson: FetchJson = defaultFetchJson, signal?: AbortSignal): Promise<{ bbox: [number, number, number, number]; state: string | null } | null> {
  const q = new URLSearchParams({ q: city, format: "json", limit: "1", countrycodes: "us", addressdetails: "1" });
  const rows = (await fetchJson(`https://nominatim.openstreetmap.org/search?${q.toString()}`, { signal })) as Array<{ boundingbox?: string[]; address?: { "ISO3166-2-lvl4"?: string } }>;
  const r = rows[0];
  const bb = r?.boundingbox?.map(Number);
  if (!r || !bb || bb.length !== 4 || bb.some((n) => !Number.isFinite(n))) return null;
  const [s, n, w, e] = bb as [number, number, number, number];
  const iso = r.address?.["ISO3166-2-lvl4"];
  return { bbox: [s, w, n, e], state: iso?.startsWith("US-") ? iso.slice(3) : null };
}

export async function placesIn(niche: string, city: string, fetchJson: FetchJson = defaultFetchJson, signal?: AbortSignal): Promise<Place[]> {
  const geo = await geocodeCity(city, fetchJson, signal);
  if (!geo) return [];
  const bbox = geo.bbox.join(",");
  const q = `[out:json][timeout:25];(${nicheSelectors(niche).map((s) => `${s}(${bbox});`).join("")});out tags center 300;`;
  const data = (await fetchJson("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: q }).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal })) as {
    elements?: Array<{ tags?: Record<string, string>; lon?: number; center?: { lon: number } }>;
  };
  const cityName = city.split(",")[0]?.trim() ?? city;
  const out: Place[] = [];
  for (const e of data.elements ?? []) {
    const t = e.tags ?? {};
    const website = t.website ?? t["contact:website"] ?? t.url;
    if (!t.name || !website) continue;
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    out.push({ name: t.name.slice(0, 80), website: url, city: t["addr:city"] ?? cityName, state: t["addr:state"] ?? geo.state, lon: e.lon ?? e.center?.lon ?? null });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type PageFetcher = (url: string, signal?: AbortSignal) => Promise<{ url: string; html: string } | null>;

const defaultPageFetcher: PageFetcher = async (url, signal) => {
  try {
    const r = await safeFetch(url, { maxBytes: 3 * 1024 * 1024, timeoutMs: 15_000, signal });
    if (r.status >= 400 || !/html|text/i.test(r.contentType)) return null;
    return { url: r.url, html: r.body.toString("utf8") };
  } catch {
    return null;
  }
};

/** First public address on the business's own domain: home page, then contact/about pages. Null when none. */
export async function findOwnSiteEmail(website: string, fetchPage: PageFetcher = defaultPageFetcher, signal?: AbortSignal): Promise<{ email: string; page: string; finalUrl: string } | null> {
  const home = await fetchPage(website, signal);
  if (!home) return null;
  const domain = domainOfUrl(home.url);
  // Redirected to another business (e.g. a franchise / directory): not their own site.
  if (!domain || domain !== domainOfUrl(website)) return null;
  const first = extractOwnEmails(home.html, domain)[0];
  if (first) return { email: first, page: home.url, finalUrl: home.url };
  for (const link of contactLinks(home.html, home.url, 3)) {
    const p = await fetchPage(link, signal);
    if (!p || domainOfUrl(p.url) !== domain) continue;
    const e = extractOwnEmails(p.html, domain)[0];
    if (e) return { email: e, page: p.url, finalUrl: home.url };
  }
  return null;
}

/** Domains we must never cold-email: suppression list, existing leads, Komendly users' own business domains. */
export async function blockedDomains(db: Db): Promise<{ suppressed: Set<string>; taken: Set<string> }> {
  const [sup, leads, users, brands] = await Promise.all([
    db.outboundSuppression.findMany({ select: { value: true } }),
    db.outboundLead.findMany({ select: { domain: true } }),
    db.user.findMany({ select: { email: true } }),
    db.brandProfile.findMany({ where: { runs: { some: { kind: { not: "gift" } } } }, select: { domain: true } }),
  ]);
  const taken = new Set<string>(leads.map((l) => l.domain));
  for (const u of users) {
    const d = u.email.split("@")[1]?.toLowerCase();
    if (d && !WEBMAIL.has(d)) taken.add(domainOfUrl(`https://${d}`) ?? d);
  }
  for (const b of brands) taken.add(domainOfUrl(`https://${b.domain}`) ?? b.domain);
  return { suppressed: new Set(sup.map((s) => s.value.toLowerCase())), taken };
}

export interface FinderDeps {
  db: Db;
  fetchJson?: FetchJson;
  fetchPage?: PageFetcher;
  signal?: AbortSignal;
}

export interface FinderResult {
  created: string[];
  skipped: Record<string, number>;
}

export const newLeadToken = (): string => randomBytes(16).toString("base64url");

/** Find up to `count` new leads for one OutboundRun and insert them as status "found". */
export async function findLeads(deps: FinderDeps, req: { runId: string | null; niche: string; cities: string[]; count: number }): Promise<FinderResult> {
  const { db } = deps;
  const { suppressed, taken } = await blockedDomains(db);
  const skipped: Record<string, number> = {};
  const skip = (k: string) => (skipped[k] = (skipped[k] ?? 0) + 1);
  const created: string[] = [];
  for (const city of req.cities) {
    if (created.length >= req.count) break;
    let places: Place[];
    try {
      places = await placesIn(req.niche, city, deps.fetchJson, deps.signal);
    } catch (e) {
      log("warn", "outbound: place search failed", { city, error: errMsg(e) });
      skip("search_failed");
      continue;
    }
    for (const p of places) {
      if (created.length >= req.count) break;
      const domain = domainOfUrl(p.website);
      if (!domain) { skip("bad_url"); continue; }
      if (taken.has(domain)) { skip("existing_lead_or_user"); continue; }
      if (suppressed.has(domain)) { skip("suppressed"); continue; }
      taken.add(domain);
      const found = await findOwnSiteEmail(p.website, deps.fetchPage, deps.signal);
      if (!found) { skip("no_public_email"); continue; }
      if (isSuppressed(found.email, suppressed)) { skip("suppressed"); continue; }
      const lead = await db.outboundLead.create({
        data: {
          runId: req.runId,
          businessName: p.name,
          website: found.finalUrl,
          domain,
          niche: req.niche,
          city: p.city,
          region: p.state,
          timezone: timezoneFor(p.state, p.lon),
          email: found.email,
          emailFoundOn: found.page,
          source: "osm",
          claimToken: newLeadToken(),
          unsubToken: newLeadToken(),
        },
        select: { id: true },
      }).catch(() => null); // unique domain race
      if (lead) created.push(lead.id);
    }
  }
  return { created, skipped };
}
