// OWNER: billing/abuse worker. Signatures are a contract used by the /ads flow — keep them.
//
// Trial-abuse defences: verified email, disposable-domain blocklist, one trial per salted HMAC
// of (registrable domain | device | IP /24 or /64 | normalized email), suspension, IP velocity.
// SSRF guard for submitted URLs (also exported for redirect hops: assertSafeRedirect).
// Postgres sliding-window rate limiter (AdsRateLimit; no Redis).
import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import { claimTrial } from "./trial-confirm";

export type TrialEligibility =
  | { ok: true }
  | { ok: false; reason: "email_unverified" | "domain_used" | "device_used" | "ip_used" | "disposable_email" | "suspended" | "blocked_url" | "trial_used" };

export interface RequestFingerprint {
  ip: string | null;
  deviceId: string | null; // first-party cookie set by the /ads page
  userAgent: string | null;
}

/** Trials from one IP prefix within 24h at/above this raise a trial_farming flag. */
export const VELOCITY_THRESHOLD = 3;
/** Free packs per network (IPv4 /24, IPv6 /64) per 30 days (2 = e.g. a couple with two businesses). Family / coworkers with their own websites share a network;
 *  the domain, email and device checks stop repeat packs for the same business. Over the cap = ip_used. */
export const IP_TRIAL_CAP = 2;
const IP_WINDOW_MS = 30 * 24 * 3600 * 1000;
export const MAX_URL_LENGTH = 2048;

// ---------------------------------------------------------------------------
// Normalization + hashing (pure)

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com",
  "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "getnada.com", "dispostable.com",
  "throwawaymail.com", "maildrop.cc", "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com",
  "tempail.com", "burnermail.io", "moakt.com", "spamgourmet.com", "mailnesia.com", "tempr.email",
  "discard.email", "mailpoof.com", "inboxkitten.com", "1secmail.com", "tmpmail.org", "minuteinbox.com",
]);

const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp",
  "co.za", "com.br", "com.mx", "com.ar", "com.tr", "com.sg", "com.my", "co.in", "co.kr", "com.cn",
  "com.hk", "co.id", "com.ph", "com.pl", "co.il", "com.ua", "com.vn", "com.co", "com.pe", "co.th",
]);

export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (isIP(host.replace(/^\[|\]$/g, ""))) return host;
  const parts = host.split(".");
  const n = MULTI_PART_SUFFIXES.has(parts.slice(-2).join(".")) ? 3 : 2;
  return parts.slice(-n).join(".");
}

export function normalizeEmail(email: string): string {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split(/@(?=[^@]*$)/);
  let local = rawLocal.split("+")[0] ?? "";
  let domain = rawDomain;
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export function isDisposableEmail(email: string): boolean {
  const domain = normalizeEmail(email).split("@")[1] ?? "";
  return DISPOSABLE_DOMAINS.has(domain) || DISPOSABLE_DOMAINS.has(registrableDomain(domain));
}

/** IPv4 -> /24, IPv6 -> /64 (IPv4-mapped IPv6 treated as IPv4). */
export function ipPrefix(ip: string): string | null {
  const v4 = toV4(ip);
  if (v4) return `${v4.slice(0, 3).join(".")}.0/24`;
  const h = expandV6(ip);
  if (!h) return null;
  return `${h.slice(0, 4).map((x) => x.toString(16)).join(":")}::/64`;
}

export function hashIdentity(kind: string, value: string): string {
  const salt = process.env.ADS_HASH_SALT;
  if (!salt) throw new Error("ADS_HASH_SALT is not set");
  return createHmac("sha256", salt).update(`${kind}:${value}`).digest("hex");
}

// ---------------------------------------------------------------------------
// IP classification (pure)

function parseV4(ip: string): number[] | null {
  const m = ip.split(".");
  if (m.length !== 4 || !m.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  return m.map(Number);
}

/** Expand IPv6 (incl. embedded dotted IPv4) to 8 16-bit numbers. */
export function expandV6(input: string): number[] | null {
  let ip = input.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  if (isIP(ip) !== 6) return null;
  const dotted = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted?.[1]) {
    const v4 = parseV4(dotted[1]);
    if (!v4) return null;
    ip = ip.slice(0, -dotted[1].length) + `${((v4[0] ?? 0) << 8 | (v4[1] ?? 0)).toString(16)}:${((v4[2] ?? 0) << 8 | (v4[3] ?? 0)).toString(16)}`;
  }
  const [head = "", tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  const all = [...h, ...Array<string>(Math.max(0, fill)).fill("0"), ...t];
  return all.length === 8 ? all.map((x) => parseInt(x, 16)) : null;
}

/** IPv4 octets, also for IPv4-mapped / NAT64 IPv6 forms. */
function toV4(ip: string): number[] | null {
  const plain = parseV4(ip);
  if (plain) return plain;
  const h = expandV6(ip);
  if (!h) return null;
  const mapped = h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff;
  const nat64 = h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0);
  if (!mapped && !nat64) return null;
  const a = h[6] ?? 0;
  const b = h[7] ?? 0;
  return [a >> 8, a & 255, b >> 8, b & 255];
}

const V4_BLOCKED: [number[], number][] = [
  [[0, 0, 0, 0], 8], [[10, 0, 0, 0], 8], [[100, 64, 0, 0], 10], [[127, 0, 0, 0], 8],
  [[169, 254, 0, 0], 16], [[172, 16, 0, 0], 12], [[192, 0, 0, 0], 24], [[192, 0, 2, 0], 24],
  [[192, 168, 0, 0], 16], [[198, 18, 0, 0], 15], [[198, 51, 100, 0], 24], [[203, 0, 113, 0], 24],
  [[224, 0, 0, 0], 4], [[240, 0, 0, 0], 4],
];

function v4InCidr(ip: number[], base: number[], bits: number): boolean {
  const toInt = (o: number[]) => ((o[0] ?? 0) * 2 ** 24) + ((o[1] ?? 0) << 16) + ((o[2] ?? 0) << 8) + (o[3] ?? 0);
  const size = 2 ** (32 - bits);
  return Math.floor(toInt(ip) / size) === Math.floor(toInt(base) / size);
}

/** True for anything that is not a public unicast address (private, loopback, link-local, CGNAT, metadata, ...). */
export function isPrivateAddress(ip: string): boolean {
  const v4 = toV4(ip);
  if (v4) return V4_BLOCKED.some(([base, bits]) => v4InCidr(v4, base, bits));
  const h = expandV6(ip);
  if (!h) return true; // unparseable: fail closed
  const first = h[0] ?? 0;
  if (h.every((x) => x === 0)) return true; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
  if (h.slice(0, 6).every((x) => x === 0)) return true; // deprecated IPv4-compatible ::a.b.c.d
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA (incl. fd00:ec2::254 metadata)
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2001 && h[1] === 0x0db8) return true; // documentation
  if (first === 0x0100 && h.slice(1, 4).every((x) => x === 0)) return true; // discard 100::/64
  return false;
}

// ---------------------------------------------------------------------------
// URL safety

export class UnsafeUrlError extends Error {
  constructor(message: string, public code: "invalid" | "private" | "blocked_content" = "invalid") {
    super(message);
  }
}

const BLOCKED_KEYWORDS = [
  "porn", "xxx", "escort", "camgirl", "onlyfans", "casino", "betting", "sportsbook", "slots",
  "gambling", "cannabis-shop", "buy-weed", "vape-shop", "replica-watches", "counterfeit",
  "gunshop", "ammo", "firearms", "steroids", "payday-loan", "crypto-doubler", "hacking-tools",
];
const BLOCKED_DOMAINS = new Set(["pornhub.com", "xvideos.com", "onlyfans.com", "bet365.com", "stake.com"]);

export function blockedContentMatch(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (BLOCKED_DOMAINS.has(registrableDomain(host))) return `domain:${registrableDomain(host)}`;
  const hay = `${host}${url.pathname}`.toLowerCase();
  return BLOCKED_KEYWORDS.find((k) => hay.includes(k)) ?? null;
}

export type Resolver = (hostname: string) => Promise<string[]>;
const dnsResolver: Resolver = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

/** Shape checks that need no network (exported for tests and the engine). */
export function parseTargetUrl(raw: string): URL {
  if (typeof raw !== "string" || raw.length === 0) throw new UnsafeUrlError("Enter a website address.");
  if (raw.length > MAX_URL_LENGTH) throw new UnsafeUrlError("That address is too long.");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a website address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http and https websites are supported.");
  if (url.username || url.password) throw new UnsafeUrlError("Website addresses can't contain a username or password.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new UnsafeUrlError("Only standard web ports (80/443) are supported.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(host) || (!host.includes(".") && !isIP(host.replace(/^\[|\]$/g, "")))) {
    throw new UnsafeUrlError("That address isn't a public website.", "private");
  }
  return url;
}

export async function assertPublicHost(url: URL, resolve: Resolver = dnsResolver): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addrs: string[];
  if (isIP(host)) addrs = [host];
  else {
    try {
      addrs = await resolve(host);
    } catch {
      throw new UnsafeUrlError("We couldn't find that website. Check the address.");
    }
  }
  if (addrs.length === 0 || addrs.some(isPrivateAddress)) throw new UnsafeUrlError("That address isn't a public website.", "private");
}

/** Validate a submitted URL (public http(s), not private IP/localhost, not blocklisted). Throws with a user-facing message. */
export async function assertSafeTargetUrl(url: string, resolve: Resolver = dnsResolver): Promise<URL> {
  const parsed = parseTargetUrl(url);
  const blocked = blockedContentMatch(parsed);
  if (blocked) {
    await prisma.abuseFlag
      .create({ data: { kind: "blocked_content", severity: "medium", details: { url: parsed.href, match: blocked } } })
      .catch(() => undefined);
    throw new UnsafeUrlError("We can't make ads for this kind of website.", "blocked_content");
  }
  await assertPublicHost(parsed, resolve);
  return parsed;
}

/** Re-validate every redirect hop (Location header) against the same rules. */
export async function assertSafeRedirect(location: string, base: URL, resolve: Resolver = dnsResolver): Promise<URL> {
  return assertSafeTargetUrl(new URL(location, base).href, resolve);
}

// ---------------------------------------------------------------------------
// Trial eligibility

export interface TrialHashes {
  domainHash: string;
  emailHash: string;
  ipHash: string | null;
  deviceHash: string | null;
}

export function trialHashes(email: string, url: URL, fp: RequestFingerprint): TrialHashes {
  const prefix = fp.ip ? ipPrefix(fp.ip) : null;
  return {
    domainHash: hashIdentity("domain", registrableDomain(url.hostname)),
    emailHash: hashIdentity("email", normalizeEmail(email)),
    ipHash: prefix ? hashIdentity("ip", prefix) : null,
    deviceHash: fp.deviceId ? hashIdentity("device", fp.deviceId) : null,
  };
}

async function flag(kind: string, severity: "low" | "medium" | "high", details: Record<string, unknown>, workspaceId?: string, userId?: string) {
  await prisma.abuseFlag.create({ data: { kind, severity, details: details as object, workspaceId, userId } }).catch(() => undefined);
}

/** Check whether this user/workspace may start a free trial for this URL. */
export async function checkTrialEligibility(userId: string, workspaceId: string, url: string, fp: RequestFingerprint): Promise<TrialEligibility> {
  const [user, ws] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.adsWorkspace.findUnique({ where: { id: workspaceId }, select: { suspendedAt: true, trialUsedAt: true } }),
  ]);
  if (!user || !ws || ws.suspendedAt) return { ok: false, reason: "suspended" };
  // No email check here: the trial starts right after signup; a verified email is required to download (download-gate.ts).
  if (isDisposableEmail(user.email)) {
    await flag("disposable_email", "low", { email: normalizeEmail(user.email).replace(/^[^@]+/, "***") }, workspaceId, userId);
    return { ok: false, reason: "disposable_email" };
  }
  if (ws.trialUsedAt) return { ok: false, reason: "trial_used" };
  let target: URL;
  try {
    target = await assertSafeTargetUrl(url);
  } catch {
    return { ok: false, reason: "blocked_url" };
  }
  const h = trialHashes(user.email, target, fp);
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [domain, email, device, ip, ipRecent] = await Promise.all([
    prisma.adsTrialClaim.findFirst({ where: { domainHash: h.domainHash } }),
    prisma.adsTrialClaim.findFirst({ where: { emailHash: h.emailHash } }),
    h.deviceHash ? prisma.adsTrialClaim.findFirst({ where: { deviceHash: h.deviceHash } }) : null,
    h.ipHash ? prisma.adsTrialClaim.count({ where: { ipHash: h.ipHash, createdAt: { gte: new Date(Date.now() - IP_WINDOW_MS) } } }) : 0,
    h.ipHash ? prisma.adsTrialClaim.count({ where: { ipHash: h.ipHash, createdAt: { gte: since } } }) : 0,
  ]);
  if (ipRecent + 1 >= VELOCITY_THRESHOLD) {
    await flag("trial_farming", ipRecent + 1 >= VELOCITY_THRESHOLD * 2 ? "high" : "medium", { ipHash: h.ipHash, trials24h: ipRecent + 1 }, workspaceId, userId);
  }
  if (ip > 0 && ip < IP_TRIAL_CAP) await flag("shared_network_trial", "low", { ipHash: h.ipHash, priorTrials30d: ip }, workspaceId, userId);
  return decideTrial({ domain: !!domain, email: !!email, device: !!device, ip: ip >= IP_TRIAL_CAP });
}

/** Pure decision order once lookups are done. */
export function decideTrial(hits: { domain: boolean; email: boolean; device: boolean; ip: boolean }): TrialEligibility {
  if (hits.domain) return { ok: false, reason: "domain_used" };
  if (hits.email) return { ok: false, reason: "trial_used" };
  if (hits.device) return { ok: false, reason: "device_used" };
  if (hits.ip) return { ok: false, reason: "ip_used" };
  return { ok: true };
}

/** Record the trial claim once the trial run is confirmed. */
export async function recordTrialClaim(workspaceId: string, userId: string, url: string, fp: RequestFingerprint): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new Error(`User ${userId} not found`);
  await claimTrial(prisma, workspaceId, trialHashes(user.email, parseTargetUrl(url), fp), new Date());
}

// ---------------------------------------------------------------------------
// Rate limiting

/** Sliding-window rate limit per key (e.g. `runs:${userId}`). Returns false when over limit. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSeconds * 1000);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    await tx.adsRateLimit.deleteMany({ where: { key, createdAt: { lt: cutoff } } });
    const used = await tx.adsRateLimit.count({ where: { key, createdAt: { gte: cutoff } } });
    if (used >= limit) return false;
    await tx.adsRateLimit.create({ data: { key } });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Ozzy Studio free video (same person, many accounts). Claims reuse AdsTrialClaim with every hash
// prefixed "studio:" so they never match (or count toward) ads trial lookups, and vice versa. No migration.

export const STUDIO_CLAIM_PREFIX = "studio:";

export type StudioFreeDecision =
  | { ok: true; sharedNetwork: boolean }
  | { ok: false; reason: "email_used" | "device_used" | "ip_used" };

/** AdsTrialClaim columns for a studio free-video claim (domainHash = "studio:<workspaceId>" identifies the workspace). */
export function studioClaimHashes(workspaceId: string, email: string, fp: RequestFingerprint): TrialHashes {
  const prefix = fp.ip ? ipPrefix(fp.ip) : null;
  const p = STUDIO_CLAIM_PREFIX;
  return {
    domainHash: `${p}${workspaceId}`,
    emailHash: `${p}${hashIdentity("email", normalizeEmail(email))}`,
    ipHash: prefix ? `${p}${hashIdentity("ip", prefix)}` : null,
    deviceHash: fp.deviceId ? `${p}${hashIdentity("device", fp.deviceId)}` : null,
  };
}

/** Pure: lookups are counts of OTHER workspaces' studio claims (ip = last 30 days). Same email/device always blocks. */
export function decideStudioFree(hits: { email: number; device: number; ip30d: number }): StudioFreeDecision {
  if (hits.email > 0) return { ok: false, reason: "email_used" };
  if (hits.device > 0) return { ok: false, reason: "device_used" };
  if (hits.ip30d >= IP_TRIAL_CAP) return { ok: false, reason: "ip_used" };
  return { ok: true, sharedNetwork: hits.ip30d > 0 };
}
