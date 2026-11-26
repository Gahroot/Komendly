// Ozzy short-video (Reels/Shorts/TikTok) pipeline: PURE core shared by web, engine and kly (no Next/Prisma/Node imports).
// Hormozi content unit ($100M Leads ch.6-7): HOOK (first 3s, calls out the exact person) -> RETAIN (list/steps/story)
// -> REWARD (a real, useful tip or ad makeover). "How I", not "how to". Give:ask ~ 10:1 (one soft CTA every 10th reel).
// Honest: AI-made, labelled "Made by Ozzy, AI"; no real customers/results/footage claimed; no promised leads/sales.
// Flag: AdsFeatureFlag `sys_reels` (default OFF). Events (AdsEvent.name): see REEL_EVENTS. Docs: docs/growth-ecosystem/reels.md.

export const REEL_EVENTS = {
  ready: "reel_ready", // props: ReelReadyProps (engine rendered silent.mp4 + script, captions reviewed)
  voiced: "reel_voiced", // props: { reelId, key } external-voice mp4 came back (preferred over silent)
  published: "reel_published", // props: { reelId, platform, postId, slot, day }
  paused: "reel_paused", // props: { platform, reason }  auth/policy error: stop until reel_resumed
  resumed: "reel_resumed", // props: { platform }
  insights: "reel_insights", // props: { reelId, platform, metrics, unavailable? }
  learning: "reel_learning", // props: { week, markdown, winners, suspended }
  spend: "reel_spend", // props: { micros, what }  estimated generation spend (daily cost cap)
  queue: "social_queue", // props: QueueProps (other platforms, consumed by the desktop publisher)
} as const;

export const REEL_PLATFORMS = ["facebook", "instagram"] as const;
export type ReelPlatform = (typeof REEL_PLATFORMS)[number];
export const QUEUE_PLATFORMS = ["youtube_shorts", "tiktok", "linkedin", "x", "pinterest", "threads"] as const;
export type QueuePlatform = (typeof QUEUE_PLATFORMS)[number];

export const SITE = "https://www.komendly.com";
export const AI_LABEL = "Made by Ozzy, AI";
export const CTA_LINE = "Free ads from your website, link in bio";
export const GIVE_PER_ASK = 10;
export type ReelFormat = "tip_list" | "makeover" | "how_i";
export const REEL_FORMATS: readonly ReelFormat[] = ["tip_list", "makeover", "how_i"];

// ---- hook library -------------------------------------------------------------------------------------------------

export interface ReelTrade {
  slug: string;
  /** Call-out used in the hook: "Roofers: ..." */
  callout: string;
  /** "your roofing company" */
  yours: string;
  /** Three honest, generally-true tips (the REWARD of tip_list). */
  tips: [string, string, string];
  /** Makeover: a weak ad line and a better one (generic examples, never a real business's ad). */
  before: string;
  after: string;
  /** Hand-picked Ozzy sample video poster (public/studio-examples/<x>.jpg) when we have one. */
  poster?: string;
}

export const REEL_TRADES: readonly ReelTrade[] = [
  { slug: "roofers", callout: "Roofers", yours: "your roofing company", poster: "roofer",
    tips: ["Show a real before-and-after of one roof", "Name your town in the first line", "Finish with one next step: book a free inspection"],
    before: "Quality roofing services. Call today.", after: "Leaking roof in Dayton? Book a free inspection this week." },
  { slug: "plumbers", callout: "Plumbers", yours: "your plumbing business", poster: "plumber",
    tips: ["Lead with the problem people panic about, like a burst pipe", "Show your van or your crew, not a stock photo", "Say how fast you reply, only if it's true"],
    before: "Best plumber in town!", after: "Dripping tap or blocked drain? Tell us the problem, we'll book you in." },
  { slug: "hvac", callout: "HVAC owners", yours: "your HVAC company",
    tips: ["Run the ad before the first hot or cold snap", "Offer a tune-up, not a discount on everything", "One service per ad"],
    before: "Heating and cooling experts.", after: "Furnace making noises? Book a tune-up before winter." },
  { slug: "landscapers", callout: "Landscapers", yours: "your landscaping business", poster: "landscaper",
    tips: ["Your best project photo is the whole ad", "Mention the neighbourhood you work in", "Seasonal offers beat year-round ones"],
    before: "We do all your lawn needs.", after: "Spring clean-up for Maple Street lawns. Book your slot." },
  { slug: "cleaning-services", callout: "Cleaners", yours: "your cleaning business",
    tips: ["Show a clean room, not a logo", "Pick one service per ad: move-out, weekly, deep clean", "Say what's included in plain words"],
    before: "Professional cleaning company.", after: "Moving out? A deep clean that gets your deposit back." },
  { slug: "electricians", callout: "Electricians", yours: "your electrical business",
    tips: ["Lead with safety, not price", "Show a licensed badge only if you hold it", "One job per ad: panel upgrade, EV charger, lighting"],
    before: "Electrical services at great prices.", after: "Tripping breaker? Get the panel checked by a licensed electrician." },
  { slug: "pest-control", callout: "Pest control pros", yours: "your pest control company",
    tips: ["Name the pest in the first line", "Run it when that pest is in season", "Say what happens after the call, step by step"],
    before: "Pest control you can trust.", after: "Ants in the kitchen? Here's what we do on day one." },
  { slug: "painters", callout: "Painters", yours: "your painting company",
    tips: ["Before-and-after on one wall sells the job", "Name the room or the exterior, not just 'painting'", "Say how you protect floors and furniture"],
    before: "Quality painting, affordable prices.", after: "Fresh coat on the front of your house, floors and plants protected." },
];

export interface Hook { id: string; trade: string; format: ReelFormat; text: string }

/** Every hook starts with the person it's for (the 3-second call-out). */
export function hookLibrary(): Hook[] {
  const out: Hook[] = [];
  for (const t of REEL_TRADES) {
    out.push({ id: `${t.slug}:tips`, trade: t.slug, format: "tip_list", text: `${t.callout}: 3 things your Facebook ad needs` });
    out.push({ id: `${t.slug}:tips-first-line`, trade: t.slug, format: "tip_list", text: `${t.callout}: fix the first line of your ad` });
    out.push({ id: `${t.slug}:makeover`, trade: t.slug, format: "makeover", text: `${t.callout}: I fixed this weak ad` });
    out.push({ id: `${t.slug}:makeover-skip`, trade: t.slug, format: "makeover", text: `${t.callout}: would you scroll past this ad?` });
    out.push({ id: `${t.slug}:how-i`, trade: t.slug, format: "how_i", text: `${t.callout}: how I turn a website into an ad` });
  }
  return out;
}

export function hookById(id: string): Hook | undefined {
  return hookLibrary().find((h) => h.id === id);
}

// ---- script ---------------------------------------------------------------------------------------------------------

export type SceneKind = "hook" | "retain" | "reward" | "cta" | "end";
export interface ReelScene { kind: SceneKind; /** On-screen caption, burned in. */ text: string; seconds: number; /** Ozzy art file (public/brand) or "poster". */ art?: string }
export interface ReelScript { hookId: string; trade: string; format: ReelFormat; withCta: boolean; scenes: ReelScene[]; voiceover: string; seconds: number }

const ART = ["ozzy-classic-happy.png", "ozzy-explorer-focused.png", "ozzy-creator-focused.png", "ozzy-adventurer-cool.png", "ozzy-developer-excited.png"];
const secs = (text: string, min: number) => Math.max(min, Math.round((text.split(/\s+/).length / 2.8) * 10) / 10);

export function buildScript(hook: Hook, withCta: boolean): ReelScript {
  const t = REEL_TRADES.find((x) => x.slug === hook.trade);
  if (!t) throw new Error(`unknown trade ${hook.trade}`);
  const sc: ReelScene[] = [{ kind: "hook", text: hook.text, seconds: 3, art: ART[0] }];
  if (hook.format === "tip_list") {
    sc.push({ kind: "retain", text: `Here's what I'd do for ${t.yours}. Three steps.`, seconds: 3, art: ART[1] });
    t.tips.forEach((tip, i) => sc.push({ kind: i === 2 ? "reward" : "retain", text: `${i + 1}. ${tip}`, seconds: secs(tip, 4), art: ART[(i + 2) % ART.length] }));
  } else if (hook.format === "makeover") {
    sc.push({ kind: "retain", text: `Before (a made-up example): "${t.before}"`, seconds: 4.5, art: ART[1] });
    sc.push({ kind: "retain", text: "Problem: it could be anyone. No place, no problem, no next step.", seconds: 4.5, art: ART[2] });
    sc.push({ kind: "reward", text: `After: "${t.after}"`, seconds: 5, art: ART[3] });
  } else {
    sc.push({ kind: "retain", text: "I read the website. I pick the one thing customers care about.", seconds: 4, art: ART[1] });
    sc.push({ kind: "retain", text: "I write the first line for the person, not for everyone.", seconds: 4, art: ART[2] });
    sc.push({ kind: "reward", text: `Then one clear next step. Here's one I made for ${t.callout.toLowerCase()}.`, seconds: 5, art: t.poster ? "poster" : ART[3] });
  }
  sc.push(withCta ? { kind: "cta", text: CTA_LINE, seconds: 3.5, art: ART[4] } : { kind: "end", text: "Follow for a new ad tip daily", seconds: 2.5, art: ART[4] });
  sc.push({ kind: "end", text: AI_LABEL, seconds: 2, art: ART[0] });
  // Net length: scenes crossfade 0.4s into each other (engine/src/growth/reels.ts).
  const seconds = Math.round((sc.reduce((a, s) => a + s.seconds, 0) - 0.4 * (sc.length - 1)) * 10) / 10;
  const voiceover = sc.filter((s) => s.text !== AI_LABEL).map((s) => s.text).join(" ");
  return { hookId: hook.id, trade: hook.trade, format: hook.format, withCta, scenes: sc, voiceover, seconds };
}

const HYPE = /\b(guarantee[ds]?|roi|skyrocket|explode|10x|viral|act now|limited time|last chance|urgent|hurry|don'?t miss|best in|#1|number one|100%|millions?|instant(ly)? (results|sales)|more (leads|sales|customers)|get rich)\b/i;
const FAKE = /\b(real customer|testimonial|unscripted|real footage|actual client|i made \$|we made \$|results? (in|within) \d)/i;

/** Null = OK. On-screen script rules: 15-30s, hook in the first 3s calls out the person, one CTA at most, no hype/fake proof. */
export function checkScript(s: ReelScript): string | null {
  if (s.seconds < 15 || s.seconds > 30) return `length ${s.seconds}s outside 15-30s`;
  const first = s.scenes[0];
  if (!first || first.kind !== "hook" || first.seconds > 3.05) return "first scene must be a hook of <=3s";
  const t = REEL_TRADES.find((x) => x.slug === s.trade);
  if (!t || !first.text.startsWith(`${t.callout}:`)) return "hook must call out the person";
  if (s.scenes.filter((x) => x.kind === "cta").length > 1 || (s.withCta && s.scenes.filter((x) => x.kind === "cta").length !== 1)) return "exactly one CTA when withCta, never more";
  if (!s.scenes.some((x) => x.kind === "reward")) return "no reward scene";
  if (!s.scenes.some((x) => x.text === AI_LABEL)) return "missing AI label";
  for (const sc of s.scenes) {
    if (HYPE.test(sc.text)) return `hype or promise: "${sc.text}"`;
    if (FAKE.test(sc.text)) return `fake-proof wording: "${sc.text}"`;
    if (sc.text.length > 110) return "scene text too long to read";
  }
  return null;
}

/** Give:ask. true when this reel (0-based count of reels already published) should carry the soft CTA: every 10th. */
export function ctaDue(publishedCount: number): boolean {
  return (publishedCount + 1) % GIVE_PER_ASK === 0;
}

/** Stable duplicate key: hook + the asset it was built on. */
export function reelHash(hookId: string, asset: string): string {
  let h = 5381;
  for (const c of `${hookId}|${asset}`) h = ((h * 33) ^ c.codePointAt(0)!) >>> 0;
  return h.toString(36);
}
export const reelId = (hookId: string, day: string, n: number) => `${day}-${hookId.replace(/[^a-z0-9]+/gi, "-")}-${n}`;

// ---- captions + links -----------------------------------------------------------------------------------------------

export function reelLink(platform: string, hookId: string, path = "/free-ads"): string {
  const u = new URL(SITE + path);
  u.searchParams.set("utm_source", platform);
  u.searchParams.set("utm_medium", "reel");
  u.searchParams.set("utm_campaign", hookId.replace(/[^a-z0-9:_-]/gi, "-"));
  return u.toString();
}
/** Bio link to paste into the Page/IG/TikTok profile once (attribution for "link in bio"). */
export const bioLink = (platform: string) => reelLink(platform, "bio");

export interface CaptionInput { script: ReelScript; trade: ReelTrade }
export function buildCaption(platform: ReelPlatform | QueuePlatform, s: ReelScript): string {
  const t = REEL_TRADES.find((x) => x.slug === s.trade)!;
  const body = s.format === "makeover" ? `A weak ${t.callout.toLowerCase()} ad, fixed. The "before" is a made-up example, not a real business.`
    : s.format === "how_i" ? `How I turn a website into a Facebook ad for ${t.yours}.`
    : `Three things a Facebook ad for ${t.yours} needs.`;
  const tags = "#SmallBusiness #FacebookAds";
  const cta = s.withCta ? (platform === "facebook" ? `${CTA_LINE.replace(", link in bio", "")}: ${reelLink("facebook", s.hookId)}` : CTA_LINE) : "";
  return [body, cta, `${AI_LABEL}. This is an animated cartoon.`, tags].filter(Boolean).join("\n\n");
}

const hashtagCount = (t: string) => (t.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
/** Null = OK. Applies to all platforms; links only where the platform allows (Facebook, LinkedIn, X, Threads captions). */
export function checkReelCaption(text: string, platform: ReelPlatform | QueuePlatform, opts: { withCta?: boolean; hookId?: string } = {}): string | null {
  const t = text.trim();
  if (t.length < 40) return "too short";
  if (!t.includes(AI_LABEL)) return "missing AI disclosure";
  if (HYPE.test(t) || FAKE.test(t)) return "hype, promise or fake-proof wording";
  if (hashtagCount(t) > 3) return "too many hashtags";
  if (/[<>]/.test(t)) return "markup";
  const urls = t.match(/https?:\/\/\S+/g) ?? [];
  const linkOk = platform === "facebook" || (platform !== "instagram" && platform !== "tiktok");
  if (!linkOk && urls.length) return `${platform} captions can't hold links`;
  if (urls.length > 1) return "more than one link";
  if (urls[0]) {
    if (!opts.withCta) return "link without CTA (give:ask)";
    const u = new URL(urls[0]);
    if (u.searchParams.get("utm_medium") !== "reel" || u.searchParams.get("utm_source") !== platform || (opts.hookId && u.searchParams.get("utm_campaign") !== opts.hookId.replace(/[^a-z0-9:_-]/gi, "-"))) return "link missing reel UTM";
  }
  if (opts.withCta && !urls[0] && !/link in bio/i.test(t)) return "CTA missing";
  if (!opts.withCta && /link in bio|free ads from your website/i.test(t)) return "CTA on a give-only reel";
  return null;
}

// ---- caps, jitter, pause ---------------------------------------------------------------------------------------------

export const DEFAULT_REELS_PER_DAY = 1;
export const MAX_REELS_PER_DAY = 3;
export function dailyCap(env: { REELS_PER_DAY?: string }): number {
  const n = Math.floor(Number(env.REELS_PER_DAY));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_REELS_PER_DAY) : DEFAULT_REELS_PER_DAY;
}
/** KlySocialPost.platform value for the Nth reel of the day: unique(day, platform) gives one claim per slot. */
export const reelSlotPlatform = (p: ReelPlatform, slot: number) => `${p}_reel:${slot}`;
export function parseSlotPlatform(v: string): { platform: ReelPlatform; slot: number } | null {
  const m = /^(facebook|instagram)_reel:(\d)$/.exec(v);
  return m ? { platform: m[1] as ReelPlatform, slot: Number(m[2]) } : null;
}
function hash32(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0)!, 16777619) >>> 0;
  return h;
}
/** Deterministic 0..spreadMinutes-1 offset so times differ per day/platform/slot (no fixed robotic schedule). */
export function jitterMinutes(day: string, platform: string, slot: number, spreadMinutes = 180): number {
  return hash32(`${day}|${platform}|${slot}`) % spreadMinutes;
}
/** True once `now` (minutes since ET midnight) passed hourEt + jitter, with slots spaced >= 4h apart. */
export function reelDue(etMinutes: number, hourEt: number, day: string, platform: string, slot: number): boolean {
  return etMinutes >= hourEt * 60 + jitterMinutes(day, platform, slot) + (slot - 1) * 240;
}
/** Static daily post stands in for the reel when no reel is ready by this many hours after the posting hour. */
export const STATIC_FALLBACK_HOURS = 4;
export function staticShouldYield(o: { reelsOn: boolean; reelPostedToday: boolean; reelReady: boolean; etHour: number; hourEt: number; paused: boolean }): boolean {
  if (!o.reelsOn || o.paused) return false;
  if (o.reelPostedToday) return true;
  return o.reelReady && o.etHour < o.hourEt + STATIC_FALLBACK_HOURS;
}

const AUTH_POLICY = /OAuthException|invalid.*token|token.*(expired|invalid)|session has expired|\(#(10|200|283|190|368)\)|\b(code|status) ?(190|368|10|200)\b|permission|not authorized|policy|spam|restricted|violat|blocked|disabled|suspended|too many/i;
/** Auth / permission / policy error: stop retrying and pause the platform (never hammer a flagged account). */
export function isAuthOrPolicyError(msg: string): boolean {
  return AUTH_POLICY.test(msg);
}
export interface PauseEvent { name: string; props: unknown; createdAt: Date }
/** Latest of reel_paused / reel_resumed for the platform decides. `events` in any order. */
export function isPaused(events: readonly PauseEvent[], platform: string): boolean {
  const mine = events.filter((e) => (e.name === REEL_EVENTS.paused || e.name === REEL_EVENTS.resumed) && (e.props as { platform?: string } | null)?.platform === platform);
  mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return mine[0]?.name === REEL_EVENTS.paused;
}
export const DEFAULT_DAILY_COST_CAP_MICROS = 500_000;
export function withinCostCap(spentTodayMicros: number, nextMicros: number, env: { REELS_DAILY_COST_CAP_MICROS?: string }): boolean {
  const cap = Number(env.REELS_DAILY_COST_CAP_MICROS);
  return spentTodayMicros + nextMicros <= (Number.isFinite(cap) && cap >= 0 && env.REELS_DAILY_COST_CAP_MICROS ? cap : DEFAULT_DAILY_COST_CAP_MICROS);
}

export interface ReelReadyProps {
  reelId: string; hookId: string; trade: string; format: ReelFormat; seconds: number; withCta: boolean; hash: string;
  key: string; scriptKey: string; day: string; script: string;
  captions: Record<ReelPlatform, string>; costMicros: number;
}

// ---- publish queue (other platforms) ------------------------------------------------------------------------------------

export interface PlatformSpec { label: string; titleMax: number | null; captionMax: number; links: boolean; maxSeconds: number; aiLabelNote: string; needs: string }
export const PLATFORM_SPECS: Record<QueuePlatform, PlatformSpec> = {
  youtube_shorts: { label: "YouTube Shorts", titleMax: 100, captionMax: 5000, links: true, maxSeconds: 180, aiLabelNote: "tick 'altered or synthetic content' in YouTube Studio", needs: "YouTube Data API videos.insert from an UNVERIFIED API project is forced private; needs API compliance audit, else upload in YouTube Studio" },
  tiktok: { label: "TikTok", titleMax: null, captionMax: 2200, links: false, maxSeconds: 600, aiLabelNote: "turn on 'AI-generated content' label", needs: "Content Posting API: unaudited clients post private-only; needs audit. Otherwise upload in TikTok web by the logged-in desktop agent" },
  linkedin: { label: "LinkedIn", titleMax: 200, captionMax: 3000, links: true, maxSeconds: 600, aiLabelNote: "state AI-made in the text", needs: "Community Management API approval for the Page, else post in the logged-in browser" },
  x: { label: "X", titleMax: null, captionMax: 280, links: true, maxSeconds: 140, aiLabelNote: "state AI-made in the text", needs: "X API v2 media upload + paid API tier, else post in the logged-in browser" },
  pinterest: { label: "Pinterest video", titleMax: 100, captionMax: 800, links: true, maxSeconds: 900, aiLabelNote: "state AI-made in the description", needs: "Pinterest API Standard access (trial = sandbox only), else logged-in browser" },
  threads: { label: "Threads", titleMax: null, captionMax: 500, links: true, maxSeconds: 300, aiLabelNote: "state AI-made in the text", needs: "Threads API (threads_content_publish) via the same Meta app; test-user/admin accounts work in dev mode" },
};

export type QueueStatus = "queued" | "publishing" | "posted" | "failed" | "paused";
export interface QueueProps {
  reelId: string; platform: QueuePlatform; title: string; caption: string; hashtags: string[]; link: string | null;
  status: QueueStatus; attempts: number; nextAttemptAt: string | null; lastError: string | null; postUrl: string | null; withCta: boolean; hookId: string;
}
export const MAX_QUEUE_ATTEMPTS = 5;

/** Per-platform title/caption/hashtags, trimmed to the platform and checked; returns an error string instead of an unchecked item. */
export function buildQueueItem(platform: QueuePlatform, s: ReelScript, reelIdValue: string): QueueProps | string {
  const spec = PLATFORM_SPECS[platform];
  const hook = s.scenes[0]!.text;
  const hashtags = platform === "youtube_shorts" ? ["#Shorts", "#SmallBusiness"] : ["#SmallBusiness", "#FacebookAds"];
  const withLink = spec.links && s.withCta;
  const link = withLink ? reelLink(platform, s.hookId) : null;
  const t = REEL_TRADES.find((x) => x.slug === s.trade)!;
  const core = s.format === "makeover" ? `A weak ${t.callout.toLowerCase()} ad, fixed (the "before" is made up).` : s.format === "how_i" ? `How I turn a website into an ad for ${t.yours}.` : `3 things a Facebook ad for ${t.yours} needs.`;
  const parts = [core, link ? `${CTA_LINE.replace(", link in bio", "")}: ${link}` : s.withCta ? CTA_LINE : "", `${AI_LABEL}. Animated cartoon.`, hashtags.join(" ")].filter(Boolean);
  let caption = parts.join("\n\n");
  if (caption.length > spec.captionMax) caption = [core, `${AI_LABEL}.`, hashtags[0]].join(" ").slice(0, spec.captionMax);
  const title = platform === "youtube_shorts" ? `${hook} #Shorts`.slice(0, spec.titleMax ?? 100) : spec.titleMax ? hook.slice(0, spec.titleMax) : hook;
  const bad = checkReelCaption(caption, platform, { withCta: s.withCta && (!spec.links || Boolean(link)), hookId: s.hookId });
  if (bad && !(spec.links === false && s.withCta && bad === "CTA missing")) return `${platform}: ${bad}`;
  if (s.seconds > spec.maxSeconds) return `${platform}: video too long`;
  return { reelId: reelIdValue, platform, title, caption, hashtags, link, status: "queued", attempts: 0, nextAttemptAt: null, lastError: null, postUrl: null, withCta: s.withCta, hookId: s.hookId };
}

/** Next queue state after a publish attempt (pure). Auth/policy errors pause (no retry); others back off 1h,2h,4h... */
export function nextQueueState(item: QueueProps, r: { ok: true; postUrl?: string } | { ok: false; error: string }, now: Date): QueueProps {
  if (r.ok) return { ...item, status: "posted", postUrl: r.postUrl ?? item.postUrl, lastError: null, nextAttemptAt: null };
  const attempts = item.attempts + 1;
  if (isAuthOrPolicyError(r.error)) return { ...item, status: "paused", attempts, lastError: r.error.slice(0, 300), nextAttemptAt: null };
  if (attempts >= MAX_QUEUE_ATTEMPTS) return { ...item, status: "failed", attempts, lastError: r.error.slice(0, 300), nextAttemptAt: null };
  return { ...item, status: "queued", attempts, lastError: r.error.slice(0, 300), nextAttemptAt: new Date(now.getTime() + 3_600_000 * 2 ** (attempts - 1)).toISOString() };
}
export const queueItemDue = (i: QueueProps, now: Date) => i.status === "queued" && (!i.nextAttemptAt || new Date(i.nextAttemptAt).getTime() <= now.getTime());
