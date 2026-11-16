// Ozzy's daily organic post to Komendly's OWN Facebook Page + Instagram business account (framework-free; used by
// kly/src/social.ts and the admin connect routes). Consent rule: only Komendly-owned samples, Ozzy art, or ads whose
// owner explicitly consented via "Ad of the week" (AdsFeature status consented | shortlisted | featured) are posted.

export const SOCIAL_SITE = "https://www.komendly.com";
export const SOCIAL_CAMPAIGN = "ozzy-daily";
/** Same statuses /api/ad-of-the-week serves publicly (src/lib/ads/feature-assets.ts PUBLIC_FEATURE_STATUSES). */
export const SOCIAL_CONSENTED_STATUSES = ["consented", "shortlisted", "featured"] as const;
/** Facebook Login scopes for publishing to the owner's Page and its linked Instagram business account. */
export const SOCIAL_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management", "instagram_basic", "instagram_content_publish"] as const;
export const SOCIAL_TZ = "America/New_York";
export const MAX_HASHTAGS = 3;

export type SocialPlatform = "facebook" | "instagram";
export type SourceKind = "showcase" | "example" | "tip";

export interface SocialContent {
  kind: SourceKind;
  /** Stable key (adId, example path, tip key): used to avoid repeats. */
  ref: string;
  /** Public image URL for the Facebook photo post. */
  imageUrl: string;
  /** Public JPEG URL for Instagram (IG only takes JPEG). */
  igImageUrl: string;
  /** Public MP4 (9:16, H.264/AAC): when set, the post is a Page video + Instagram Reel instead of a photo. */
  videoUrl?: string;
  /** Instagram-only video (tips: photo on Facebook, Reel on Instagram). */
  igVideoUrl?: string;
  /** What the post is about, for the caption writer. */
  brief: string;
  /** Consented showcase only: the business's name / handle to credit. */
  brandName?: string | null;
  handle?: string | null;
}

export function socialLink(platform: SocialPlatform): string {
  return `${SOCIAL_SITE}/free-ads?utm_source=${platform}&utm_medium=organic&utm_campaign=${SOCIAL_CAMPAIGN}`;
}

// ---------------------------------------------------------------------------
// Time (America/New_York)

function etParts(now: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: SOCIAL_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

export function etDay(now: Date): string {
  return etParts(now).day;
}

export function etHour(now: Date): number {
  return etParts(now).hour;
}

// ---------------------------------------------------------------------------
// Gate: off unless switched on AND the owner connected the Page.

export interface SocialGateInput {
  socialEnabled: boolean;
  socialHourEt: number;
  connected: boolean;
  hasTokenKey: boolean;
  now: Date;
}

/** Null = may post now; otherwise why not. */
export function socialGate(g: SocialGateInput): string | null {
  if (!g.socialEnabled) return "switched off";
  if (!g.connected) return "Komendly Page not connected";
  if (!g.hasTokenKey) return "ADS_TOKEN_KEY not set";
  if (etHour(g.now) < g.socialHourEt) return "not posting hour yet";
  return null;
}

// ---------------------------------------------------------------------------
// Content pool

// Every example is a 9:16 MP4 with a same-named .jpg poster frame. Post the video (a poster still looks like a frozen clip).
const EXAMPLES: ReadonlyArray<{ path: string; brief: string }> = [
  { path: "/studio-examples/dentist.mp4", brief: "a short video ad Ozzy made from a dental clinic's website" },
  { path: "/studio-examples/plumber.mp4", brief: "a short video ad Ozzy made from a plumber's website" },
  { path: "/studio-examples/roofer.mp4", brief: "a short video ad Ozzy made from a roofing company's website" },
  { path: "/studio-examples/landscaper.mp4", brief: "a short video ad Ozzy made from a landscaper's website" },
  { path: "/studio-examples/dessert.mp4", brief: "a short video ad Ozzy made from a dessert shop's website" },
  { path: "/studio-examples/ad43.mp4", brief: "a short video ad Ozzy made from a small business's website" },
  { path: "/studio-examples/ad08.mp4", brief: "a short video ad Ozzy made from a small business's website" },
  { path: "/studio-examples/ad53.mp4", brief: "a short video ad Ozzy made from a small business's website" },
  { path: "/studio-examples/ozzy-v07.mp4", brief: "Ozzy himself in a short video, showing how he turns a website into ads" },
  { path: "/studio-examples/ozzy-v10.mp4", brief: "Ozzy himself in a short video, showing how he turns a website into ads" },
  { path: "/examples/dental-priya.mp4", brief: "a testimonial-style video ad Komendly made for a dental clinic with an AI presenter talking to camera about check-ups (don't call her a real patient or say it is unscripted)" },
];
const poster = (mp4: string) => mp4.replace(/\.mp4$/, ".jpg");

const TIPS: ReadonlyArray<{ key: string; art: string; brief: string }> = [
  { key: "tip-one-message", art: "ozzy-classic-happy.png", brief: "ad tip: one ad, one message. Pick the single thing customers love most" },
  { key: "tip-first-line", art: "ozzy-explorer-focused.png", brief: "ad tip: the first line does the heavy lifting, say who it's for straight away" },
  { key: "tip-real-photos", art: "ozzy-adventurer-cool.png", brief: "ad tip: real photos of your work beat stock photos" },
  { key: "tip-clear-ask", art: "ozzy-creator-focused.png", brief: "ad tip: end with one clear next step (call, book, visit)" },
  { key: "tip-test-two", art: "ozzy-developer-excited.png", brief: "ad tip: run two versions side by side and keep the winner" },
  { key: "tip-local", art: "ozzy-joyful-happy.png", brief: "ad tip: mention your town or neighbourhood, local beats generic" },
  { key: "tip-square-vertical", art: "ozzy-ascended-happy.png", brief: "ad tip: make a square and a vertical version so it fits feed and stories" },
  { key: "tip-offer", art: "ozzy-classic-love.png", brief: "ad tip: a small, honest offer gives people a reason to act today" },
];

/** Komendly-owned examples + tips; consented showcases are added by the caller. */
export function ownedContent(site = SOCIAL_SITE): SocialContent[] {
  const examples = EXAMPLES.map((e): SocialContent => ({ kind: "example", ref: e.path, imageUrl: site + poster(e.path), igImageUrl: site + poster(e.path), videoUrl: site + e.path, brief: e.brief }));
  // Tips: Ozzy art photo on Facebook; IG can't take PNG, so the tip goes out as a Reel of one of our example videos.
  const tips = TIPS.map((t, i): SocialContent => {
    const ex = EXAMPLES[i % EXAMPLES.length] ?? EXAMPLES[0];
    return { kind: "tip", ref: t.key, imageUrl: `${site}/brand/${t.art}`, igImageUrl: site + poster(ex?.path ?? ""), igVideoUrl: site + (ex?.path ?? ""), brief: t.brief };
  });
  return [...examples, ...tips];
}

export function showcaseContent(f: { adId: string; brandName: string | null; handle: string | null }, site = SOCIAL_SITE): SocialContent {
  const url = `${site}/api/ad-of-the-week/${encodeURIComponent(f.adId)}`;
  return { kind: "showcase", ref: f.adId, imageUrl: url, igImageUrl: url, brief: `a real customer's ad made by Ozzy, shared with their permission${f.brandName ? ` (${f.brandName})` : ""}`, brandName: f.brandName, handle: f.handle };
}

/**
 * Next post's content. Kind rotates by day (tip on odd days, showcase/example otherwise; showcases first);
 * never-used refs first, then the least recently used. `recent` = previously posted refs with their date.
 */
export function pickContent(pool: readonly SocialContent[], recent: ReadonlyArray<{ ref: string; at: Date }>, day: string): SocialContent | null {
  if (!pool.length) return null;
  const last = new Map<string, number>();
  for (const r of recent) last.set(r.ref, Math.max(last.get(r.ref) ?? 0, r.at.getTime()));
  const dayNum = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const wantTip = dayNum % 2 === 1;
  const rank = (c: SocialContent) => (wantTip ? (c.kind === "tip" ? 0 : 1) : c.kind === "showcase" ? 0 : c.kind === "example" ? 1 : 2);
  const lastOf = (c: SocialContent) => last.get(c.ref) ?? -1;
  return [...pool].sort((a, b) => lastOf(a) - lastOf(b) || rank(a) - rank(b) || a.ref.localeCompare(b.ref))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Captions (same spirit as the outbound BANNED rules: no hype, no promises)

const HYPE = /\b(guarantee[ds]?|guaranteed results|roi|skyrocket|explode|10x|viral|act now|limited time|last chance|urgent|hurry|don'?t miss|best in|#1|number one|free forever|100%|millions?|instant(ly)? (results|sales))\b|!{2,}|\$\d/i;

export function hashtagCount(text: string): number {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

/** Null = OK, else the reason the caption is rejected. */
export function checkCaption(text: string, platform: SocialPlatform): string | null {
  const t = text.trim();
  if (t.length < 40) return "too short";
  if (t.length > (platform === "facebook" ? 600 : 700)) return "too long";
  if (HYPE.test(t)) return "hype or promise";
  if (hashtagCount(t) > MAX_HASHTAGS) return "too many hashtags";
  if (/[<>]/.test(t)) return "markup";
  const urls = t.match(/https?:\/\/\S+/g) ?? [];
  if (platform === "facebook") {
    if (urls.length !== 1 || urls[0] !== socialLink("facebook")) return "needs the Facebook link exactly once";
  } else {
    if (urls.length || /www\./i.test(t)) return "Instagram captions can't hold links";
    if (!/link in (our |the )?bio/i.test(t)) return "Instagram caption must say link in bio";
  }
  return null;
}

/** Safe template captions (used when the AI is unavailable or its captions fail the checks). */
export function fallbackCaptions(c: SocialContent): Record<SocialPlatform, string> {
  const credit = c.kind === "showcase" && c.brandName ? ` Big thanks to ${c.handle || c.brandName} for letting us share it.` : "";
  const lead = c.kind === "tip"
    ? `G'day! Quick ad tip from Ozzy: ${c.brief.replace(/^ad tip:\s*/i, "")}.`
    : `G'day! Here's ${c.brief}.${credit}`;
  const pitch = "Paste your website and Ozzy makes you 10 free Facebook and Instagram ads.";
  return {
    facebook: `${lead} ${pitch} ${socialLink("facebook")} #SmallBusiness`,
    instagram: `${lead} ${pitch} Link in bio. #SmallBusiness #FacebookAds`,
  };
}

// ---------------------------------------------------------------------------
// Graph API (Page token)

export type FetchFn = (url: string | URL, init?: RequestInit) => Promise<Response>;

async function graph(f: FetchFn, version: string, path: string, params: Record<string, string>, method: "GET" | "POST", signal?: AbortSignal): Promise<Record<string, unknown>> {
  const u = new URL(`https://graph.facebook.com/${version}/${path}`);
  const body = new URLSearchParams(params);
  if (method === "GET") for (const [k, v] of body) u.searchParams.set(k, v);
  const res = await f(u, method === "POST" ? { method, body, signal } : { signal });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(`Meta ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

/** Photo (or video, when videoUrl is set) post on the Page; returns the post / video id. */
export async function publishFacebook(o: { f: FetchFn; version: string; pageId: string; token: string; imageUrl: string; videoUrl?: string; caption: string; signal?: AbortSignal }): Promise<string> {
  if (o.videoUrl) {
    const v = await graph(o.f, o.version, `${o.pageId}/videos`, { file_url: o.videoUrl, description: o.caption, access_token: o.token }, "POST", o.signal);
    if (typeof v.id !== "string") throw new Error("Meta videos: no video id");
    return v.id;
  }
  const r = await graph(o.f, o.version, `${o.pageId}/photos`, { url: o.imageUrl, caption: o.caption, access_token: o.token }, "POST", o.signal);
  const id = typeof r.post_id === "string" ? r.post_id : typeof r.id === "string" ? r.id : "";
  if (!id) throw new Error("Meta photos: no post id");
  return id;
}

/** IG container -> wait until FINISHED -> media_publish; returns the IG media id. */
export async function publishInstagram(o: { f: FetchFn; version: string; igUserId: string; token: string; imageUrl: string; videoUrl?: string; caption: string; signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; tries?: number }): Promise<string> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const media: Record<string, string> = o.videoUrl ? { media_type: "REELS", video_url: o.videoUrl, share_to_feed: "true" } : { image_url: o.imageUrl };
  const c = await graph(o.f, o.version, `${o.igUserId}/media`, { ...media, caption: o.caption, access_token: o.token }, "POST", o.signal);
  const creation = typeof c.id === "string" ? c.id : "";
  if (!creation) throw new Error("Meta media: no container id");
  // Reels take ~30-90s to process.
  for (let i = 0; i < (o.tries ?? (o.videoUrl ? 60 : 10)); i++) {
    const s = await graph(o.f, o.version, creation, { fields: "status_code", access_token: o.token }, "GET", o.signal);
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Meta media container ${String(s.status_code)}`);
    await sleep(3000);
    if (i === (o.tries ?? (o.videoUrl ? 60 : 10)) - 1) throw new Error("Meta media container still processing");
  }
  const p = await graph(o.f, o.version, `${o.igUserId}/media_publish`, { creation_id: creation, access_token: o.token }, "POST", o.signal);
  if (typeof p.id !== "string") throw new Error("Meta media_publish: no media id");
  return p.id;
}

export interface ManagedPage { id: string; name: string; accessToken: string; igUserId: string | null; igUsername: string | null }

/** Pages the user manages, with non-expiring Page tokens when called with a long-lived user token. */
export async function listPages(f: FetchFn, version: string, userToken: string, signal?: AbortSignal): Promise<ManagedPage[]> {
  const r = await graph(f, version, "me/accounts", { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100", access_token: userToken }, "GET", signal);
  const data = Array.isArray(r.data) ? (r.data as Array<Record<string, unknown>>) : [];
  return data.flatMap((p) => {
    const ig = p.instagram_business_account as { id?: unknown; username?: unknown } | undefined;
    return typeof p.id === "string" && typeof p.access_token === "string"
      ? [{ id: p.id, name: typeof p.name === "string" ? p.name : p.id, accessToken: p.access_token, igUserId: typeof ig?.id === "string" ? ig.id : null, igUsername: typeof ig?.username === "string" ? ig.username : null }]
      : [];
  });
}

/** Which Page is Komendly's: the configured id, else the only Page, else the one named like "Komendly". */
export function choosePage(pages: readonly ManagedPage[], wantedId?: string): ManagedPage | string {
  if (wantedId) return pages.find((p) => p.id === wantedId) ?? `Page ${wantedId} not among your Pages`;
  if (pages.length === 1 && pages[0]) return pages[0];
  const k = pages.filter((p) => /komendly/i.test(p.name));
  if (k.length === 1 && k[0]) return k[0];
  return pages.length ? `Several Pages found (${pages.map((p) => p.name).join(", ")}); set KLY_SOCIAL_PAGE_ID` : "No Facebook Pages were shared with the app";
}
