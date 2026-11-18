// Growth system #5 "review_gifts": a short testimonial-style video made from ONE real customer review that the business
// published on its OWN website (schema.org Review JSON-LD or an on-page testimonial quote with a named author). No
// third-party review sites are read or scraped (no Google Maps/Yelp), reviews are never invented or reworded: the video
// speaks a verbatim excerpt (whole sentences) and the gift page names the reviewer as published and says it's an AI
// source. DEFAULT gift ($0): an animated review-quote video the engine renders itself (AdJob review_quote_video: sharp +
// ffmpeg, no paid provider), capped by REVIEW_GIFT_DAILY_CAP (default 3, max 10: engine time only). OPTIONAL paid gift:
// an AI presenter through the testimonial pipeline (~$2.10 FAL), only when REVIEW_GIFT_PRESENTER_DAILY_CAP > 0
// (default 0 = never creates FAL jobs, hard max 5). Both caps are env-only: nothing (AI included) raises them at runtime.
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { TESTIMONIAL_JOB_TYPE, type TestimonialJobPayload } from "../../src/lib/testimonial/contracts";
import { REVIEW_QUOTE_JOB_TYPE, type ReviewQuotePayload } from "../../src/lib/kly/review-video";
import { domainOfUrl } from "../../src/lib/ads/outbound/policy";
import { recordSystemRun, systemEnabled } from "../../src/lib/growth/systems";
import type { Db } from "./db";
import type { PageFetcher } from "./finder";
import { GIFT_PRIORITY, senderWorkspace } from "./hook";
import { errMsg, log } from "./log";
import { addCost, dayStart } from "./settings";
import { SYSTEM_EVENTS, systemEvent } from "./growth";
import { safeFetch } from "../../engine/src/net/ssrf";

export const REVIEW_SYSTEM = "review_gifts" as const;
/** Lead status while its review video renders (not sendable, not in the classic gift queue). */
export const REVIEW_VIDEO_STATUS = "review_video";
/** $0 quote videos (engine CPU only). */
export const HARD_MAX_REVIEW_GIFTS_PER_DAY = 10;
export const DEFAULT_REVIEW_GIFTS_PER_DAY = 3;
/** Paid AI-presenter videos (~$2.10 each): off unless the founder sets the env cap. */
export const HARD_MAX_PRESENTER_PER_DAY = 5;
export const DEFAULT_PRESENTER_PER_DAY = 0;
export const SCAN_PER_CYCLE = 8;
export const REVIEW_TARGET_SECONDS = 15;
export const REVIEW_MAX_WORDS = 32;
export const REVIEW_STUCK_MS = 3 * 3_600_000;
/** Estimated vendor cost of one PRESENTER video: one ~15 s Happy Horse 720p take at $0.14/s (engine testimonial/models.ts). */
export const EST_REVIEW_VIDEO_MICROS = REVIEW_TARGET_SECONDS * 140_000;

export interface ReviewCandidate {
  author: string;
  text: string;
  rating: number | null;
  sourceUrl: string;
}

// ---------------------------------------------------------------------------
// Pure parsing / selection (unit-tested)

function envCap(raw: string | undefined, def: number, max: number): number {
  const n = raw?.trim() ? Number(raw) : def;
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.min(max, Math.floor(n)));
}
/** Daily $0 quote-video cap (env only), clamped to [0, 10]. */
export function reviewGiftCap(env: NodeJS.ProcessEnv = process.env): number {
  return envCap(env.REVIEW_GIFT_DAILY_CAP, DEFAULT_REVIEW_GIFTS_PER_DAY, HARD_MAX_REVIEW_GIFTS_PER_DAY);
}
/** Daily PAID presenter-video cap (env only), default 0 = off, clamped to [0, 5]. */
export function presenterCap(env: NodeJS.ProcessEnv = process.env): number {
  return envCap(env.REVIEW_GIFT_PRESENTER_DAILY_CAP, DEFAULT_PRESENTER_PER_DAY, HARD_MAX_PRESENTER_PER_DAY);
}

/** Brand colour from the site's <meta name="theme-color"> (hex only), else null. */
export function themeColor(html: string): string | null {
  const m = /<meta[^>]+name=["']theme-color["'][^>]*>/i.exec(html)?.[0];
  const c = m && /content=["']\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)\s*["']/i.exec(m)?.[1];
  if (!c) return null;
  return c.length === 4 ? `#${[...c.slice(1)].map((x) => x + x).join("")}`.toUpperCase() : c.toUpperCase();
}

const THIRD_PARTY = /google|yelp|facebook|tripadvisor|trustpilot|angi|homeadvisor|thumbtack|houzz|bbb|nextdoor|birdeye|podium|reviews\.io|elfsight|trustindex/i;

function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function nameOf(a: unknown): string {
  if (typeof a === "string") return a;
  if (Array.isArray(a)) return nameOf(a[0]);
  if (a && typeof a === "object") return typeof (a as { name?: unknown }).name === "string" ? (a as { name: string }).name : "";
  return "";
}

function collectReviews(node: unknown, out: unknown[]): void {
  if (Array.isArray(node)) return node.forEach((n) => collectReviews(n, out));
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  if (t === "Review" || (Array.isArray(t) && t.includes("Review"))) out.push(o);
  for (const k of ["@graph", "review", "reviews", "itemListElement", "item"]) if (k in o) collectReviews(o[k], out);
}

/** Reviews the business published on its own page: schema.org Review JSON-LD + <blockquote> with a <cite>/<footer> name. */
export function extractReviews(html: string, pageUrl: string): ReviewCandidate[] {
  const out: ReviewCandidate[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1] ?? "");
    } catch {
      continue;
    }
    const found: unknown[] = [];
    collectReviews(data, found);
    for (const r of found as Array<Record<string, unknown>>) {
      // Reviews syndicated from a review platform belong to that platform's terms: skip them.
      if (THIRD_PARTY.test(nameOf(r.publisher)) || THIRD_PARTY.test(String(r.url ?? "")) || THIRD_PARTY.test(nameOf(r.provider))) continue;
      const text = clean(String(r.reviewBody ?? r.description ?? ""));
      const author = clean(nameOf(r.author));
      const ratingRaw = (r.reviewRating as { ratingValue?: unknown; bestRating?: unknown } | undefined)?.ratingValue;
      const best = Number((r.reviewRating as { bestRating?: unknown } | undefined)?.bestRating ?? 5) || 5;
      const rating = ratingRaw === undefined ? null : Math.round((Number(ratingRaw) / best) * 5);
      if (text && author) out.push({ author, text, rating: Number.isFinite(rating) ? rating : null, sourceUrl: pageUrl });
    }
  }
  for (const m of html.matchAll(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi)) {
    const inner = m[1] ?? "";
    const cite = inner.match(/<(cite|footer)\b[^>]*>([\s\S]*?)<\/\1>/i);
    if (!cite) continue;
    const author = clean(cite[2] ?? "").replace(/^[-–—\s]+/, "");
    const text = clean(inner.replace(cite[0], ""));
    if (THIRD_PARTY.test(inner)) continue;
    if (text && author) out.push({ author, text, rating: null, sourceUrl: pageUrl });
  }
  return out;
}

const BAD = /https?:|www\.|@|\d{3}[-. )]\d{3}|\b(fuck|shit|damn|bitch)\b/i;

/** A plausible person's name as published (2-40 chars, letters/spaces/.-'). */
export function validAuthor(a: string): boolean {
  const s = a.trim();
  return s.length >= 2 && s.length <= 40 && /^[\p{L}][\p{L} .'-]*$/u.test(s) && !/anonymous|customer|client|verified|admin/i.test(s);
}

/** Verbatim excerpt: leading whole sentences up to `maxWords` (null when even the first sentence is too long/short). */
export function spokenExcerpt(text: string, maxWords = REVIEW_MAX_WORDS): string | null {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const out: string[] = [];
  let words = 0;
  for (const s of sentences) {
    const n = s.split(/\s+/).length;
    if (words + n > maxWords) break;
    out.push(s);
    words += n;
  }
  return words >= 8 ? out.join(" ") : null;
}

/** The one review to film: 4-5 stars (or unrated testimonial), named author, clean text, a full-sentence excerpt. */
export function pickReview(reviews: readonly ReviewCandidate[]): (ReviewCandidate & { excerpt: string }) | null {
  const scored = reviews
    .filter((r) => (r.rating === null || r.rating >= 4) && validAuthor(r.author) && !BAD.test(r.text) && r.text.length >= 40 && r.text.length <= 1500)
    .map((r) => ({ r, excerpt: spokenExcerpt(r.text) }))
    .filter((x): x is { r: ReviewCandidate; excerpt: string } => Boolean(x.excerpt))
    .map((x) => {
      const w = x.excerpt.split(/\s+/).length;
      return { ...x, score: (x.r.rating === 5 ? 3 : x.r.rating === 4 ? 1 : 2) + (w >= 15 && w <= 30 ? 2 : 0) + (x.excerpt === x.r.text ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best ? { ...best.r, excerpt: best.excerpt } : null;
}

/** Same-site pages likely to carry reviews (home first, then up to 3 review/testimonial links). */
export function reviewPages(homeUrl: string, homeHtml: string, max = 3): string[] {
  const own = domainOfUrl(homeUrl);
  const out: string[] = [];
  for (const m of homeHtml.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1] ?? "", homeUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || domainOfUrl(u.toString()) !== own || !/review|testimonial|what-?our-?(clients|customers)/i.test(u.pathname)) continue;
    const s = `${u.origin}${u.pathname}`;
    if (!out.includes(s) && out.length < max) out.push(s);
  }
  return out;
}

/** Deterministic actor for a lead (same lead -> same presenter across retries). */
export function pickActorIndex(leadId: string, n: number): number {
  return n <= 0 ? -1 : createHash("sha256").update(leadId).digest().readUInt32BE(0) % n;
}

export function videosLeft(cap: number, startedToday: number): number {
  return Math.max(0, cap - startedToday);
}

// ---------------------------------------------------------------------------
// Cycle

const defaultPage: PageFetcher = async (url, signal) => {
  try {
    const r = await safeFetch(url, { maxBytes: 3 * 1024 * 1024, timeoutMs: 15_000, signal });
    return r.status < 400 && /html|text/i.test(r.contentType) ? { url: r.url, html: r.body.toString("utf8") } : null;
  } catch {
    return null;
  }
};

export interface ReviewDeps {
  db: Db;
  env?: NodeJS.ProcessEnv;
  now: Date;
  /** Sending is live (mailboxes + OUTBOUND_ENABLED + KlySettings.enabled + flag `outbound`): videos only start then. */
  sendingLive: boolean;
  /** Kly spend stop (budget / Codex weekly) or kill switch: no new videos. */
  stop: string | null;
  minScore: number;
  fetchPage?: PageFetcher;
}

export interface ReviewCycle {
  scanned: number;
  found: number;
  started: number;
  ready: number;
  failed: number;
}

/** Find a review on qualified leads' own sites; claim the lead for this system. */
async function scan(d: ReviewDeps, r: ReviewCycle): Promise<void> {
  const { db } = d;
  const leads = await db.outboundLead.findMany({
    where: { status: "found", giftId: null, giftToken: null, system: null, systemData: { equals: Prisma.DbNull }, purgedAt: null, email: { not: "" }, OR: [{ score: null }, { score: { gte: d.minScore } }], NOT: { emailCheck: "invalid" } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: SCAN_PER_CYCLE,
  });
  const fetchPage = d.fetchPage ?? defaultPage;
  for (const lead of leads) {
    r.scanned++;
    let pick: ReturnType<typeof pickReview> = null;
    let brandColor: string | null = null;
    try {
      const home = await fetchPage(lead.website);
      if (home) {
        brandColor = themeColor(home.html);
        const all = extractReviews(home.html, home.url);
        for (const p of reviewPages(home.url, home.html)) {
          const page = await fetchPage(p);
          if (page && domainOfUrl(page.url) === lead.domain) all.push(...extractReviews(page.html, page.url));
        }
        pick = pickReview(all);
      }
    } catch (e) {
      log("warn", "kly review scan failed", { leadId: lead.id, error: errMsg(e) });
    }
    if (!pick) {
      await db.outboundLead.update({ where: { id: lead.id }, data: { systemData: { reviewScan: "none", at: d.now.toISOString() } } });
      continue;
    }
    const token = randomBytes(12).toString("base64url");
    const claimed = await db.$transaction(async (tx) => {
      const c = await tx.outboundLead.updateMany({ where: { id: lead.id, status: "found", giftId: null, giftToken: null, system: null }, data: { system: REVIEW_SYSTEM, status: REVIEW_VIDEO_STATUS, giftToken: token, systemData: { reviewScan: "found", reviewerName: pick.author, at: d.now.toISOString() } } });
      if (c.count !== 1) return false;
      await tx.klyReviewGift.create({ data: { leadId: lead.id, token, businessName: lead.businessName, reviewerName: pick.author, reviewText: pick.excerpt, fullReview: pick.text.slice(0, 4000), rating: pick.rating, sourceUrl: pick.sourceUrl, brandColor } });
      return true;
    });
    if (claimed) {
      r.found++;
      await systemEvent(db, SYSTEM_EVENTS.lead, REVIEW_SYSTEM, { leadId: lead.id, domain: lead.domain });
    }
  }
}

/** Which kind the next video is (pure): the paid presenter only while its own cap (default 0) has room. */
export function nextKind(presenterLeft: number): "quote" | "presenter" {
  return presenterLeft > 0 ? "presenter" : "quote";
}

/** Start capped videos: $0 engine quote videos by default; paid presenter videos only under REVIEW_GIFT_PRESENTER_DAILY_CAP. */
async function start(d: ReviewDeps, r: ReviewCycle): Promise<void> {
  const { db } = d;
  const today = { startedAt: { gte: dayStart(d.now) } };
  const [startedToday, presentersToday] = await Promise.all([db.klyReviewGift.count({ where: today }), db.klyReviewGift.count({ where: { ...today, kind: "presenter" } })]);
  const left = videosLeft(reviewGiftCap(d.env), startedToday);
  if (left === 0) return;
  let presenterLeft = videosLeft(presenterCap(d.env), presentersToday);
  const gifts = await db.klyReviewGift.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: left });
  if (!gifts.length) return;
  for (const g of gifts) {
    const kind = nextKind(presenterLeft);
    const ok = kind === "presenter" ? await startPresenter(d, g) : await startQuote(d, g);
    if (ok) {
      r.started++;
      if (kind === "presenter") presenterLeft--;
    }
  }
}

type GiftRow = NonNullable<Awaited<ReturnType<Db["klyReviewGift"]["findFirst"]>>>;

/** $0: the engine draws the quote video itself (AdJob review_quote_video). */
async function startQuote(d: ReviewDeps, g: GiftRow): Promise<boolean> {
  const lead = await d.db.outboundLead.findUnique({ where: { id: g.leadId }, select: { domain: true } });
  return d.db.$transaction(async (tx) => {
    const c = await tx.klyReviewGift.updateMany({ where: { id: g.id, status: "pending" }, data: { status: "generating", kind: "quote", startedAt: d.now } });
    if (c.count !== 1) return false;
    const payload: ReviewQuotePayload = { giftId: g.id, businessName: g.businessName.slice(0, 120), domain: lead?.domain ?? new URL(g.sourceUrl).hostname, reviewerName: g.reviewerName.slice(0, 60), quote: g.reviewText.slice(0, 600), rating: g.rating && g.rating >= 1 && g.rating <= 5 ? g.rating : null, brandColor: g.brandColor };
    const job = await tx.adJob.create({ data: { type: REVIEW_QUOTE_JOB_TYPE, payload, priority: GIFT_PRIORITY, maxAttempts: 2 }, select: { id: true } });
    await tx.klyReviewGift.update({ where: { id: g.id }, data: { jobId: job.id } });
    return true;
  });
}

/** PAID (~$2.10, FAL): AI presenter through the testimonial pipeline (sender admin's account, no minutes reserved). */
async function startPresenter(d: ReviewDeps, g: GiftRow): Promise<boolean> {
  const { db } = d;
  const sender = await senderWorkspace(db, d.env);
  if (!sender) throw new Error("kly: no sender workspace (set OUTBOUND_GIFT_WORKSPACE_ID or OUTBOUND_ADMIN_EMAIL)");
  const actors = await db.falActor.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, voiceId: true } });
  if (!actors.length) return startQuote(d, g);
  const actor = actors[pickActorIndex(g.leadId, actors.length)] ?? actors[0]!;
  return db.$transaction(async (tx) => {
    const c = await tx.klyReviewGift.updateMany({ where: { id: g.id, status: "pending" }, data: { status: "generating", kind: "presenter", startedAt: d.now } });
    if (c.count !== 1) return false;
    const review = await tx.review.create({ data: { userId: sender.userId, businessName: g.businessName.slice(0, 120), reviewerName: g.reviewerName, reviewText: g.fullReview, rating: g.rating ?? 5, source: "review_gift" } });
    const video = await tx.falCompositeVideo.create({
      data: { userId: sender.userId, reviewId: review.id, actorId: actor.id, fullScript: g.reviewText, hookScript: "", testimonialScript: g.reviewText, ctaScript: "", aspectRatio: "9:16", targetDuration: REVIEW_TARGET_SECONDS, voiceId: actor.voiceId ?? "nova", status: "pending", totalClips: 1, minutesReserved: 0, minutesState: "none", scriptSource: "custom" },
    });
    await tx.falClip.create({ data: { compositeVideoId: video.id, clipType: "testimonial", clipIndex: 0, scriptContent: g.reviewText, status: "pending" } });
    // Verbatim review excerpt as the script: the engine never rewrites a customScript.
    const payload: TestimonialJobPayload = { compositeVideoId: video.id, useAIScript: false, customScript: g.reviewText };
    const job = await tx.adJob.create({ data: { type: TESTIMONIAL_JOB_TYPE, payload, priority: GIFT_PRIORITY, maxAttempts: 2 }, select: { id: true } });
    await tx.falCompositeVideo.update({ where: { id: video.id }, data: { jobId: job.id } });
    await tx.klyReviewGift.update({ where: { id: g.id }, data: { reviewId: review.id, videoId: video.id, jobId: job.id } });
    return true;
  });
}

async function failGift(db: Db, g: { id: string; leadId: string }, error: string): Promise<void> {
  await db.klyReviewGift.update({ where: { id: g.id }, data: { status: "failed", error: error.slice(0, 300) } });
  // Back to the classic Kly flow (keeps reviewScan so it isn't scanned again).
  await db.outboundLead.updateMany({ where: { id: g.leadId, status: REVIEW_VIDEO_STATUS }, data: { status: "found", system: null, giftToken: null, systemData: { reviewScan: "failed" } } });
}

/** Rendered videos -> lead ready to send (status ad_made); failed or stuck ones fall back to the classic flow. */
async function sync(d: ReviewDeps, r: ReviewCycle): Promise<void> {
  const { db } = d;
  const gifts = await db.klyReviewGift.findMany({ where: { status: "generating" }, take: 50 });
  for (const g of gifts) {
    if (g.kind === "quote") {
      const job = g.jobId ? await db.adJob.findUnique({ where: { id: g.jobId }, select: { status: true, lastError: true } }) : null;
      if (g.videoKey) {
        await db.klyReviewGift.update({ where: { id: g.id }, data: { status: "ready", readyAt: d.now, costMicros: 0 } });
        await db.outboundLead.updateMany({ where: { id: g.leadId, status: REVIEW_VIDEO_STATUS }, data: { status: "ad_made", qualityNotes: "review quote video gift", error: null } });
        await systemEvent(db, SYSTEM_EVENTS.gift, REVIEW_SYSTEM, { leadId: g.leadId, kind: "quote", costMicros: 0 });
        r.ready++;
      } else if (!job || job.status === "dead" || job.status === "canceled" || (g.startedAt && d.now.getTime() - g.startedAt.getTime() > REVIEW_STUCK_MS)) {
        await failGift(db, g, job?.lastError ?? (job ? `quote video ${job.status}` : "job missing"));
        r.failed++;
      }
      continue;
    }
    const v = g.videoId ? await db.falCompositeVideo.findUnique({ where: { id: g.videoId }, select: { status: true, finalVideoUrl: true, costMicros: true, errorMessage: true } }) : null;
    if (v?.status === "completed" && v.finalVideoUrl) {
      await db.klyReviewGift.update({ where: { id: g.id }, data: { status: "ready", videoUrl: v.finalVideoUrl, costMicros: v.costMicros, readyAt: d.now } });
      await db.outboundLead.updateMany({ where: { id: g.leadId, status: REVIEW_VIDEO_STATUS }, data: { status: "ad_made", qualityNotes: "review video gift", error: null } });
      await addCost(db, g.leadId, v.costMicros, d.now);
      await systemEvent(db, SYSTEM_EVENTS.gift, REVIEW_SYSTEM, { leadId: g.leadId, kind: "presenter", costMicros: Number(v.costMicros) });
      r.ready++;
    } else if (!v || v.status === "failed" || (g.startedAt && d.now.getTime() - g.startedAt.getTime() > REVIEW_STUCK_MS)) {
      if (v?.costMicros) await addCost(db, g.leadId, v.costMicros, d.now);
      await failGift(db, g, v?.errorMessage ?? (v ? "video stuck" : "video missing"));
      r.failed++;
    }
  }
}

/** One review_gifts cycle. Kill switch first; heartbeat always (outputs = leads found + videos ready + emails sent). */
export async function reviewGiftsCycle(d: ReviewDeps, sentSinceLast: number): Promise<ReviewCycle | null> {
  if (!(await systemEnabled(d.db, REVIEW_SYSTEM))) return null;
  const r: ReviewCycle = { scanned: 0, found: 0, started: 0, ready: 0, failed: 0 };
  try {
    await sync(d, r);
    if (!d.stop) {
      // Only look for more while the pipeline is short (a couple of days of the cap).
      const pending = await d.db.klyReviewGift.count({ where: { status: "pending" } });
      if (pending < Math.max(2, reviewGiftCap(d.env) * 2)) await scan(d, r);
      if (d.sendingLive) await start(d, r);
    }
    await recordSystemRun(d.db, REVIEW_SYSTEM, { ok: true, outputs: r.found + r.ready + sentSinceLast }, d.now);
    return r;
  } catch (e) {
    await recordSystemRun(d.db, REVIEW_SYSTEM, { ok: false, outputs: r.found + r.ready + sentSinceLast, error: errMsg(e) }, d.now);
    throw e;
  }
}
