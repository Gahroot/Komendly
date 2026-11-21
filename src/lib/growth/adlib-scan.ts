// Shared Meta Ad Library scanner contract + pure parser (growth systems ad_check and ad_watch).
// Pure TS (no Next/Prisma/Node imports): imported by web and engine. The fetching side lives in
// engine/src/growth/adlib-scan.ts (scanPage); web never fetches the Ad Library, it queues an AdJob `adlib_scan`.
//
// Source: the public Ad Library website (facebook.com/ads/library/?active_status=active&ad_type=all&country=US&
// view_all_page_id=<id>). Its server-rendered HTML embeds the first page of results as Relay JSON
// ("search_results_connection": {count, edges[{node:{collated_results:[{ad_archive_id,start_date,snapshot{...}}]}}]}).
// The Graph API ads_archive endpoint returns no US commercial ads, so it is not used.

export interface AdlibAd {
  adArchiveId: string;
  /** ISO date (YYYY-MM-DD, UTC) the ad started running. */
  startedAt: string;
  runDays: number;
  format: "image" | "video" | "carousel" | "unknown";
  body: string;
  headline?: string;
  cta?: string;
  imageUrl?: string;
  snapshotUrl: string;
}

export interface AdlibPageScan {
  pageId: string;
  pageName: string;
  pageUrl?: string;
  website?: string;
  liveAds: AdlibAd[];
  scannedAt: string;
}

export const AD_LIBRARY_ORIGIN = "https://www.facebook.com";

/** Ad Library URL listing a page's active US ads (what the scanner fetches and what reports link to). */
export function adLibraryPageUrl(pageId: string): string {
  return `${AD_LIBRARY_ORIGIN}/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&view_all_page_id=${encodeURIComponent(pageId)}`;
}

/** Ad Library keyword search (active US ads) — used to resolve a website or Page slug to its page id. */
export function adLibrarySearchUrl(q: string): string {
  return `${AD_LIBRARY_ORIGIN}/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=keyword_unordered&q=${encodeURIComponent(q)}`;
}

export const adSnapshotUrl = (adArchiveId: string) => `${AD_LIBRARY_ORIGIN}/ads/library/?id=${encodeURIComponent(adArchiveId)}`;

/** True when Meta answered with its JS bot challenge instead of results (fetcher must POST it and retry). */
export function adLibraryChallengePath(html: string): string | null {
  const m = /fetch\('(\/__rd_verify_[^']+)'/.exec(html);
  return m?.[1] ?? null;
}

// ------------------------------------------------------------------------------------------- JSON extraction

/** Slice the JSON value (object/array) starting at `start` (index of `{` or `[`), respecting strings. */
function sliceJson(s: string, start: number): string | null {
  const open = s[start];
  if (open !== "{" && open !== "[") return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/** Every JSON value that follows `"<key>":` in the page (unparseable ones skipped). */
function jsonAfterKey(html: string, key: string): unknown[] {
  const out: unknown[] = [];
  const needle = `"${key}":`;
  for (let i = html.indexOf(needle); i >= 0; i = html.indexOf(needle, i + needle.length)) {
    const raw = sliceJson(html, i + needle.length);
    if (!raw) continue;
    try { out.push(JSON.parse(raw)); } catch { /* not JSON (e.g. JS source) */ }
  }
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

interface ResultsConnection { count: number; edges: unknown[] }

function resultsConnection(html: string): ResultsConnection | null {
  for (const v of jsonAfterKey(html, "search_results_connection")) {
    if (isObj(v) && Array.isArray(v.edges)) return { count: typeof v.count === "number" ? v.count : v.edges.length, edges: v.edges };
  }
  return null;
}

/**
 * Total active ads Meta reports for the query (can exceed the ads embedded in the first page of HTML), or null when
 * the HTML holds no Ad Library results at all (challenge, error or login page: treat as a failed fetch, not "0 ads").
 */
export function adLibraryResultCount(html: string): number | null {
  return resultsConnection(html)?.count ?? null;
}

/** Raw results of a keyword search: one entry per ad with its page and landing URL (for page-id resolution). */
export function parseAdLibrarySearch(html: string): Array<{ pageId: string; pageName: string; pageUrl?: string; linkUrl?: string }> {
  return collated(html).map((r) => {
    const sn = isObj(r.snapshot) ? r.snapshot : {};
    return { pageId: String(r.page_id ?? sn.page_id ?? ""), pageName: str(sn.page_name) ?? str(r.page_name) ?? "", pageUrl: str(sn.page_profile_uri), linkUrl: landingUrl(sn) };
  }).filter((x) => x.pageId);
}

function collated(html: string): Obj[] {
  const conn = resultsConnection(html);
  if (!conn) return [];
  const out: Obj[] = [];
  for (const e of conn.edges) {
    const node = isObj(e) && isObj(e.node) ? e.node : null;
    for (const r of arr(node?.collated_results)) if (isObj(r) && str(String(r.ad_archive_id ?? ""))) out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- per-ad fields

const SOCIAL_HOST = /(^|\.)(facebook\.com|fb\.com|fb\.me|m\.me|instagram\.com|wa\.me|whatsapp\.com|messenger\.com|threads\.net)$/i;

/** Unwrap l.facebook.com redirects; drop tracking params. */
function cleanLink(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    let u = new URL(raw);
    if (/(^|\.)facebook\.com$/i.test(u.hostname) && u.pathname === "/l.php" && u.searchParams.get("u")) u = new URL(u.searchParams.get("u")!);
    if (!/^https?:$/.test(u.protocol)) return undefined;
    for (const k of [...u.searchParams.keys()]) if (/^(fbclid|utm_\w+)$/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return undefined;
  }
}

function landingUrl(sn: Obj): string | undefined {
  const cards = arr(sn.cards).filter(isObj);
  return cleanLink(str(sn.link_url) ?? cards.map((c) => str(c.link_url)).find(Boolean));
}

function adFormat(sn: Obj): AdlibAd["format"] {
  const f = String(sn.display_format ?? "").toUpperCase();
  if (f === "IMAGE") return "image";
  if (f === "VIDEO") return "video";
  if (f === "CAROUSEL" || f === "MULTI_IMAGES" || f === "MULTI_MEDIA") return "carousel";
  // DCO / DPA / unknown: infer from the media present.
  const cards = arr(sn.cards).filter(isObj);
  if (cards.length > 1) return "carousel";
  if (arr(sn.videos).length || cards.some((c) => str(c.video_hd_url) || str(c.video_sd_url))) return "video";
  if (arr(sn.images).length || cards.length === 1) return "image";
  return "unknown";
}

function adImage(sn: Obj): string | undefined {
  const img = arr(sn.images).find(isObj);
  const vid = arr(sn.videos).find(isObj);
  const card = arr(sn.cards).find(isObj);
  return str(img?.resized_image_url) ?? str(img?.original_image_url) ?? str(vid?.video_preview_image_url)
    ?? str(card?.resized_image_url) ?? str(card?.original_image_url) ?? str(card?.video_preview_image_url);
}

function adBody(sn: Obj): string {
  const b = sn.body;
  const text = isObj(b) ? str(b.text) : str(b);
  const card = arr(sn.cards).find(isObj);
  return (text ?? str(card?.body) ?? "").slice(0, 2000);
}

const DAY_MS = 86_400_000;

function toAd(r: Obj, now: Date): AdlibAd | null {
  const id = String(r.ad_archive_id ?? "").trim();
  const start = Number(r.start_date);
  if (!id || !Number.isFinite(start) || start <= 0) return null;
  const sn = isObj(r.snapshot) ? r.snapshot : {};
  const startMs = start * 1000;
  const card = arr(sn.cards).find(isObj);
  const ad: AdlibAd = {
    adArchiveId: id,
    startedAt: new Date(startMs).toISOString().slice(0, 10),
    runDays: Math.max(0, Math.floor((now.getTime() - startMs) / DAY_MS)),
    format: adFormat(sn),
    body: adBody(sn),
    snapshotUrl: adSnapshotUrl(id),
  };
  const headline = str(sn.title) ?? str(card?.title);
  const cta = str(sn.cta_text) ?? str(card?.cta_text);
  const imageUrl = adImage(sn);
  if (headline) ad.headline = headline;
  if (cta) ad.cta = cta;
  if (imageUrl) ad.imageUrl = imageUrl;
  return ad;
}

/** Most common non-social landing host across the page's ads, as `https://host/`. */
function websiteOf(rows: Obj[]): string | undefined {
  const n = new Map<string, number>();
  for (const r of rows) {
    const link = landingUrl(isObj(r.snapshot) ? r.snapshot : {});
    if (!link) continue;
    const host = new URL(link).hostname.toLowerCase();
    if (SOCIAL_HOST.test(host)) continue;
    n.set(host, (n.get(host) ?? 0) + 1);
  }
  const best = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? `https://${best[0]}/` : undefined;
}

/**
 * Pure parser of one Ad Library page-view HTML (view_all_page_id=<pageId>, active ads, US). Never throws: HTML
 * without results gives liveAds [] — call adLibraryResultCount(html) first to tell "0 ads" from "not a result page".
 * Only ads embedded in the server-rendered first page are returned (Meta embeds the first ~30); the full total is
 * adLibraryResultCount(html). Ads of other pages (shouldn't happen on a page view) are dropped.
 */
export function parseAdLibraryPage(html: string, pageId: string, now: Date): AdlibPageScan {
  const all = collated(html);
  const rows = pageId ? all.filter((r) => String(r.page_id ?? (isObj(r.snapshot) ? r.snapshot.page_id : "")) === pageId) : all;
  const first = rows[0];
  const firstSn = first && isObj(first.snapshot) ? first.snapshot : {};
  let pageName = "";
  for (const v of jsonAfterKey(html, "ad_library_page_info")) {
    const info = isObj(v) && isObj(v.page_info) ? v.page_info : null;
    if (info && str(info.page_name)) { pageName = str(info.page_name)!; break; }
  }
  pageName ||= str(firstSn.page_name) ?? str(first?.page_name) ?? "";
  const seen = new Set<string>();
  const liveAds: AdlibAd[] = [];
  for (const r of rows) {
    if (r.is_active === false) continue;
    const ad = toAd(r, now);
    if (!ad || seen.has(ad.adArchiveId)) continue;
    seen.add(ad.adArchiveId);
    liveAds.push(ad);
  }
  liveAds.sort((a, b) => b.runDays - a.runDays || a.adArchiveId.localeCompare(b.adArchiveId));
  const scan: AdlibPageScan = { pageId: pageId || String(first?.page_id ?? ""), pageName, liveAds, scannedAt: now.toISOString() };
  const pageUrl = str(firstSn.page_profile_uri);
  const website = websiteOf(rows);
  if (pageUrl) scan.pageUrl = pageUrl;
  if (website) scan.website = website;
  return scan;
}

// ----------------------------------------------------------------------------------------------- scan targets

/** What a user/caller asked to scan: a page id, a Facebook Page (slug or numeric profile id) or a website domain. */
export type AdlibTarget = { kind: "page_id" | "facebook" | "website"; value: string; key: string };

const FB_HOST = /^(www\.|m\.|web\.|business\.)?(facebook\.com|fb\.com)$/i;
const FB_RESERVED = new Set(["pages", "pg", "groups", "watch", "events", "marketplace", "share", "sharer", "sharer.php", "people", "login", "help", "policies", "privacy", "home.php", "story.php", "photo.php", "permalink.php", "reel", "reels", "hashtag", "gaming", "business", "ads"]);

/** Parse "facebook.com/gatorhomeprofessionals", "https://gatormetalroofing.com/x", "111445424455372"... or null. */
export function parseAdlibTarget(raw: string): AdlibTarget | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 500) return null;
  const mk = (kind: AdlibTarget["kind"], value: string): AdlibTarget => ({ kind, value, key: `${kind}:${value}` });
  if (/^\d{5,20}$/.test(s)) return mk("page_id", s);
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (FB_HOST.test(host)) {
    const viewAll = u.searchParams.get("view_all_page_id");
    if (viewAll && /^\d{5,20}$/.test(viewAll)) return mk("page_id", viewAll);
    const id = u.searchParams.get("id");
    if (/^\/profile\.php$/i.test(u.pathname) && id && /^\d{5,20}$/.test(id)) return mk("facebook", id);
    const parts = u.pathname.split("/").filter(Boolean);
    // /pages/<name>/<id> and /p/<name>-<id>
    const numeric = parts.map((p) => /(\d{8,20})$/.exec(p)?.[1]).filter(Boolean).pop();
    if ((parts[0] === "pages" || parts[0] === "p") && numeric) return mk("facebook", numeric);
    const slug = parts[0]?.toLowerCase();
    if (!slug || FB_RESERVED.has(slug) || !/^[a-z0-9.\-_]{2,80}$/.test(slug)) return null;
    return mk("facebook", slug);
  }
  if (/(^|\.)(instagram\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com|linkedin\.com|google\.com|yelp\.com)$/.test(host)) return null;
  const domain = host.replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || !/[a-z]/.test(domain.split(".").pop() ?? "")) return null;
  return mk("website", domain);
}

/** Facebook Page slug from a profile URI ("https://www.facebook.com/gatorhomeprofessionals/" -> "gatorhomeprofessionals"). */
export function facebookSlug(pageUrl: string | undefined): string | null {
  if (!pageUrl) return null;
  const t = parseAdlibTarget(pageUrl);
  return t?.kind === "facebook" ? t.value : null;
}

/**
 * Pick the page a keyword search points to: for a website, the page whose ads land on that domain (most ads wins);
 * for a Facebook slug, the page whose profile URL has that slug. null when nothing matches (never a guess).
 */
export function pickPageFromSearch(results: ReturnType<typeof parseAdLibrarySearch>, target: AdlibTarget): string | null {
  const n = new Map<string, number>();
  for (const r of results) {
    let hit = false;
    if (target.kind === "website") {
      try {
        const h = r.linkUrl ? new URL(r.linkUrl).hostname.toLowerCase().replace(/^www\./, "") : "";
        hit = !!h && (h === target.value || h.endsWith(`.${target.value}`));
      } catch { hit = false; }
    } else if (target.kind === "facebook") {
      hit = facebookSlug(r.pageUrl) === target.value || r.pageId === target.value;
    } else hit = r.pageId === target.value;
    if (hit) n.set(r.pageId, (n.get(r.pageId) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}
