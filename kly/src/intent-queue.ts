// Public purchase-intent monitor: finds PUBLIC posts where someone asks for ads / creative / marketing help and queues
// them (url, text, intent score, honest reply draft) for a human or Media Master to act on. NOTHING is ever posted.
// Sources (free, public, no login): Reddit listing JSON (r/forhire, r/smallbusiness, r/Entrepreneur...), Hacker News
// Algolia search, and job-board RSS (marketing roles). Parsers + scoring are pure; the fetch layer is injected.
// Respect: one request per source per run, our UA, small pages; Reddit/HN only via their public read endpoints.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type IntentSource = "reddit" | "hackernews" | "jobs_rss";

export interface IntentOpportunity {
  id: string;
  source: IntentSource;
  url: string;
  title: string;
  text: string;
  author: string | null;
  postedAt: string | null;
  intentScore: number;
  matched: string[];
  /** Draft only; a human reviews and posts. Answers the question first; no link unless they ask. */
  replyDraft: string;
  status: "new";
  foundAt: string;
}

export interface RawPost { source: IntentSource; url: string; title: string; text: string; author: string | null; postedAt: string | null; flair?: string }

export const REDDIT_FEEDS = ["forhire", "smallbusiness", "Entrepreneur", "marketing", "facebookads", "ecommerce"] as const;
export const HN_QUERIES = ["need facebook ads help", "looking for ad creative", "who is hiring marketing"] as const;
export const JOB_RSS_FEEDS = ["https://weworkremotely.com/categories/remote-marketing-jobs.rss"] as const;

// ---- parsers (pure) ----------------------------------------------------------------------------------------------

/** Reddit listing JSON (`/r/x/new.json`) -> posts. */
export function parseReddit(json: unknown): RawPost[] {
  const kids = (json as { data?: { children?: { data?: Record<string, unknown> }[] } })?.data?.children ?? [];
  const out: RawPost[] = [];
  for (const k of kids) {
    const d = k.data;
    if (!d || typeof d.permalink !== "string" || typeof d.title !== "string") continue;
    out.push({
      source: "reddit", url: `https://www.reddit.com${d.permalink}`, title: d.title, text: String(d.selftext ?? "").slice(0, 1500),
      author: typeof d.author === "string" ? d.author : null, postedAt: typeof d.created_utc === "number" ? new Date(d.created_utc * 1000).toISOString() : null,
      flair: typeof d.link_flair_text === "string" ? d.link_flair_text : undefined,
    });
  }
  return out;
}

/** HN Algolia `search_by_date` JSON -> posts. */
export function parseHackerNews(json: unknown): RawPost[] {
  const hits = (json as { hits?: Record<string, unknown>[] })?.hits ?? [];
  const out: RawPost[] = [];
  for (const h of hits) {
    const id = h.objectID;
    const title = String(h.title ?? h.story_title ?? "");
    const text = String(h.story_text ?? h.comment_text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1500);
    if (!id || !(title || text)) continue;
    out.push({ source: "hackernews", url: `https://news.ycombinator.com/item?id=${id}`, title, text, author: typeof h.author === "string" ? h.author : null, postedAt: typeof h.created_at === "string" ? h.created_at : null });
  }
  return out;
}

const xml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim();

/** RSS 2.0 -> posts (item title/link/description/pubDate). */
export function parseRss(body: string): RawPost[] {
  const out: RawPost[] = [];
  for (const m of body.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const it = m[1] as string;
    const tag = (t: string) => new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i").exec(it)?.[1] ?? "";
    const url = xml(tag("link")) || xml(tag("guid"));
    const title = xml(tag("title"));
    if (!url || !title) continue;
    const d = new Date(xml(tag("pubDate")));
    out.push({ source: "jobs_rss", url, title, text: xml(tag("description")).slice(0, 1500), author: null, postedAt: Number.isFinite(d.getTime()) ? d.toISOString() : null });
  }
  return out;
}

// ---- scoring + reply (pure) --------------------------------------------------------------------------------------

const ASK = /\b(looking for|need|anyone (know|recommend)|can anyone|recommend|help (me|with)|how (do|can) i|hiring|want to hire|seeking|any (tips|advice))\b/i;
const TOPIC: readonly [RegExp, string, number][] = [
  [/\b(facebook|meta|instagram|fb) ads?\b/i, "meta_ads", 30],
  [/\bad creatives?\b|\bugc\b|\bvideo ads?\b|\bad (design|copy|images?)\b/i, "creative", 30],
  [/\b(run|running|manage|managing) (my |our )?ads\b|\bpaid social\b|\bppc\b|\bmedia buyer\b|\bperformance marketer\b/i, "paid_media", 25],
  [/\bmarketing (help|agency|manager|freelancer|person)\b|\bsocial media (manager|marketer|help)\b/i, "marketing_help", 15],
];
/** People SELLING services, not buying them. */
const SELLER = /^\s*\[?\s*for ?hire\s*\]?|\bi (offer|will|can) (run|manage|create|make|design)\b|\bour agency\b|\bhire me\b/i;

export interface Scored { score: number; matched: string[] }

export function scoreIntent(p: Pick<RawPost, "title" | "text" | "flair" | "source">): Scored {
  const t = `${p.title}\n${p.text}`;
  if (SELLER.test(p.title) || /for ?hire/i.test(p.flair ?? "")) return { score: 0, matched: ["seller"] };
  const matched: string[] = [];
  let score = 0;
  for (const [re, name, pts] of TOPIC) if (re.test(t)) { matched.push(name); score += pts; }
  if (!matched.length) return { score: 0, matched: [] };
  if (ASK.test(t)) { matched.push("explicit_ask"); score += 30; }
  if (/\[hiring\]|\bhiring\b/i.test(p.title) || p.source === "jobs_rss") { matched.push("hiring"); score += 15; }
  if (/\$\d|budget/i.test(t)) { matched.push("budget_mentioned"); score += 5; }
  return { score: Math.min(100, score), matched };
}

/** An honest, answer-first reply draft. No pitch, no link: mention Komendly only if they ask for tools. */
export function replyDraft(p: Pick<RawPost, "title" | "text">, matched: readonly string[]): string {
  const tips = matched.includes("creative")
    ? "For ad creative, the biggest lever is usually the first 2 seconds and one clear offer. Test 3 to 5 different hooks on the same offer before touching targeting, and keep each ad to a single message."
    : matched.includes("meta_ads")
      ? "For Meta ads on a small budget, start with one campaign, broad targeting and 3 to 5 creatives. Let it spend a few days before judging, and judge on cost per lead rather than clicks."
      : "Before hiring, write down your offer, the one customer you want and a monthly budget. It makes any freelancer or agency quote far easier to compare.";
  return `${tips}\n\nHappy to look at your specific situation if you share the business type and rough budget. (Disclosure: I work on Komendly, an AI ad-creative tool; glad to point to free options either way.)`;
}

export const MIN_INTENT_SCORE = 40;

/** Posts -> queue entries (scored, drafted, above the minimum, newest first). */
export function toOpportunities(posts: readonly RawPost[], now: Date, min = MIN_INTENT_SCORE): IntentOpportunity[] {
  const out: IntentOpportunity[] = [];
  for (const p of posts) {
    const { score, matched } = scoreIntent(p);
    if (score < min) continue;
    out.push({ id: `${p.source}:${p.url}`, source: p.source, url: p.url, title: p.title.slice(0, 200), text: p.text.slice(0, 1200), author: p.author, postedAt: p.postedAt, intentScore: score, matched, replyDraft: replyDraft(p, matched), status: "new", foundAt: now.toISOString() });
  }
  return out.sort((a, b) => b.intentScore - a.intentScore || (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
}

/** Merge new opportunities into an existing queue without duplicates (by id). */
export function mergeQueue(existing: readonly IntentOpportunity[], fresh: readonly IntentOpportunity[]): { queue: IntentOpportunity[]; added: IntentOpportunity[] } {
  const seen = new Set(existing.map((o) => o.id));
  const added = fresh.filter((o) => !seen.has(o.id) && seen.add(o.id));
  return { queue: [...existing, ...added], added };
}

// ---- runner (I/O injected) ---------------------------------------------------------------------------------------

export type IntentFetch = (url: string) => Promise<{ status: number; text: string }>;

export async function collectPosts(fetch: IntentFetch): Promise<{ posts: RawPost[]; errors: string[] }> {
  const posts: RawPost[] = [];
  const errors: string[] = [];
  const jobs: [string, (t: string) => RawPost[]][] = [
    ...REDDIT_FEEDS.map((r): [string, (t: string) => RawPost[]] => [`https://www.reddit.com/r/${r}/new.json?limit=50&raw_json=1`, (t) => parseReddit(JSON.parse(t))]),
    ...HN_QUERIES.map((q): [string, (t: string) => RawPost[]] => [`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=(story,comment)&hitsPerPage=30`, (t) => parseHackerNews(JSON.parse(t))]),
    ...JOB_RSS_FEEDS.map((u): [string, (t: string) => RawPost[]] => [u, parseRss]),
  ];
  for (const [url, parse] of jobs) { // sequential: one polite request at a time
    try {
      const r = await fetch(url);
      if (r.status !== 200) { errors.push(`${url}: HTTP ${r.status}`); continue; }
      posts.push(...parse(r.text));
    } catch (e) { errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return { posts, errors };
}

export function readQueue(file: string): IntentOpportunity[] {
  if (!existsSync(file)) return [];
  try { const j = JSON.parse(readFileSync(file, "utf8")) as unknown; return Array.isArray(j) ? (j as IntentOpportunity[]) : []; } catch { return []; }
}

/** One discovery pass: collect, score, merge into `file` (JSON array). Returns counts. Never posts anywhere. */
export async function runIntentDiscovery(o: { fetch: IntentFetch; file: string; now?: Date; dry?: boolean }): Promise<{ scanned: number; added: IntentOpportunity[]; total: number; errors: string[] }> {
  const now = o.now ?? new Date();
  const { posts, errors } = await collectPosts(o.fetch);
  const { queue, added } = mergeQueue(readQueue(o.file), toOpportunities(posts, now));
  if (!o.dry && added.length) {
    mkdirSync(dirname(o.file), { recursive: true });
    writeFileSync(o.file, `${JSON.stringify(queue, null, 1)}\n`);
  }
  return { scanned: posts.length, added, total: queue.length, errors };
}

/** AdsEvent props for an opportunity (name "intent_opportunity"); the caller writes it if it has a DB. */
export const INTENT_EVENT = "intent_opportunity" as const;
export function intentEventProps(o: IntentOpportunity): Record<string, unknown> {
  return { id: o.id, source: o.source, url: o.url, title: o.title, text: o.text, score: o.intentScore, intentScore: o.intentScore, matched: o.matched, draft: o.replyDraft, replyDraft: o.replyDraft, postedAt: o.postedAt, status: "new" };
}
