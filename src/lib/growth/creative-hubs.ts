// Creative hubs (opportunities 31-45, 81-90): pure rules shared by the web forms, API and tests.
// No schema: everything is AdsEvent rows (HUB_EVENT / GIVEAWAY_EVENT / ...). Nothing here emails or publishes; the
// server module does that behind the AdsFeatureFlags creative_hubs / creative_outreach / creative_publish (default OFF).
import crypto from "node:crypto";
import { SEASONS, type SeasonDef } from "./trade-playbooks-data";

export const HUB_EVENT = "hub_submission";
export const GIVEAWAY_EVENT = "giveaway_entry";
export const HUB_EVENTS = {
  optout: "hub_optout",
  nomineeEmail: "hub_nominee_email",
  takedown: "hub_takedown",
  vote: "ad_vote",
  challenge: "challenge_result",
  approval: "ad_approval",
  showcase: "showcase_optin",
  makeoverPublic: "makeover_public",
  botd: "botd_pick",
} as const;

export type HubKind = "makeover" | "nominate" | "rescue" | "launch" | "giveaway" | "nonprofit" | "reaction" | "review" | "takedown";
export type FieldType = "text" | "email" | "url" | "textarea" | "checkbox";
export interface HubField { name: string; label: string; type: FieldType; required?: boolean; max?: number; help?: string }
export interface HubConfig { kind: HubKind; title: string; lead: string; submit: string; done: string; fields: HubField[] }

const own = (name: string, label: string): HubField => ({ name, label, type: "checkbox", required: true });
const EMAIL: HubField = { name: "email", label: "Your email", type: "email", required: true, max: 160 };
const BIZ: HubField = { name: "businessName", label: "Business name", type: "text", required: true, max: 120 };
const SITE: HubField = { name: "url", label: "Website", type: "url", required: true, max: 300 };

export const HUB_CONFIGS: Record<HubKind, HubConfig> = {
  makeover: {
    kind: "makeover", title: "Free ad makeover for your website", lead: "Enter your own website. We make ads from it. Nothing is shown publicly unless you say yes below, and you can ask us to take anything down.",
    submit: "Request my makeover", done: "Got it. A person at Komendly will review your request and email you a private link within 2 business days. Want ads right now? Make your free pack at komendly.com/free-ads. Nothing is published without your yes.",
    fields: [BIZ, SITE, EMAIL, own("owner", "I own or work for this business and can submit its website."), { name: "publicOk", label: "Optional: you may show the before/after publicly, labelled as a Komendly makeover, after I approve it.", type: "checkbox" }],
  },
  nominate: {
    kind: "nominate", title: "Nominate a business for free ads", lead: "Know a business with great work and weak ads? Nominate it. We send the business one honest email from Komendly saying someone nominated it, with a one-click opt-out. We never say who nominated it unless you add your name.",
    submit: "Nominate", done: "Thanks! If the business hasn't opted out, they'll get a single note from us. We don't publish anything about them.",
    fields: [{ name: "businessName", label: "Business name", type: "text", required: true, max: 120 }, { name: "url", label: "Their website", type: "url", required: true, max: 300 }, { name: "nomineeEmail", label: "Their public contact email (from their own website)", type: "email", max: 160 },
      { name: "reason", label: "Why them? (optional, kept private)", type: "textarea", max: 400 }, { name: "nominatorName", label: "Your first name (optional)", type: "text", max: 60 }, own("honest", "This is a real business, and I'm not nominating it to spam it.")],
  },
  rescue: {
    kind: "rescue", title: "Ad rescue: free critique and an improved version", lead: "Send us the Facebook or Instagram ad you're running now (a link to your page or the Ad Library listing). We grade it with the same checks as the Meta Ad Check and make an improved version. Private by default.",
    submit: "Rescue my ad", done: "Received. A person will review it and email your critique and an improved version within 2 business days. It stays private.",
    fields: [BIZ, { name: "url", label: "Your website", type: "url", required: true, max: 300 }, { name: "adLink", label: "Link to your current ad (Ad Library or post)", type: "url", max: 400 }, EMAIL, own("owner", "This is my own business's ad.")],
  },
  launch: {
    kind: "launch", title: "Startup launch gift: launch-ready ads", lead: "Launching soon? Tell us your site and launch date. We make a free launch pack from your website (the free 10 ads).",
    submit: "Claim my launch gift", done: "Received. We'll email you within 2 business days. Want your 10 free ads right now? Make them at komendly.com/free-ads.",
    fields: [BIZ, SITE, EMAIL, { name: "launchDate", label: "Launch date (YYYY-MM-DD)", type: "text", max: 10 }, own("owner", "I'm part of this startup and can submit its website.")],
  },
  giveaway: {
    kind: "giveaway", title: "Giveaway entry", lead: "One entry per email per giveaway. We email only the winner and, if you tick it, product news with an unsubscribe link.",
    submit: "Enter", done: "You're entered. Good luck!",
    fields: [{ name: "email", label: "Email", type: "email", required: true, max: 160 }, own("rules", "I accept the giveaway rules below."), { name: "updates", label: "Optional: send me Komendly tips (unsubscribe any time).", type: "checkbox" }],
  },
  nonprofit: {
    kind: "nonprofit", title: "Nonprofit creative program", lead: "Registered US nonprofits get a free ad pack. We verify with a public EIN lookup and a domain check (your email must match your website's domain). No documents to upload.",
    submit: "Apply", done: "Received. We check your EIN on the public IRS/ProPublica listings and your email domain, then email you.",
    fields: [{ name: "businessName", label: "Organization name", type: "text", required: true, max: 140 }, SITE, { name: "ein", label: "EIN (12-3456789)", type: "text", required: true, max: 10 }, { ...EMAIL, label: "Email at your organization's domain" }, own("terms", "I'm authorized to apply for this nonprofit and accept the terms below.")],
  },
  reaction: {
    kind: "reaction", title: "Share your reaction (optional)", lead: "Got your ads? Tell us in your own words what you thought, good or bad. We only publish it if you tick the consent box, and you can ask us to remove it any time.",
    submit: "Send my reaction", done: "Thank you. Stored with your consent choice; nothing is public unless you ticked yes.",
    fields: [{ name: "email", label: "Your email", type: "email", required: true, max: 160 }, { name: "name", label: "Name to show (if you consent)", type: "text", max: 60 }, { name: "quote", label: "Your reaction (max 300 characters)", type: "textarea", required: true, max: 300 }, { name: "videoUrl", label: "Link to a short reaction video (optional)", type: "url", max: 300 }, { name: "publishConsent", label: "Yes, Komendly may publish this reaction with the name above.", type: "checkbox" }],
  },
  review: {
    kind: "review", title: "Turn a review into an ad", lead: "Paste a review you own (about your own business) and your website. We make an ad around it. We never invent or edit reviews, and we only use ones you confirm are real and yours to use.",
    submit: "Make my ad", done: "Received. A person will check it and email you the ad made around your review within 2 business days.",
    fields: [BIZ, SITE, EMAIL, { name: "review", label: "The review, word for word", type: "textarea", required: true, max: 600 }, { name: "reviewer", label: "Reviewer's first name or initials (as it appeared)", type: "text", max: 40 }, { name: "platform", label: "Where it was posted (Google, Facebook...)", type: "text", max: 40 }, own("real", "This is a real review about my business and I may use it in my ads.")],
  },
  takedown: {
    kind: "takedown", title: "Take-down request", lead: "Ask us to remove anything we published about your business, or to stop contacting you. We act on it right away.",
    submit: "Send request", done: "Received. Your opt-out is recorded now and we'll remove anything we published about you, usually within a day.",
    fields: [{ name: "ref", label: "Link or ID of the page (optional)", type: "text", max: 200 }, { name: "email", label: "Your email", type: "email", required: true, max: 160 }, { name: "note", label: "Anything else (optional)", type: "textarea", max: 400 }],
  },
};

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max) : "");

/** "example.com/x" -> "https://example.com/x"; null for localhost, IPs, non-http(s) and dotless hosts. */
export function normalizeSiteUrl(raw: unknown): string | null {
  const s = clean(raw, 400);
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const h = u.hostname.toLowerCase();
    if (!/^https?:$/.test(u.protocol) || !h.includes(".") || /^[\d.]+$/.test(h) || h.endsWith(".local") || u.username || u.password) return null;
    return `${u.protocol}//${h}${u.pathname === "/" ? "" : u.pathname}${u.search}`.slice(0, 400);
  } catch { return null; }
}

export const domainOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

export type ParsedHub = { ok: true; data: Record<string, string | boolean> } | { ok: false; error: string };

/** Validates a public form body against its config. `hp` is a honeypot: filled = bot, silently rejected by the caller. */
export function parseHubInput(kind: HubKind, raw: unknown): ParsedHub {
  const cfg = HUB_CONFIGS[kind];
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const data: Record<string, string | boolean> = {};
  for (const f of cfg.fields) {
    const v = body[f.name];
    if (f.type === "checkbox") {
      const on = v === true || v === "true" || v === "on";
      if (f.required && !on) return { ok: false, error: "Please tick the required confirmation boxes." };
      data[f.name] = on;
      continue;
    }
    const s = clean(v, f.max ?? 200);
    if (!s) { if (f.required) return { ok: false, error: `Please fill in: ${f.label.replace(/ \(.*/, "")}.` }; continue; }
    if (f.type === "email") { const e = s.toLowerCase(); if (!EMAIL_RE.test(e)) return { ok: false, error: "That email doesn't look right." }; data[f.name] = e; }
    else if (f.type === "url") { const u = normalizeSiteUrl(s); if (!u) return { ok: false, error: "That website doesn't look right." }; data[f.name] = u; }
    else data[f.name] = s;
  }
  if (kind === "nonprofit" && !EIN_RE.test(String(data.ein))) return { ok: false, error: "EIN must look like 12-3456789." };
  if (kind === "launch" && data.launchDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.launchDate))) return { ok: false, error: "Launch date must be YYYY-MM-DD." };
  if (kind === "nominate" && data.nomineeEmail && domainOf(String(data.url)) && isFreeMail(String(data.nomineeEmail))) return { ok: false, error: "Use the business's own contact email (not a personal webmail address), or leave it blank." };
  return { ok: true, data };
}

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "aol.com", "proton.me", "protonmail.com", "msn.com"]);
export const isFreeMail = (email: string) => FREE_MAIL.has(email.split("@")[1]?.toLowerCase() ?? "");

// ---- Nonprofit verification (no manual document review) ----
export const EIN_RE = /^\d{2}-\d{7}$/;
export const einLookupUrl = (ein: string) => `https://projects.propublica.org/nonprofits/search?q=${encodeURIComponent(ein)}`;
export interface NonprofitCheck { einFormat: boolean; domainMatch: boolean; lookupUrl: string; status: "domain_verified" | "needs_ein_lookup" }
/** domain_verified: applicant email is on the organisation's website domain (not webmail). The EIN lookup is always a link for the reviewer/auto-checker. */
export function checkNonprofit(i: { ein: string; email: string; url: string }): NonprofitCheck {
  const ed = i.email.split("@")[1]?.toLowerCase().replace(/^www\./, "") ?? "";
  const wd = domainOf(i.url);
  const domainMatch = Boolean(ed && wd && !isFreeMail(i.email) && (ed === wd || ed.endsWith(`.${wd}`) || wd.endsWith(`.${ed}`)));
  return { einFormat: EIN_RE.test(i.ein), domainMatch, lookupUrl: einLookupUrl(i.ein), status: domainMatch ? "domain_verified" : "needs_ein_lookup" };
}

// ---- Signed links (approve pages, nominee opt-out) ----
const mac = (secret: string, body: string) => crypto.createHmac("sha256", `hubs:${secret}`).update(body).digest("base64url");
export function signHubToken(payload: Record<string, string | number>, secret: string): string {
  if (!secret) throw new Error("LIFECYCLE_EMAIL_SECRET unset");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}
/** Returns the payload when the signature is valid and (if `x` epoch-seconds is present) not expired. */
export function verifyHubToken(token: string, secret: string, now: Date = new Date()): Record<string, string | number> | null {
  const [body, sig, extra] = (token ?? "").split(".");
  if (!body || !sig || extra !== undefined || !secret) return null;
  const a = Buffer.from(mac(secret, body)); const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, string | number>;
    if (typeof p.x === "number" && p.x * 1000 < now.getTime()) return null;
    return p;
  } catch { return null; }
}

// ---- Votes (two-ad head-to-head) ----
/** Pair id "<adIdA>~<adIdB>", ids sorted so A~B and B~A are the same contest. */
export const pairId = (a: string, b: string) => [a, b].sort().join("~");
export function parsePairId(p: string): [string, string] | null {
  const m = /^([A-Za-z0-9_-]{6,40})~([A-Za-z0-9_-]{6,40})$/.exec(p);
  return m && m[1] !== m[2] ? [m[1], m[2]] : null;
}
export function tally(votes: Array<{ choice: string }>, a: string, b: string) {
  const na = votes.filter((v) => v.choice === a).length; const nb = votes.filter((v) => v.choice === b).length; const total = na + nb;
  return { a: na, b: nb, total, aPct: total ? Math.round((na / total) * 100) : 0, bPct: total ? 100 - Math.round((na / total) * 100) : 0 };
}
/** Consecutive featured ads paired up, newest first: [1,2],[3,4]... Odd one out is left out. */
export function pairUp<T>(items: T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i + 1 < items.length; i += 2) out.push([items[i], items[i + 1]]);
  return out;
}

// ---- Challenge ----
export const CHALLENGE_SECONDS = 60;
/** Server-trusted elapsed time: client claim is capped by wall-clock between start and finish. */
export function challengeMs(startedAt: number, finishedAt: number, claimedMs: number): number {
  const wall = Math.max(0, finishedAt - startedAt);
  const c = Number.isFinite(claimedMs) ? Math.max(0, claimedMs) : wall;
  return Math.round(Math.min(c, wall + 1500, CHALLENGE_SECONDS * 1000));
}
export const challengeLabel = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

// ---- Seasonal calendar ----
const SEASON_WINDOWS: Record<string, { start: [number, number]; end: [number, number] }> = {
  "black-friday": { start: [11, 10], end: [12, 2] }, spring: { start: [2, 15], end: [5, 31] }, summer: { start: [5, 15], end: [8, 31] }, fall: { start: [8, 25], end: [11, 30] },
  winter: { start: [11, 25], end: [2, 28] }, "back-to-school": { start: [7, 10], end: [9, 10] }, "tax-season": { start: [1, 15], end: [4, 15] }, "new-year": { start: [12, 20], end: [1, 31] },
  "valentines-day": { start: [1, 25], end: [2, 14] }, "mothers-day": { start: [4, 20], end: [5, 14] }, "holiday-season": { start: [11, 20], end: [12, 25] },
};
const md = (d: Date) => (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
const inWin = (d: Date, w: { start: [number, number]; end: [number, number] }) => {
  const x = md(d), s = w.start[0] * 100 + w.start[1], e = w.end[0] * 100 + w.end[1];
  return s <= e ? x >= s && x <= e : x >= s || x <= e;
};
/** Seasons whose "start your ads" window includes `now` (most specific first: shortest windows). */
export function activeSeasons(now: Date): SeasonDef[] {
  return SEASONS.filter((s) => SEASON_WINDOWS[s.key] && inWin(now, SEASON_WINDOWS[s.key])).sort((a, b) => span(a) - span(b));
}
const span = (s: SeasonDef) => { const w = SEASON_WINDOWS[s.key]; return ((w.end[0] - w.start[0] + 12) % 12) * 31 + (w.end[1] - w.start[1]); };
/** Days until the next window opens (0 when active). */
export function daysUntilWindow(key: string, now: Date): number | null {
  const w = SEASON_WINDOWS[key]; if (!w) return null;
  if (inWin(now, w)) return 0;
  for (let i = 1; i <= 366; i++) if (inWin(new Date(now.getTime() + i * 86_400_000), w)) return i;
  return null;
}
export const seasonWindowLabel = (key: string) => {
  const w = SEASON_WINDOWS[key]; const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return w ? `${m[w.start[0] - 1]} ${w.start[1]} to ${m[w.end[0] - 1]} ${w.end[1]}` : "";
};

// ---- Progress (100 businesses in 100 days): real counts only ----
export interface ProgressCounts { made: number; delivered: number; viewed: number; claimed: number }
export function progressView(c: ProgressCounts, startedAt: Date | null, now: Date, goal = 100) {
  const day = startedAt ? Math.min(Math.max(1, Math.floor((now.getTime() - startedAt.getTime()) / 86_400_000) + 1), 9999) : 0;
  const safe = (n: number) => Math.max(0, Math.floor(n));
  const made = safe(c.made), delivered = Math.min(safe(c.delivered), made);
  return { day, goal, made, delivered, viewed: Math.min(safe(c.viewed), delivered), claimed: Math.min(safe(c.claimed), delivered), pct: Math.min(100, Math.round((delivered / goal) * 100)) };
}

// ---- Showcase ----
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
export const isShowcaseSlug = (s: string) => /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(s);
export interface ShowcaseRow { slug: string; enabled: boolean; botd: boolean; createdAt: Date; [k: string]: unknown }
/** Latest opt-in row per slug wins; disabled rows hide the page. */
export function latestShowcases<T extends ShowcaseRow>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of [...rows].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) m.set(r.slug, r);
  return [...m.values()].filter((r) => r.enabled);
}
/** Deterministic business-of-the-day: opted-in (botd) showcases not featured in the last `coolDownDays`, oldest-featured first. */
export function pickBusinessOfTheDay<T extends ShowcaseRow>(rows: T[], picks: Array<{ slug: string; at: Date }>, now: Date, coolDownDays = 60): T | null {
  const last = new Map<string, number>(); for (const p of picks) last.set(p.slug, Math.max(last.get(p.slug) ?? 0, p.at.getTime()));
  const ok = latestShowcases(rows).filter((r) => r.botd && (last.get(r.slug) ?? 0) < now.getTime() - coolDownDays * 86_400_000);
  ok.sort((a, b) => (last.get(a.slug) ?? 0) - (last.get(b.slug) ?? 0) || a.slug.localeCompare(b.slug));
  return ok[0] ?? null;
}

// ---- Emails ----
export const NOMINEE_FACTS = "Komendly makes Facebook and Instagram ads from a business's website. Someone nominated this business. We email once. Nothing about the business is published.";
export function buildNomineeEmail(i: { businessName: string; siteUrl: string; optOutUrl: string; freeUrl: string; postal: string; nominatorName?: string }) {
  const who = i.nominatorName ? `${i.nominatorName} nominated` : "Someone nominated";
  const text = [
    `Hi ${i.businessName},`,
    `${who} your business for a free ad pack from Komendly. This is the only email we'll send about it.`,
    `Komendly makes Facebook and Instagram ads from a business's website. If you'd like to see what we'd make for ${i.siteUrl}, you can get a free pack here (no card): ${i.freeUrl}`,
    `We haven't published anything about your business. If you'd rather not hear from us, opt out here and we won't contact this address again: ${i.optOutUrl}`,
    `Komendly, ${i.postal}`,
  ].join("\n\n");
  return { subject: `Someone nominated ${i.businessName} for free ads`, text };
}
