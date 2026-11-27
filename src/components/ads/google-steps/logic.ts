// Pure helpers for the Google Ads publish flow (no React): ids, character counts, money, validation, plain words.
import type { GeoPick, GoogleAccount, GoogleKeyword, GooglePublishView, GoogleReadiness, GoogleSearchText, GoogleStatus } from "@/lib/ads/google/client-api";

export const GOOGLE_STEPS = ["connect", "account", "ready", "ads", "area", "budget", "text", "confirm"] as const;
export type GoogleStep = (typeof GOOGLE_STEPS)[number];
export const GOOGLE_STEP_LABELS: Record<GoogleStep, string> = {
  connect: "Google account", account: "Pick account", ready: "Checks", ads: "Ads", area: "Area", budget: "Budget", text: "Your text ad", confirm: "Create",
};

export const DEFAULT_LIMITS = { headline: 30, description: 90, path: 15, headlinesMax: 15, descriptionsMax: 4 } as const;
export const HEADLINES_MIN = 3;
export const DESCRIPTIONS_MIN = 2;
export const KEYWORD_MAX_CHARS = 80;
export const KEYWORD_MAX_WORDS = 10;
export const DAYS_PER_MONTH = 30.4;
export const RECHECK_MS = 10_000;
export const JOB_POLL_MS = 3_000;
export const HELP_PATH = "/ads/app/help/google-ads";
export const GOOGLE_ADS_HOME = "https://ads.google.com/aw/overview";
export const GOOGLE_BILLING_URL = "https://ads.google.com/aw/billing/summary";
export const GOOGLE_MANAGERS_URL = "https://ads.google.com/aw/accountaccess/managers";

/** "123-456-7890", "123 456 7890" or "1234567890" -> "1234567890"; anything else -> null. */
export function normalizeCustomerId(input: string): string | null {
  const s = input.replace(/[\s\-.\u2010-\u2015]/g, "");
  return /^\d{10}$/.test(s) ? s : null;
}

/** "1234567890" -> "123-456-7890" (how Google Ads shows it). */
export function formatCustomerId(id: string): string {
  const d = id.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : id;
}

const EMOJI = new RegExp("\\p{Extended_Pictographic}", "u");
const WIDE = new RegExp("[\\u1100-\\u115F\\u2E80-\\uA4CF\\uAC00-\\uD7A3\\uF900-\\uFAFF\\uFE30-\\uFE4F\\uFF00-\\uFF60\\uFFE0-\\uFFE6]|[\\u{20000}-\\u{3FFFD}]", "u");

function graphemes(s: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(s), (x) => x.segment);
  return Array.from(s);
}

/** Characters as Google Ads counts them: one per visible character; double-width (CJK) and emoji count 2. */
export function adTextLength(s: string): number {
  let n = 0;
  for (const g of graphemes(s)) n += EMOJI.test(g) || WIDE.test(g) ? 2 : 1;
  return n;
}

export const hasEmoji = (s: string) => EMOJI.test(s);

/** Rough month: daily x 30.4 x campaigns. Google may spend a bit more on some days but not more than this over a month. */
export function monthlyEstimate(daily: number, campaigns = 1): number {
  if (!Number.isFinite(daily) || daily <= 0) return 0;
  return Math.round(daily * campaigns * DAYS_PER_MONTH * 100) / 100;
}

export function formatMoney(major: number, currency: string | null | undefined): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(major);
  } catch {
    return `${major} ${currency ?? ""}`.trim();
  }
}

/** "12.50" / "12,50" -> 12.5; junk -> NaN. */
export function parseMoney(input: string): number {
  const s = input.trim().replace(",", ".");
  return /^\d+(\.\d{0,2})?$/.test(s) ? Number(s) : NaN;
}

/** YouTube link or bare id -> the 11-char video id; null when it isn't one. */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "music.youtube.com") {
    id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]+)/)?.[1] ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export function isWebUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Display URL for the preview: "www.site.com/path1/path2". */
export function displayUrl(finalUrl: string, path1: string, path2: string): string {
  let host = finalUrl;
  try { host = new URL(finalUrl).hostname; } catch { /* keep raw */ }
  return [host, path1.trim(), path1.trim() ? path2.trim() : ""].filter(Boolean).join("/");
}

/** Normalised keyword text, or null when it can't be a keyword. */
export function cleanKeyword(input: string): string | null {
  const s = input.toLowerCase().replace(/["[\]+]/g, "").replace(/\s+/g, " ").trim();
  if (!s || s.length > KEYWORD_MAX_CHARS || s.split(" ").length > KEYWORD_MAX_WORDS) return null;
  return s;
}

export function addKeyword(list: GoogleKeyword[], input: string): GoogleKeyword[] {
  const text = cleanKeyword(input);
  if (!text || list.some((k) => k.text === text)) return list;
  return [...list, { text, match: "PHRASE" }];
}

export const MATCH_LABEL = { PHRASE: "close match", EXACT: "exact" } as const;

export type TextLimits = { headline: number; description: number; path: number; headlinesMax: number; descriptionsMax: number };

export type PublishForm = {
  customerId: string;
  adIds: string[];
  geo: GeoPick[];
  dailyBudget: number;
  minBudget: number;
  currency: string;
  search: GoogleSearchText;
  keywords: GoogleKeyword[];
  finalUrl: string;
  youtubeUrl: string;
  limits?: TextLimits;
};

/** Problems with the text ad, keywords and landing page, in plain words. */
export function textBlockers(f: Pick<PublishForm, "search" | "keywords" | "finalUrl" | "limits">): string[] {
  const L = f.limits ?? DEFAULT_LIMITS;
  const out: string[] = [];
  const hs = f.search.headlines;
  const ds = f.search.descriptions;
  if (hs.filter((h) => h.trim()).length < HEADLINES_MIN) out.push(`Add at least ${HEADLINES_MIN} headlines.`);
  if (hs.length > L.headlinesMax) out.push(`Use at most ${L.headlinesMax} headlines.`);
  if (hs.some((h) => !h.trim())) out.push("Fill in or remove the empty headline.");
  const overH = hs.filter((h) => adTextLength(h) > L.headline).length;
  if (overH) out.push(`${overH === 1 ? "A headline is" : `${overH} headlines are`} too long (${L.headline} characters max).`);
  const seen = new Set<string>();
  if (hs.some((h) => { const k = h.trim().toLowerCase(); if (!k) return false; if (seen.has(k)) return true; seen.add(k); return false; })) out.push("Two headlines are the same. Change or remove one.");
  if (ds.filter((d) => d.trim()).length < DESCRIPTIONS_MIN) out.push(`Add at least ${DESCRIPTIONS_MIN} descriptions.`);
  if (ds.length > L.descriptionsMax) out.push(`Use at most ${L.descriptionsMax} descriptions.`);
  if (ds.some((d) => !d.trim())) out.push("Fill in or remove the empty description.");
  const overD = ds.filter((d) => adTextLength(d) > L.description).length;
  if (overD) out.push(`${overD === 1 ? "A description is" : `${overD} descriptions are`} too long (${L.description} characters max).`);
  if (adTextLength(f.search.path1) > L.path || adTextLength(f.search.path2) > L.path) out.push(`Web address words can be ${L.path} characters at most.`);
  if (f.search.path2.trim() && !f.search.path1.trim()) out.push("Fill in the first web address word before the second.");
  if (hs.some((h) => h.includes("!"))) out.push("Google doesn't allow \"!\" in headlines. Remove it.");
  if ([...hs, ...ds, f.search.path1, f.search.path2].some(hasEmoji)) out.push("Google doesn't allow emoji in ads. Please remove them.");
  if (f.keywords.length === 0) out.push("Add at least one search phrase.");
  if (!isWebUrl(f.finalUrl)) out.push("Enter the web page people land on, starting with https://");
  return out;
}

/** Problems with the daily budget, or null. */
export function budgetBlocker(daily: number, min: number, currency: string): string | null {
  if (!(daily > 0)) return "Enter a daily budget.";
  if (daily < min) return `The daily budget must be at least ${formatMoney(min, currency)}.`;
  return null;
}

/** Every reason publishing is blocked, in plain words. Empty = OK to publish. */
export function publishBlockers(f: PublishForm): string[] {
  const out: string[] = [];
  if (!f.customerId) out.push("Pick a Google Ads account first.");
  if (f.geo.length === 0) out.push("Choose where your customers are.");
  const b = budgetBlocker(f.dailyBudget, f.minBudget, f.currency);
  if (b) out.push(b);
  out.push(...textBlockers(f));
  if (f.youtubeUrl.trim() && !youtubeId(f.youtubeUrl)) out.push("That doesn't look like a YouTube link. Fix it or leave it empty.");
  return out;
}

/** Image ads run as a second campaign only when images were picked. */
export function campaignsFor(adIds: string[], youtubeUrl: string): Array<"search" | "demand_gen"> {
  return adIds.length > 0 || youtubeId(youtubeUrl) ? ["search", "demand_gen"] : ["search"];
}

/** One preview per ad (images come per ratio): prefer square, then 4:5, then whatever is there. */
export function previewsByAd(images: Array<{ adId: string; ratio: string; previewUrl: string }>): Array<{ adId: string; previewUrl: string }> {
  const rank = (r: string) => (r === "1:1" ? 0 : r === "4:5" ? 1 : 2);
  const best = new Map<string, { ratio: string; previewUrl: string }>();
  for (const i of images) {
    const cur = best.get(i.adId);
    if (!cur || rank(i.ratio) < rank(cur.ratio)) best.set(i.adId, i);
  }
  return [...best].map(([adId, v]) => ({ adId, previewUrl: v.previewUrl }));
}

/** Which account the user can run ads on (managers can't hold ads). */
export function adAccounts(accounts: GoogleAccount[]): GoogleAccount[] {
  return accounts.filter((a) => !a.manager);
}

const POLICY_TOPICS: Record<string, string> = {
  DESTINATION_NOT_WORKING: "Your web page didn't open for Google. Check the link works on a phone and a computer.",
  DESTINATION_MISMATCH: "The web address shown in the ad doesn't match the page people land on. Use your own site's address.",
  DESTINATION_EXPERIENCE: "Google had trouble with your web page. Make sure it loads fast and shows what the ad says.",
  CAPITALIZATION: "Too many capital letters. Write words normally, like in a sentence.",
  EXCESSIVE_CAPITALIZATION: "Too many capital letters. Write words normally, like in a sentence.",
  PUNCTUATION: "Too much or odd punctuation (like !!! or ??). Use normal punctuation.",
  SYMBOLS: "Google doesn't allow some symbols or emoji. Remove them.",
  REPETITION: "The same word or phrase repeats too much. Say it once.",
  UNCLEAR_OR_IRRELEVANT_AD_CONTENT: "Google found the text unclear. Say plainly what you offer.",
  TRADEMARKS_IN_AD_TEXT: "The text uses another company's brand name. Remove it.",
  TRADEMARKS: "The text uses another company's brand name. Remove it.",
  MISREPRESENTATION: "Google thinks a claim may be misleading. Remove promises you can't back up.",
  UNRELIABLE_CLAIMS: "Google thinks a claim may be misleading. Remove promises you can't back up.",
  HEALTHCARE_AND_MEDICINES: "Health and medical ads have extra rules. Avoid medical claims and drug names.",
  PRESCRIPTION_DRUGS: "Ads can't mention prescription drugs without Google approval. Remove the drug name.",
  UNAPPROVED_SUBSTANCES: "The text mentions something Google doesn't allow in ads. Remove it.",
  LOCAL_SERVICES: "Some local services need extra checks from Google. Follow the steps in Google Ads.",
  GAMBLING_AND_GAMES: "Gambling ads need Google's permission first.",
  FINANCIAL_SERVICES: "Financial service ads need extra details. Follow the steps in Google Ads.",
  ADULT_CONTENT: "Google limits adult content. Make the text and images family friendly.",
  IMAGE_QUALITY: "An image is blurry or hard to read. Use a sharper image.",
  NON_FAMILY_SAFE: "Google limits who sees this. Make the text and images family friendly.",
};

/** A Google policy topic or reason -> what it means and what to change. Plain sentences pass through. */
export function policyIssueText(issue: string): string {
  const key = issue.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (POLICY_TOPICS[key]) return POLICY_TOPICS[key];
  if (/\s/.test(issue.trim()) && !/[{}[\]]/.test(issue)) return issue.trim();
  const words = issue.replace(/[_-]+/g, " ").toLowerCase().trim();
  return words ? `Google flagged: ${words}. Open the ad in Google Ads to see what to change.` : "Open the ad in Google Ads to see what to change.";
}

export const SERVING_LABEL: Record<GooglePublishView["serving"], string> = { paused: "Paused", enabled: "Running", removed: "Removed", unknown: "Checking" };
export const KIND_LABEL: Record<GooglePublishView["kind"], string> = { search: "Search ads", demand_gen: "Image and video ads" };

export function policyText(p: GooglePublishView["policy"]): { label: string; detail: string } {
  switch (p) {
    case "approved": return { label: "Approved", detail: "Google approved these ads." };
    case "under_review": return { label: "Under review", detail: "Google is checking these ads. This usually takes up to 1 business day." };
    case "limited": return { label: "Approved with limits", detail: "Google approved these ads, but some people won't see them." };
    case "disapproved": return { label: "Not approved", detail: "Google didn't approve these ads. Change what's below, then they get checked again." };
    default: return { label: "Not checked yet", detail: "Google checks new ads after they are created." };
  }
}

const READINESS_BLOCKERS: Record<string, string> = {
  billing_missing: "Add a payment card in Google Ads.",
  billing: "Add a payment card in Google Ads.",
  account_suspended: "Google has paused this Google Ads account. Open Google Ads to see why.",
  account_canceled: "This Google Ads account is closed. Pick another one or reopen it in Google Ads.",
  manager_link_pending: "Accept Komendly's access request in Google Ads.",
  manager_link_rejected: "The access request was declined. Send it again.",
  no_account: "Pick a Google Ads account.",
  not_selected: "Pick a Google Ads account.",
};

export function blockerText(b: string): string {
  const k = b.trim().toLowerCase();
  if (READINESS_BLOCKERS[k]) return READINESS_BLOCKERS[k];
  return /\s/.test(b.trim()) ? b.trim() : "Something in your Google Ads account needs a look. Open Google Ads to check.";
}

/** Every readiness check is fine. */
export function readinessOk(r: GoogleReadiness | null | undefined): boolean {
  return !!r && r.canPublish;
}

const CONNECT_REASONS: Record<string, string> = {
  access_denied: "Google sign-in was closed before it finished. Try again and press Allow.",
  denied: "Google sign-in was closed before it finished. Try again and press Allow.",
  no_refresh_token: "Google didn't give us lasting access. Try again and press Allow on every screen.",
  scope: "Komendly needs permission to manage your Google Ads. Try again and tick every box.",
  missing_scope: "Komendly needs permission to manage your Google Ads. Try again and tick every box.",
  state: "The sign-in took too long. Please try again.",
  expired: "The sign-in took too long. Please try again.",
  no_accounts: "This Google login has no Google Ads account. Use another login, or let us create one for you.",
};

export function connectErrorText(reason: string | null | undefined): string {
  return (reason && CONNECT_REASONS[reason.toLowerCase()]) || "Google sign-in didn't finish. Please try again.";
}

/** Read and strip ?google=connected|error&reason=... from a URL. */
export function readReturnParams(href: string): { result: "connected" | "error" | null; reason: string | null; cleaned: string } {
  const u = new URL(href);
  const g = u.searchParams.get("google");
  const reason = u.searchParams.get("reason");
  const result = g === "connected" || g === "error" ? g : null;
  if (result) { u.searchParams.delete("google"); u.searchParams.delete("reason"); }
  return { result, reason, cleaned: `${u.pathname}${u.search}${u.hash}` };
}

/** The steps shown for this connection: the account picker only when the person chooses among several. */
export function visibleSteps(s: Pick<GoogleStatus, "connection"> | null, accountCount: number | null): GoogleStep[] {
  const skipAccount = s?.connection?.mode === "manager" || accountCount === 1;
  return GOOGLE_STEPS.filter((x) => !(x === "account" && skipAccount));
}

export const jobBusy = (s: GoogleStatus | null) => !!s?.job && (s.job.status === "queued" || s.job.status === "running");
