// Kly lead finder (moved from the engine): local businesses of one niche in a list of cities from OpenStreetMap (Nominatim geocode +
// Overpass), each with a website; then a PUBLIC business email found on that business's OWN site (home page,
// then up to 3 contact/about pages). Never guesses addresses; skips leads without one.
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { domainOfUrl, isSuppressed, registrableDomain, timezoneFor, WEBMAIL } from "../../src/lib/ads/outbound/policy";
import type { Db } from "./db";
import { candidatePages, extractEmails } from "./emails";
import { errMsg, log } from "./log";
import { safeFetch } from "../../engine/src/net/ssrf";
import { nicheDef } from "./targets";
import { codexSearchSource, createSourceRuntime, polite, searchSource, SOURCE_IDS, type Candidate, type FetchText, type Geo, type LeadSource, type SourceId, type SourceRuntime } from "./sources";
import { addCost, decide, SETTINGS_ID } from "./settings";
import type { KlyAI } from "./ai";
import { overtureSource } from "./places";

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
  const def = nicheDef(niche);
  if (def) return def.osm;
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
  /** US E.164 business phone from the OSM tags (phone / contact:phone), when exactly one valid number is given. */
  phone?: string | null;
}

// ---------------------------------------------------------------------------
// Phones (for the Tribunal voice bridge): US E.164 only; invalid, toll-free, premium or ambiguous numbers are dropped.

const TOLL_FREE = new Set(["800", "822", "833", "844", "855", "866", "877", "880", "881", "882", "883", "884", "885", "886", "887", "888", "889"]);

/** One raw number -> "+1XXXXXXXXXX", or null (non-US, malformed, toll-free, premium, N11, fictional 555-01XX). */
export function normalizeUsPhone(raw: string): string | null {
  const cut = raw.replace(/^tel:/i, "").split(/(?:;|,|\b(?:ext|x)\.?\s*\d)/i)[0] ?? "";
  if (/[a-z]/i.test(cut.replace(/^\s*\+/, ""))) return null; // vanity numbers (1-800-FLOWERS)
  const plus = cut.trim().startsWith("+");
  let d = cut.replace(/\D/g, "");
  if (plus && !d.startsWith("1")) return null; // another country
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  const area = d.slice(0, 3);
  const exch = d.slice(3, 6);
  if (!/^[2-9]/.test(area) || !/^[2-9]/.test(exch)) return null;
  if (/^[2-9]11$/.test(area) || /^[2-9]11$/.test(exch) || area[1] === "9") return null;
  if (TOLL_FREE.has(area) || area === "900" || area === "976") return null;
  if (exch === "555" && d.slice(6, 8) === "01") return null;
  return `+1${d}`;
}

/** Exactly one distinct valid number, else null (none or ambiguous). */
export function singlePhone(raws: readonly string[]): string | null {
  const set = new Set<string>();
  for (const r of raws) {
    const p = normalizeUsPhone(r);
    if (p) set.add(p);
  }
  return set.size === 1 ? [...set][0] ?? null : null;
}

/** OSM phone tags; several numbers in one tag are separated by ";". */
export function osmPhone(tags: Record<string, string>): string | null {
  return singlePhone([tags.phone, tags["contact:phone"]].filter((x): x is string => Boolean(x)).flatMap((t) => t.split(";")));
}

const VISIBLE_PHONE = /(?<![\d-])(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]\d{4}(?![\d-])/g;

/** Business phone on one of its own pages: tel: links first, else visible numbers; one distinct number or null. */
export function extractSitePhone(html: string): string | null {
  const tels = [...html.matchAll(/href\s*=\s*["']\s*tel:([^"']+)["']/gi)].map((m) => decodeURIComponent(m[1] ?? "").trim());
  if (tels.length) return singlePhone(tels);
  const text = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  return singlePhone(text.match(VISIBLE_PHONE) ?? []);
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

/** Public Overpass instances; the main one is often overloaded (502/504), so fall through the mirrors. */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

let overpassStart = 0;

/** POST an Overpass query, trying each endpoint once (rotating the first one so load spreads). */
export async function overpass(query: string, fetchJson: FetchJson = defaultFetchJson, signal?: AbortSignal, endpoints: readonly string[] = OVERPASS_ENDPOINTS): Promise<unknown> {
  const start = overpassStart++ % endpoints.length;
  let last: unknown = null;
  for (let i = 0; i < endpoints.length; i++) {
    const url = endpoints[(start + i) % endpoints.length]!;
    try {
      const timeout = AbortSignal.timeout(45_000);
      return await fetchJson(url, { method: "POST", body: new URLSearchParams({ data: query }).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("all Overpass endpoints failed");
}

/** Nominatim usage policy: max 1 request/s, so every geocode waits its turn; results are cached per runtime. */
export const NOMINATIM_MIN_INTERVAL_MS = 1_100;

export async function cachedGeocode(city: string, rt: SourceRuntime, fetchJson: FetchJson = defaultFetchJson, signal?: AbortSignal): Promise<Geo | null> {
  const key = city.trim().toLowerCase();
  if (rt.geo.has(key)) return rt.geo.get(key) ?? null;
  await polite(rt, "nominatim", NOMINATIM_MIN_INTERVAL_MS, signal);
  const geo = await geocodeCity(city, fetchJson, signal);
  rt.geo.set(key, geo);
  return geo;
}

/** Overpass: one query at a time per runtime, a few seconds apart (public instances are shared). */
export const OVERPASS_MIN_INTERVAL_MS = 3_000;

export async function placesIn(niche: string, city: string, fetchJson: FetchJson = defaultFetchJson, signal?: AbortSignal, rt: SourceRuntime = createSourceRuntime()): Promise<Place[]> {
  const geo = await cachedGeocode(city, rt, fetchJson, signal);
  if (!geo) return [];
  const bbox = geo.bbox.join(",");
  const q = `[out:json][timeout:40];(${nicheSelectors(niche).map((s) => `${s}(${bbox});`).join("")});out tags center 300;`;
  await polite(rt, "overpass", OVERPASS_MIN_INTERVAL_MS, signal);
  const data = (await overpass(q, fetchJson, signal)) as {
    elements?: Array<{ tags?: Record<string, string>; lon?: number; center?: { lon: number } }>;
  };
  const cityName = city.split(",")[0]?.trim() ?? city;
  const out: Place[] = [];
  for (const e of data.elements ?? []) {
    const t = e.tags ?? {};
    const website = t.website ?? t["contact:website"] ?? t.url;
    if (!t.name || !website) continue;
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    out.push({ name: t.name.slice(0, 80), website: url, city: t["addr:city"] ?? cityName, state: t["addr:state"] ?? geo.state, lon: e.lon ?? e.center?.lon ?? null, phone: osmPhone(t) });
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

/** Extra same-site pages checked after the home page (contact, about, team, privacy...). */
export const MAX_EXTRA_PAGES = 5;

/** First public address on the business's own domain: home page, then contact/about/team/privacy pages. Null when none. */
export async function findOwnSiteEmail(website: string, fetchPage: PageFetcher = defaultPageFetcher, signal?: AbortSignal): Promise<{ email: string | null; page: string; finalUrl: string; homeHtml: string; phone: string | null } | null> {
  let home = await fetchPage(website, signal);
  if (!home) {
    // One retry on the www / bare-host twin (a common misconfiguration), never another domain.
    const alt = wwwTwin(website);
    if (alt) home = await fetchPage(alt, signal);
  }
  if (!home) return null;
  const domain = domainOfUrl(home.url);
  // Redirected to another business (e.g. a franchise / directory): not their own site.
  if (!domain || domain !== domainOfUrl(website)) return null;
  // Phone: the first own page (home, then contact/about pages already fetched) with exactly one number.
  let phone = extractSitePhone(home.html);
  const first = extractEmails(home.html, domain)[0];
  if (first) return { email: first, page: home.url, finalUrl: home.url, homeHtml: home.html, phone };
  for (const link of candidatePages(home.html, home.url, MAX_EXTRA_PAGES)) {
    if (signal?.aborted) break;
    const p = await fetchPage(link, signal);
    if (!p || domainOfUrl(p.url) !== domain) continue;
    phone ??= extractSitePhone(p.html);
    const e = extractEmails(p.html, domain)[0];
    if (e) return { email: e, page: p.url, finalUrl: home.url, homeHtml: home.html, phone };
  }
  // No public email: still the business's own site (phone-only leads are kept when voice calling is on).
  return { email: null, page: "", finalUrl: home.url, homeHtml: home.html, phone };
}

function wwwTwin(url: string): string | null {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
    return u.toString();
  } catch {
    return null;
  }
}

/** A source-listed email (e.g. Foursquare) skips the crawl when it is on the business's own domain. */
export function listedEmail(p: Pick<Candidate, "email" | "website">): string | null {
  const e = p.email?.trim().toLowerCase();
  const own = domainOfUrl(p.website);
  if (!e || !own || !/^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/.test(e)) return null;
  return registrableDomain(e.split("@")[1] ?? "") === own && !WEBMAIL.has(e.split("@")[1] ?? "") ? e : null;
}

/** Domains we must never cold-email: suppression list, existing leads, Komendly users' own business domains. */
export async function blockedDomains(db: Db): Promise<{ suppressed: Set<string>; taken: Set<string> }> {
  const [sup, leads, customers] = await Promise.all([
    db.outboundSuppression.findMany({ select: { value: true } }),
    db.outboundLead.findMany({ select: { domain: true } }),
    komendlyCustomers(db),
  ]);
  const taken = new Set<string>(leads.map((l) => l.domain));
  for (const d of customers.domains) taken.add(d);
  return { suppressed: new Set(sup.map((s) => s.value.toLowerCase())), taken };
}

/** Existing Komendly users: their emails and business domains (user email domains + brands with non-gift runs). */
export async function komendlyCustomers(db: Db): Promise<{ emails: Set<string>; domains: Set<string> }> {
  const [users, brands] = await Promise.all([
    db.user.findMany({ select: { email: true } }),
    db.brandProfile.findMany({ where: { runs: { some: { kind: { not: "gift" } } } }, select: { domain: true } }),
  ]);
  const emails = new Set<string>();
  const domains = new Set<string>();
  for (const u of users) {
    emails.add(u.email.toLowerCase());
    const d = u.email.split("@")[1]?.toLowerCase();
    if (d && !WEBMAIL.has(d)) domains.add(domainOfUrl(`https://${d}`) ?? d);
  }
  for (const b of brands) domains.add(domainOfUrl(`https://${b.domain}`) ?? b.domain);
  return { emails, domains };
}

/** Kly's qualifier on the homepage HTML already fetched; a score under `minScore` stores the lead as failed "unqualified". */
export type Qualifier = (p: Place, homeHtml: string) => Promise<{ score: number; qualification: unknown; costMicros: number } | null>;

export interface FinderDeps {
  db: Db;
  qualify?: Qualifier;
  minScore?: number;
  fetchJson?: FetchJson;
  fetchPage?: PageFetcher;
  fetchText?: FetchText;
  /** Does the email's domain accept mail (MX, or an A record as the RFC 5321 fallback)? */
  hasMx?: (domain: string) => Promise<boolean>;
  signal?: AbortSignal;
  /** Keep leads with a phone but no public email (voice calling on): email "", never emailed. */
  allowPhoneOnly?: boolean;
  /** Lead sources allowed (KlySettings.sources); default OSM only. */
  sources?: readonly string[];
  /** Geocode cache, throttles and search blocks shared across ticks (the loop owns one). */
  rt?: SourceRuntime;
  /** Needed by codex_search. */
  ai?: KlyAI | null;
  /** Codex web-search calls allowed in this run (KlySettings.codexSearchPerTick). */
  codexSearchCalls?: number;
  /** Own-site fetch + qualify in parallel (default 6). */
  concurrency?: number;
  /** Stop starting new candidates after this many ms (keeps the tick moving; default none). */
  deadlineMs?: number;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export const osmSource: LeadSource = {
  id: "osm",
  async find(niche, city, ctx) {
    const places = await placesIn(niche, city, ctx.fetchJson ?? defaultFetchJson, ctx.signal, ctx.rt);
    return places.map((p) => ({ ...p, source: "osm" as const, ...(p.phone ? { phoneSource: "osm" } : {}) }));
  },
};

function sourceById(id: SourceId): LeadSource {
  return id === "osm" ? osmSource : id === "search" ? searchSource : id === "overture" ? overtureSource : codexSearchSource;
}

export interface YieldRow {
  source: string;
  city: string;
  runs: number;
  leads: number;
  dry: number;
  lastRunAt: Date;
}

export const EXHAUSTED_DAYS = 14;

/** A source is "exhausted" for one niche|city after consecutive runs with nothing new (OSM: 1, rotating searches: 3). */
export function isExhausted(r: Pick<YieldRow, "source" | "dry" | "lastRunAt">, now: Date): boolean {
  return r.dry >= (r.source === "osm" ? 1 : 3) && now.getTime() - r.lastRunAt.getTime() < EXHAUSTED_DAYS * 86_400_000;
}

/** Sources to run for one city, best niche-level yield first (untried first, ties in SOURCE_IDS order), minus exhausted. */
export function planSources(enabled: readonly string[], rows: readonly YieldRow[], city: string, now: Date): SourceId[] {
  const ids = SOURCE_IDS.filter((id) => enabled.includes(id));
  const score = (id: SourceId): number => {
    const mine = rows.filter((r) => r.source === id);
    const runs = mine.reduce((a, r) => a + r.runs, 0);
    if (runs === 0) return Number.POSITIVE_INFINITY;
    return (mine.reduce((a, r) => a + r.leads, 0) + 1) / (runs + 1);
  };
  const scores = new Map(ids.map((id) => [id, score(id)]));
  return ids
    .filter((id) => !rows.some((r) => r.source === id && r.city === city && isExhausted(r, now)))
    .sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0) || SOURCE_IDS.indexOf(a) - SOURCE_IDS.indexOf(b));
}

interface Blocks {
  blocks?: Record<string, { until: number; reason: string; strikes: number }>;
}

/** Find up to `count` new leads for one OutboundRun and insert them as status "found". */
export async function findLeads(deps: FinderDeps, req: { runId: string | null; niche: string; cities: string[]; count: number; armIds?: string[] }): Promise<FinderResult> {
  const { db } = deps;
  const clock = deps.now ?? (() => new Date());
  const started = Date.now();
  const rt = deps.rt ?? createSourceRuntime();
  const enabled = deps.sources ?? ["osm"];
  const { suppressed, taken } = await blockedDomains(db);
  const skipped: Record<string, number> = {};
  const skip = (k: string) => (skipped[k] = (skipped[k] ?? 0) + 1);
  const created: string[] = [];
  const bySource: Record<string, number> = {};
  let codexLeft = deps.codexSearchCalls ?? 1;

  // Restart-safe search blocks (CAPTCHA / 403 / 429) from KlySettings.sourceStats.
  const settings = await db.klySettings.findUnique({ where: { id: SETTINGS_ID }, select: { sourceStats: true } }).catch(() => null);
  const stats = ((settings as { sourceStats?: unknown } | null)?.sourceStats ?? {}) as Blocks;
  for (const [k, v] of Object.entries(stats.blocks ?? {})) if (!rt.blocks.has(k) && v.until > rt.now()) rt.blocks.set(k, v);
  const onBlock = (engine: string, reason: string, until: number) => {
    log("warn", "kly lead source blocked", { engine, reason, until: new Date(until).toISOString() });
    void (async () => {
      const blocks = Object.fromEntries([...rt.blocks].filter(([, v]) => v.until > rt.now()));
      await db.klySettings.update({ where: { id: SETTINGS_ID }, data: { sourceStats: { ...stats, blocks } as Prisma.InputJsonValue } });
      await decide(db, "error", `Lead source ${engine} blocked (${reason}); disabled until ${new Date(until).toISOString()}.`, { engine, reason, until });
    })().catch((e: unknown) => log("warn", "kly block record failed", { error: errMsg(e) }));
  };

  const rows: YieldRow[] = [...((await db.klySourceYield.findMany({ where: { niche: req.niche } }).catch(() => [])) as YieldRow[])];
  const deadline = deps.deadlineMs ? started + deps.deadlineMs : Number.POSITIVE_INFINITY;
  const full = () => created.length >= req.count || Date.now() >= deadline || Boolean(deps.signal?.aborted);

  for (const city of req.cities) {
    if (full()) break;
    for (const id of planSources(enabled, rows, city, clock())) {
      if (full()) break;
      if (id === "codex_search" && (codexLeft <= 0 || !deps.ai)) continue;
      if (id === "codex_search") codexLeft--;
      const seg = rows.find((r) => r.source === id && r.city === city);
      let cands: Candidate[];
      try {
        const known = id === "codex_search" ? (await db.outboundLead.findMany({ where: { niche: req.niche, city: city.split(",")[0]?.trim() ?? city }, select: { domain: true }, orderBy: { createdAt: "desc" }, take: 60 }).catch(() => [])).map((l) => l.domain) : [];
        cands = await sourceById(id).find(req.niche, city, {
          rt, signal: deps.signal, known, runIndex: seg?.runs ?? 0, ai: deps.ai, env: deps.env, fetchText: deps.fetchText, onBlock,
          onCost: (m) => void addCost(db, null, m, clock()).catch(() => undefined),
          fetchJson: deps.fetchJson, db,
        });
      } catch (e) {
        log("warn", "outbound: place search failed", { source: id, city, error: errMsg(e) });
        skip("search_failed");
        continue;
      }
      const fresh: Candidate[] = [];
      for (const p of cands) {
        const domain = domainOfUrl(p.website);
        if (!domain) { skip("bad_url"); continue; }
        if (taken.has(domain)) { skip("existing_lead_or_user"); continue; }
        if (suppressed.has(domain)) { skip("suppressed"); continue; }
        taken.add(domain);
        fresh.push(p);
      }
      const before = created.length;
      await pool(fresh, deps.concurrency ?? 6, async (p) => {
        if (full()) return;
        await processCandidate(deps, req, p, { taken, suppressed, skip, created });
      });
      const leads = created.length - before;
      bySource[id] = (bySource[id] ?? 0) + leads;
      const key = `${id}|${req.niche}|${city}`;
      const now = clock();
      const dry = fresh.length === 0 ? (seg?.dry ?? 0) + 1 : 0;
      await db.klySourceYield.upsert({
        where: { key },
        create: { key, source: id, niche: req.niche, city, runs: 1, candidates: cands.length, fresh: fresh.length, leads, dry, lastRunAt: now },
        update: { runs: { increment: 1 }, candidates: { increment: cands.length }, fresh: { increment: fresh.length }, leads: { increment: leads }, dry, lastRunAt: now },
      }).catch((e: unknown) => log("warn", "kly source yield failed", { error: errMsg(e) }));
      if (seg) Object.assign(seg, { runs: seg.runs + 1, leads: seg.leads + leads, dry, lastRunAt: now });
      else rows.push({ source: id, city, runs: 1, leads, dry, lastRunAt: now });
    }
  }
  for (const [k, v] of Object.entries(bySource)) skipped[`created_${k}`] = v;
  return { created, skipped };
}

/** Run `fn` over items with at most `n` in flight. */
export async function pool<T>(items: readonly T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const x = items[i++] as T;
      await fn(x);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
}

async function processCandidate(
  deps: FinderDeps,
  req: { runId: string | null; niche: string; armIds?: string[] },
  p: Candidate,
  st: { taken: Set<string>; suppressed: Set<string>; skip: (k: string) => void; created: string[] },
): Promise<void> {
  const { db } = deps;
  const { skip, suppressed, taken } = st;
  const domain = domainOfUrl(p.website) ?? "";
  const listed = listedEmail(p);
  // Source already gave an own-domain email: no crawl (homeHtml is empty, so qualify sees only the candidate).
  const found = listed
    ? { email: listed, page: p.website, finalUrl: p.website, homeHtml: "", phone: null } // phone falls back to p.phone with its own source label
    : await findOwnSiteEmail(p.website, deps.fetchPage, deps.signal);
  if (!found) { skip("no_site"); return; }
  // Own site / OSM tags first; a third-party listing's phone (codex_search) only when the site shows none.
  const phone = p.source === "osm" ? (p.phone ?? found.phone) : (found.phone ?? p.phone ?? null);
  const phoneSource = !phone ? null : p.source === "osm" ? (p.phone ? "osm" : "site") : found.phone ? "site" : (p.phoneSource ?? p.source);
  if (!found.email && !(deps.allowPhoneOnly && phone)) { skip("no_public_email"); return; }
  if (found.email && isSuppressed(found.email, suppressed)) { skip("suppressed"); return; }
  if (found.email && !(await (deps.hasMx ?? defaultHasMx)(found.email.split("@")[1] ?? "").catch(() => true))) { skip("no_mx"); return; }
  if (!found.email) skip("phone_only");
  const q = deps.qualify ? await deps.qualify(p, found.homeHtml).catch((e: unknown) => (log("warn", "kly: qualify failed", { domain, error: errMsg(e) }), null)) : null;
  if (deps.qualify && !q) { skip("qualify_failed"); taken.delete(domain); return; }
  const unqualified = q !== null && q.score < (deps.minScore ?? 0);
  if (unqualified) skip("unqualified");
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
      email: found.email ?? "", // "" = phone-only lead (voice calls only, never emailed)
      emailFoundOn: found.page,
      source: p.source,
      ...(phone && phoneSource ? { phone, phoneSource } : {}),
      armIds: req.armIds ?? [],
      ...(q ? { score: q.score, qualification: q.qualification as Prisma.InputJsonValue, costMicros: BigInt(Math.round(q.costMicros)) } : {}),
      ...(unqualified ? { status: "failed", error: "unqualified" } : {}),
      claimToken: newLeadToken(),
      unsubToken: newLeadToken(),
    },
    select: { id: true },
  }).catch(() => null); // unique domain race
  if (lead && !unqualified) st.created.push(lead.id);
}

/** Cheap bounce guard: a domain with no MX (and no A fallback) can't receive the email at all. DNS errors other than
 * "no such record" count as deliverable, so a flaky resolver never drops good leads. */
export async function defaultHasMx(domain: string): Promise<boolean> {
  const dns = await import("node:dns/promises");
  const missing = (e: unknown) => ["ENOTFOUND", "ENODATA", "ENOTIMP", "ESERVFAIL"].includes((e as { code?: string }).code ?? "") ? false : true;
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.some((r) => r.exchange && r.exchange !== ".")) return true;
  } catch (e) {
    if (missing(e)) return true;
  }
  try {
    return (await dns.resolve4(domain)).length > 0;
  } catch (e) {
    return missing(e);
  }
}

export interface FinderResult {
  created: string[];
  skipped: Record<string, number>;
}

export const newLeadToken = (): string => randomBytes(16).toString("base64url");
