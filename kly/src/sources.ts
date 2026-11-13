// Pluggable $0 lead sources for the finder. Each returns candidate businesses (name + own website, sometimes a phone)
// for one niche in one city; the finder then dedupes, fetches the own site and qualifies every candidate.
//  1. osm           OpenStreetMap: Nominatim geocode (1 req/s, cached) + Overpass (mirrors, sequential)
//  2. search        free HTML search results (DuckDuckGo html, Bing): organic result domains minus directories
//  3. codex_search  the owner's Codex subscription with its hosted web_search tool (same login as all Kly AI)
// Per-run state that must not be module-level (geocode cache, throttles, search-engine blocks) lives in a
// SourceRuntime owned by the loop; blocks and yields are also persisted in KlySettings.sourceStats.
import { z } from "zod";
import { domainOfUrl } from "../../src/lib/ads/outbound/policy";
import { loadPrices, textCostMicros } from "../../engine/src/providers/cost";
import { parseModelJson } from "../../engine/src/providers/json";
import { DEFAULT_MODEL, type KlyAI } from "./ai";
import { errMsg, log } from "./log";
import type { Db } from "./db";
import { normalizeUsPhone, type Place } from "./finder";

export const SOURCE_IDS = ["osm", "search", "codex_search", "overture"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export interface Candidate extends Place {
  source: SourceId;
  /** Where `phone` came from when it isn't the business's own site/OSM (e.g. codex_search = a third-party listing). */
  phoneSource?: string;
  /** Business email listed by the data source (fsq), already validated as on the business's own domain. */
  email?: string | null;
}

export interface Geo {
  bbox: [number, number, number, number];
  state: string | null;
}

export interface SourceRuntime {
  geo: Map<string, Geo | null>;
  /** Next allowed request time per host key (politeness). */
  nextAt: Map<string, number>;
  /** Search engines disabled after a CAPTCHA/block: engine -> { until, reason, strikes }. */
  blocks: Map<string, { until: number; reason: string; strikes: number }>;
  now: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export function createSourceRuntime(o: Partial<Pick<SourceRuntime, "now" | "sleep">> = {}): SourceRuntime {
  return {
    geo: new Map(),
    nextAt: new Map(),
    blocks: new Map(),
    now: o.now ?? Date.now,
    sleep: o.sleep ?? ((ms, signal) => new Promise<void>((res, rej) => {
      const t = setTimeout(res, ms);
      signal?.addEventListener("abort", () => (clearTimeout(t), rej(signal.reason)), { once: true });
    })),
  };
}

/** Wait until `key` may be hit again, then reserve the next slot `minMs` later (serialises callers per key). */
export async function polite(rt: SourceRuntime, key: string, minMs: number, signal?: AbortSignal): Promise<void> {
  const t = rt.now();
  const at = Math.max(t, rt.nextAt.get(key) ?? 0);
  rt.nextAt.set(key, at + minMs);
  if (at > t) await rt.sleep(at - t, signal);
}

export interface SourceCtx {
  rt: SourceRuntime;
  signal?: AbortSignal;
  /** Domains already known for this niche/city (codex_search asks for others). */
  known?: string[];
  /** How many times this source ran for this niche (rotates query variants). */
  runIndex?: number;
  ai?: KlyAI | null;
  env?: NodeJS.ProcessEnv;
  fetchText?: FetchText;
  /** Overpass/Nominatim JSON fetcher (tests). */
  fetchJson?: (url: string, init: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<unknown>;
  /** Called when a search engine is blocked (CAPTCHA / 403 / 429): the caller records it. */
  onBlock?: (engine: string, reason: string, until: number) => void;
  onCost?: (micros: number) => void;
  /** Kly DB (overture reads its imported KlyPlace rows). */
  db?: Db;
}

export interface LeadSource {
  id: SourceId;
  find(niche: string, city: string, ctx: SourceCtx): Promise<Candidate[]>;
}

export type FetchText = (url: string, init: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ status: number; text: string }>;

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const defaultFetchText: FetchText = async (url, init) => {
  const timeout = AbortSignal.timeout(20_000);
  const res = await fetch(url, { ...init, headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9", ...init.headers }, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  return { status: res.status, text: await res.text() };
};

export function cityParts(city: string): { name: string; state: string | null } {
  const [name, st] = city.split(",").map((x) => x.trim());
  return { name: name || city, state: st && /^[A-Z]{2}$/.test(st) ? st : null };
}

// ---------------------------------------------------------------------------
// Directories / aggregators / platforms: never a business's own site.

const EXCLUDED = [
  "yelp", "angi", "angieslist", "homeadvisor", "bbb", "facebook", "fb", "instagram", "yellowpages", "yp", "thumbtack", "nextdoor",
  "google", "bing", "duckduckgo", "yahoo", "apple", "linkedin", "twitter", "x", "youtube", "tiktok", "pinterest", "reddit", "quora",
  "wikipedia", "mapquest", "manta", "houzz", "porch", "expertise", "threebestrated", "superpages", "chamberofcommerce", "birdeye",
  "buildzoom", "networx", "fixr", "modernize", "homeguide", "bark", "craigslist", "tripadvisor", "opentable", "zocdoc", "healthgrades",
  "vitals", "webmd", "avvo", "justia", "findlaw", "lawyers", "martindale", "superlawyers", "realtor", "zillow", "trulia", "redfin",
  "cars", "cargurus", "autotrader", "edmunds", "groupon", "citysearch", "local", "hotfrog", "merchantcircle", "alignable", "glassdoor",
  "indeed", "amazon", "ebay", "etsy", "dexknows", "brownbook", "cylex", "showmelocal", "n49", "buzzfile", "bizapedia", "opencorporates",
  "dnb", "zoominfo", "crunchbase", "trustpilot", "consumeraffairs", "reviews", "porch", "homestars", "networx", "procore", "roofingcontractor",
  "cedur", "topguysroofing", "bestprosintown", "bestprosinyourtown", "top10", "topratedlocal", "guildquality", "nerdwallet", "forbes",
  "usnews", "wsj", "nytimes", "patch", "denverpost", "5280", "timeout", "eater", "theknot", "weddingwire", "zola", "mindbody", "classpass",
  "vagaro", "booksy", "styleseat", "fresha", "square", "wix", "squarespace", "godaddy", "wordpress", "blogspot", "medium", "substack",
  "linktr", "carrd", "sites", "business", "nationalpestcontrol", "angi-ads", "inquirer", "craftjack", "homeyou", "bobvila", "thisoldhouse",
];
const EXCLUDED_SET = new Set(EXCLUDED);

/** A domain that is a directory, aggregator, platform, government/education site or news site: never a lead. */
export function isExcludedDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (/\.(gov|edu|mil|int)$/.test(d) || /\.(gov|state)\.[a-z]{2}\.us$/.test(d) || d.endsWith(".us") && d.split(".").length > 2) return true;
  const label = d.split(".")[0] ?? "";
  return EXCLUDED_SET.has(label) || EXCLUDED_SET.has(label.replace(/-/g, ""));
}

/** Listicles ("best roofers in Denver") on a real-looking domain are still directories. */
export function isListiclePath(url: string): boolean {
  try {
    return /(^|[/-])(best|top-?\d+|top-rated|near-me|companies-in|directory|listings?)([/-]|$)/i.test(new URL(url).pathname);
  } catch {
    return true;
  }
}

/** Organic result title -> business name ("Acme Roofing | Denver Roofer" -> "Acme Roofing"). */
export function titleName(title: string, domain: string): string {
  const t = decodeEntities(title).split(/\s+[|–—:-]\s+|\s*[|–—]\s*/)[0]?.trim() ?? "";
  if (t.length >= 3 && t.length <= 80 && !/^(home|welcome|homepage|index)$/i.test(t)) return t;
  return domain.split(".")[0] ?? domain;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .trim();
}

// ---------------------------------------------------------------------------
// 2) Free HTML search

export interface SearchHit {
  url: string;
  title: string;
}

/** DuckDuckGo html results; ads (y.js / ad_domain) skipped. */
export function parseDuckDuckGo(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  for (const m of html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = decodeEntities(m[1] ?? "");
    let url = href;
    const u = /[?&]uddg=([^&]+)/.exec(href);
    if (u?.[1]) url = decodeURIComponent(u[1]);
    if (/duckduckgo\.com\/y\.js|ad_domain=/.test(url)) continue;
    if (url.startsWith("//")) url = `https:${url}`;
    if (/^https?:\/\//i.test(url)) out.push({ url, title: decodeEntities(m[2] ?? "") });
  }
  return out;
}

/** Bing organic results (li.b_algo h2 a); the /ck/a redirect carries the target as base64url in u=a1… */
export function parseBing(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  for (const m of html.matchAll(/<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    let url = decodeEntities(m[1] ?? "");
    const u = /[?&]u=a1([^&]+)/.exec(url);
    if (u?.[1]) {
      try {
        url = Buffer.from(u[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      } catch {
        continue;
      }
    }
    if (/^https?:\/\//i.test(url) && !/^https?:\/\/[^/]*bing\.com\//i.test(url)) out.push({ url, title: decodeEntities(m[2] ?? "") });
  }
  return out;
}

/** CAPTCHA / block page detection. */
export function searchBlocked(engine: "ddg" | "bing", status: number, html: string, hits: number): string | null {
  if (status === 403 || status === 429) return `HTTP ${status}`;
  if (engine === "ddg" && (status === 202 || /anomaly-modal|anomaly\.js|challenge-form|bots use DuckDuckGo/i.test(html))) return "DuckDuckGo anomaly/CAPTCHA page";
  if (engine === "bing" && hits === 0 && /captcha|b_captcha|verify you are a human|unusual traffic/i.test(html)) return "Bing CAPTCHA page";
  return null;
}

export const SEARCH_MIN_INTERVAL_MS = 12_000;
export const BLOCK_BASE_MS = 6 * 3_600_000;

export function searchQueries(niche: string, city: string): string[] {
  const { name, state } = cityParts(city);
  const where = state ? `${name} ${state}` : name;
  return [`${niche} ${where}`, `local ${niche} in ${where}`, `${niche} near ${where} family owned`, `${niche} company ${where} free estimate`, `independent ${niche} ${where}`];
}

interface Engine {
  id: "ddg" | "bing";
  request(q: string): { url: string; init: { method?: string; body?: string; headers?: Record<string, string> } };
  parse(html: string): SearchHit[];
}

const ENGINES: Engine[] = [
  {
    id: "ddg",
    request: (q) => ({ url: "https://html.duckduckgo.com/html/", init: { method: "POST", body: new URLSearchParams({ q, kl: "us-en" }).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } } }),
    parse: parseDuckDuckGo,
  },
  {
    id: "bing",
    request: (q) => ({ url: `https://www.bing.com/search?${new URLSearchParams({ q, count: "30", setlang: "en-US", cc: "US" }).toString()}`, init: {} }),
    parse: parseBing,
  },
];

/** Hits -> candidates: own-site domains only (no directories, listicles, duplicates). */
export function hitsToCandidates(hits: readonly SearchHit[], city: string, source: SourceId): Candidate[] {
  const { name: cityName, state } = cityParts(city);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const h of hits) {
    const domain = domainOfUrl(h.url);
    if (!domain || seen.has(domain) || isExcludedDomain(domain) || isListiclePath(h.url)) continue;
    seen.add(domain);
    const u = new URL(h.url);
    out.push({ name: titleName(h.title, domain), website: `${u.protocol}//${u.host}/`, city: cityName, state, lon: null, phone: null, source });
  }
  return out;
}

export const searchSource: LeadSource = {
  id: "search",
  async find(niche, city, ctx) {
    const fetchText = ctx.fetchText ?? defaultFetchText;
    const qs = searchQueries(niche, city);
    const start = (ctx.runIndex ?? 0) * 2;
    const queries = [qs[start % qs.length]!, qs[(start + 1) % qs.length]!];
    const hits: SearchHit[] = [];
    // Engines run in parallel (different hosts); queries per engine are serialised by polite().
    await Promise.all(ENGINES.map(async (eng) => {
      for (const q of queries) {
        const block = ctx.rt.blocks.get(eng.id);
        if (block && block.until > ctx.rt.now()) return;
        await polite(ctx.rt, `search:${eng.id}`, SEARCH_MIN_INTERVAL_MS, ctx.signal);
        const { url, init } = eng.request(q);
        let r: { status: number; text: string } | null = null;
        for (let attempt = 0; attempt < 2 && !r; attempt++) {
          try {
            const x = await fetchText(url, { ...init, signal: ctx.signal });
            if (x.status >= 500) throw new Error(`HTTP ${x.status}`);
            r = x;
          } catch (e) {
            if (ctx.signal?.aborted) throw e;
            if (attempt === 1) log("warn", "kly search failed", { engine: eng.id, error: errMsg(e) });
            else await ctx.rt.sleep(5_000 * (attempt + 1), ctx.signal);
          }
        }
        if (!r) return;
        const found = eng.parse(r.text);
        const why = searchBlocked(eng.id, r.status, r.text, found.length);
        if (why) {
          const strikes = (block?.strikes ?? 0) + 1;
          const until = ctx.rt.now() + Math.min(BLOCK_BASE_MS * 2 ** (strikes - 1), 7 * 86_400_000);
          ctx.rt.blocks.set(eng.id, { until, reason: why, strikes });
          ctx.onBlock?.(eng.id, why, until);
          return;
        }
        if (block) ctx.rt.blocks.delete(eng.id); // worked again: strikes reset
        hits.push(...found);
      }
    }));
    return hitsToCandidates(hits, city, "search");
  },
};

// ---------------------------------------------------------------------------
// 3) Codex web search (ChatGPT subscription; @prestyj/ai can't send hosted tools to Codex, so this posts the same
//    Responses request the Codex CLI sends, with tools: [{ type: "web_search" }], using Kly's Codex login).

export const CodexBusinessesSchema = z.object({
  businesses: z.array(z.object({
    name: z.string().min(2).max(120),
    website: z.string().min(4).max(300),
    phone: z.string().max(40).nullish(),
  })).max(40),
});

export function codexSearchPrompt(niche: string, city: string, known: readonly string[], runIndex: number): string {
  const { name, state } = cityParts(city);
  const areas = ["the city itself", "its suburbs", "the north and west of the metro area", "the south and east of the metro area", "neighbouring towns within 30 miles"];
  return [
    `Use web search. Find up to 20 independent, locally owned ${niche} businesses in ${name}${state ? `, ${state}` : ""} (focus on ${areas[runIndex % areas.length]}).`,
    "Each must have its OWN website (not a Yelp/Angi/HomeAdvisor/BBB/Facebook/Google/Thumbtack/Nextdoor/Yellow Pages page or any directory).",
    "Exclude chains, franchises, national brands, lead-generation sites, law firms and anything legal.",
    known.length ? `Skip these domains, already known: ${known.slice(0, 60).join(", ")}.` : "",
    'Answer with JSON only: {"businesses":[{"name":"...","website":"https://...","phone":"+1... or null"}]}. Give the phone only if a listing shows it.',
  ].filter(Boolean).join(" ");
}

/** Reads the Responses SSE stream: output text + token usage; throws on an error event. */
export function parseCodexSse(sse: string): { text: string; inputTokens: number; outputTokens: number; searches: number } {
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let searches = 0;
  for (const line of sse.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    let j: { type?: string; delta?: string; response?: { usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } }; message?: string };
    try {
      j = JSON.parse(line.slice(6));
    } catch {
      continue;
    }
    if (j.type === "response.output_text.delta" && typeof j.delta === "string") text += j.delta;
    else if (j.type === "response.web_search_call.completed") searches++;
    else if (j.type === "response.completed") {
      inputTokens = j.response?.usage?.input_tokens ?? 0;
      outputTokens = j.response?.usage?.output_tokens ?? 0;
    } else if (j.type === "response.failed" || j.type === "error") throw new Error(`codex: ${j.response?.error?.message ?? j.message ?? "failed"}`);
  }
  return { text, inputTokens, outputTokens, searches };
}

export function codexCandidates(raw: unknown, city: string): Candidate[] {
  const p = CodexBusinessesSchema.safeParse(raw);
  if (!p.success) return [];
  const { name: cityName, state } = cityParts(city);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const b of p.data.businesses) {
    const url = /^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`;
    const domain = domainOfUrl(url);
    if (!domain || seen.has(domain) || isExcludedDomain(domain)) continue;
    seen.add(domain);
    const phone = b.phone ? normalizeUsPhone(b.phone) : null;
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      continue;
    }
    out.push({ name: b.name.slice(0, 80), website: `https://${host}/`, city: cityName, state, lon: null, phone, ...(phone ? { phoneSource: "codex_search" } : {}), source: "codex_search" });
  }
  return out;
}

export const codexSearchSource: LeadSource = {
  id: "codex_search",
  async find(niche, city, ctx) {
    if (!ctx.ai) return [];
    const block = ctx.rt.blocks.get("codex");
    if (block && block.until > ctx.rt.now()) return [];
    const env = ctx.env ?? process.env;
    const model = env.CODEX_TEXT_MODEL || DEFAULT_MODEL;
    const { accessToken, accountId } = await ctx.ai.auth.resolve();
    const body = {
      model,
      store: false,
      stream: true,
      instructions: "You research local businesses on the web and answer with strict JSON only.",
      input: [{ role: "user", content: [{ type: "input_text", text: codexSearchPrompt(niche, city, ctx.known ?? [], ctx.runIndex ?? 0) }] }],
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      parallel_tool_calls: false,
      reasoning: { effort: "low" },
      include: [],
    };
    const timeout = AbortSignal.timeout(180_000);
    const res = await fetch("https://chatgpt.com/backend-api/codex/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${accessToken}`,
        "OpenAI-Beta": "responses=experimental",
        originator: "codex_cli_rs",
        "User-Agent": "codex_cli_rs/0.161.0",
        version: "0.161.0",
        ...(accountId ? { "chatgpt-account-id": accountId } : {}),
      },
      body: JSON.stringify(body),
      signal: ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout,
    });
    const sse = await res.text();
    if (res.status === 429 || /usage.?limit/i.test(res.status >= 400 ? sse : "")) {
      const until = ctx.rt.now() + 30 * 60_000;
      ctx.rt.blocks.set("codex", { until, reason: `Codex HTTP ${res.status}`, strikes: 1 });
      ctx.onBlock?.("codex", `Codex usage limit (HTTP ${res.status})`, until);
      return [];
    }
    if (res.status >= 400) {
      if (res.status === 401) await ctx.ai.auth.refresh().catch(() => undefined);
      throw new Error(`codex web search HTTP ${res.status}: ${sse.slice(0, 200)}`);
    }
    const r = parseCodexSse(sse);
    ctx.onCost?.(textCostMicros(loadPrices(env), model, r.inputTokens, r.outputTokens));
    let json: unknown;
    try {
      json = parseModelJson(r.text);
    } catch {
      return [];
    }
    return codexCandidates(json, city);
  },
};
