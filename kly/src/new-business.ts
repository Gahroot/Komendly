// Growth system #6 "new_business": local businesses whose website went live in the last few days, found through
// Certificate Transparency (crt.sh public JSON, free, no login; CT logs are public by design). A domain counts as new
// when its FIRST certificate ever is <= NEW_SITE_DAYS old. Then the classic Kly checks: own-site public email, MX,
// suppression/leads/customers dedupe, AI qualification; plus a US postal address on the site (CAN-SPAM; non-US
// recipients are skipped because their law may need consent). The lead gets an on-click gift page (Ozzy draws ads from
// the new site when they open it: no AI cost before a real click) and is sent first by Kly's sender, within the
// normal caps, warm-up and suppression. (Kly's gov open-data feeds carry no registration date, so CT is the only feed.)
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { domainOfUrl, isSuppressed, registrableDomain, timezoneFor } from "../../src/lib/ads/outbound/policy";
import { recordSystemRun, systemEnabled } from "../../src/lib/growth/systems";
import type { Db } from "./db";
import { blockedDomains, defaultHasMx, findOwnSiteEmail, newLeadToken, type PageFetcher, type Qualifier } from "./finder";
import { domainHash, ON_CLICK_NOTE, OUTBOUND_GIFT_SOURCE, senderWorkspace } from "./hook";
import { errMsg, log } from "./log";
import { isExcludedDomain, titleName } from "./sources";
import { SYSTEM_EVENTS, systemEvent } from "./growth";

export const NEW_BIZ_SYSTEM = "new_business" as const;
export const NEW_SITE_DAYS = 10;
/** Reach them while it's news: leads not emailed within this many days of the first cert lose priority. */
export const REACH_WITHIN_DAYS = 7;
export const CHECK_PER_CYCLE = 6;
export const CRT_BASE = "https://crt.sh/";
/** Generic gTLDs + .us only: ccTLDs mostly mean non-US recipients (skipped: not lawful without consent). */
export const ALLOWED_TLDS = new Set(["com", "net", "org", "us", "biz", "co", "pro", "services", "repair", "plumbing", "roofing", "salon", "dental", "fitness", "cafe", "restaurant", "bakery", "construction", "contractors", "cleaning", "studio", "shop", "llc"]);

/** Domain keyword -> Kly niche (rotated one per cycle). */
export const CT_KEYWORDS: ReadonlyArray<{ kw: string; niche: string }> = [
  { kw: "plumbing", niche: "plumber" },
  { kw: "roofing", niche: "roofer" },
  { kw: "hvac", niche: "hvac" },
  { kw: "electric", niche: "electrician" },
  { kw: "landscap", niche: "landscaper" },
  { kw: "painting", niche: "painter" },
  { kw: "dental", niche: "dentist" },
  { kw: "salon", niche: "hairdresser" },
  { kw: "bakery", niche: "bakery" },
  { kw: "fitness", niche: "gym" },
  { kw: "cleaning", niche: "house cleaning" },
  { kw: "auto-repair", niche: "auto repair" },
];

export interface CtRow {
  name_value?: string;
  common_name?: string;
  not_before?: string;
  entry_timestamp?: string;
}

// ---------------------------------------------------------------------------
// Pure (unit-tested)

/** Apex domain of a CT name if it is a plausible small-business site (no subdomains, allowed TLD, not a platform). */
export function ctDomain(name: string): string | null {
  const n = name.trim().toLowerCase().replace(/^\*\./, "").replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(n) || n.includes("xn--")) return null;
  const apex = registrableDomain(n);
  if (apex !== n) return null; // subdomain (mail., cpanel., app., customer.platform.com ...)
  const [label = "", ...rest] = n.split(".");
  const tld = rest.join(".");
  if (!ALLOWED_TLDS.has(tld)) return null;
  if (label.length < 4 || label.length > 40 || (label.match(/-/g)?.length ?? 0) > 3 || /\d{3,}/.test(label)) return null;
  if (/test|staging|demo|example|temp|dev\b|-?dev-|parked|forsale/.test(label)) return null;
  return isExcludedDomain(n) ? null : n;
}

/** Recent CT rows -> apex domain -> latest not_before, keeping certs issued within `days`. */
export function recentCtDomains(rows: readonly CtRow[], now: Date, days = NEW_SITE_DAYS): Map<string, Date> {
  const out = new Map<string, Date>();
  const from = now.getTime() - days * 86_400_000;
  for (const r of rows) {
    const at = new Date(`${r.not_before ?? r.entry_timestamp ?? ""}${/Z|[+-]\d\d:?\d\d$/.test(r.not_before ?? "") ? "" : "Z"}`);
    if (!Number.isFinite(at.getTime()) || at.getTime() < from || at.getTime() > now.getTime() + 86_400_000) continue;
    for (const name of `${r.name_value ?? ""}\n${r.common_name ?? ""}`.split(/\n/)) {
      const d = ctDomain(name);
      if (!d) continue;
      const prev = out.get(d);
      if (!prev || at > prev) out.set(d, at);
    }
  }
  return out;
}

/** Earliest certificate for a domain (its site's first day online, give or take). */
export function firstCertAt(rows: readonly CtRow[]): Date | null {
  let min: number | null = null;
  for (const r of rows) {
    const t = new Date(`${r.not_before ?? ""}${/Z$/.test(r.not_before ?? "") ? "" : "Z"}`).getTime();
    if (Number.isFinite(t) && (min === null || t < min)) min = t;
  }
  return min === null ? null : new Date(min);
}

export function isNewSite(first: Date | null, now: Date, days = NEW_SITE_DAYS): boolean {
  return Boolean(first && now.getTime() - first.getTime() <= days * 86_400_000 && first.getTime() <= now.getTime() + 86_400_000);
}

const STATES = "AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";

/** A US postal address on the page ("Austin, TX 78701") -> city + state; null = not shown as a US business. */
export function usLocation(html: string): { city: string; state: string } | null {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const m = new RegExp(`\\b([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){0,3}),? (${STATES}) (\\d{5})(?:-\\d{4})?\\b`).exec(text);
  if (!m) return null;
  return { city: (m[1] ?? "").trim(), state: m[2] ?? "" };
}

export function ctQueryUrl(q: string, base = CRT_BASE): string {
  return `${base}?${new URLSearchParams({ q, output: "json", exclude: "expired", deduplicate: "Y" })}`;
}

// ---------------------------------------------------------------------------
// Cycle

export type FetchCt = (url: string) => Promise<CtRow[]>;

export const defaultFetchCt: FetchCt = async (url) => {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Komendly-lead-finder/1.0 (+https://www.komendly.com)" }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`crt.sh ${res.status}`);
  const j = (await res.json()) as unknown;
  return Array.isArray(j) ? (j as CtRow[]) : [];
};

export interface NewBizDeps {
  db: Db;
  env?: NodeJS.ProcessEnv;
  now: Date;
  stop: string | null;
  minScore: number;
  senderName: string;
  qualify?: (niche: string) => Qualifier | undefined;
  fetchCt?: FetchCt;
  fetchPage?: PageFetcher;
  hasMx?: (domain: string) => Promise<boolean>;
}

export interface NewBizRuntime {
  cursor: number;
  /** Domains already checked this process (CT results repeat across cycles). */
  seen: Set<string>;
}
export const createNewBizRuntime = (): NewBizRuntime => ({ cursor: 0, seen: new Set() });

export interface NewBizCycle {
  keyword: string;
  recent: number;
  checked: number;
  leads: number;
  skipped: Record<string, number>;
}

/** One new_business cycle (kill switch first; heartbeat always). outputs = leads (each with its gift) + emails sent. */
export async function newBusinessCycle(d: NewBizDeps, rt: NewBizRuntime, sentSinceLast: number): Promise<NewBizCycle | null> {
  if (!(await systemEnabled(d.db, NEW_BIZ_SYSTEM))) return null;
  const k = CT_KEYWORDS[rt.cursor++ % CT_KEYWORDS.length]!;
  const r: NewBizCycle = { keyword: k.kw, recent: 0, checked: 0, leads: 0, skipped: {} };
  const skip = (why: string) => (r.skipped[why] = (r.skipped[why] ?? 0) + 1);
  try {
    if (!d.stop) await findNew(d, rt, k, r, skip);
    await recordSystemRun(d.db, NEW_BIZ_SYSTEM, { ok: true, outputs: r.leads + sentSinceLast }, d.now);
    return r;
  } catch (e) {
    await recordSystemRun(d.db, NEW_BIZ_SYSTEM, { ok: false, outputs: r.leads + sentSinceLast, error: errMsg(e) }, d.now);
    throw e;
  }
}

async function findNew(d: NewBizDeps, rt: NewBizRuntime, k: { kw: string; niche: string }, r: NewBizCycle, skip: (w: string) => void): Promise<void> {
  const { db } = d;
  const fetchCt = d.fetchCt ?? defaultFetchCt;
  const recent = recentCtDomains(await fetchCt(ctQueryUrl(`%${k.kw}%`)), d.now);
  r.recent = recent.size;
  if (!recent.size) return;
  const { suppressed, taken } = await blockedDomains(db);
  const fresh = [...recent.keys()].filter((dom) => !rt.seen.has(dom) && !taken.has(dom) && !suppressed.has(dom)).slice(0, CHECK_PER_CYCLE);
  const qualify = d.qualify?.(k.niche);
  for (const domain of fresh) {
    rt.seen.add(domain);
    r.checked++;
    const first = firstCertAt(await fetchCt(ctQueryUrl(domain)).catch(() => []));
    if (!isNewSite(first, d.now)) { skip("not_new"); continue; }
    const site = await findOwnSiteEmail(`https://${domain}`, d.fetchPage).catch(() => null);
    if (!site?.email) { skip("no_public_email"); continue; }
    if (domainOfUrl(site.finalUrl) !== domain) { skip("redirects_away"); continue; }
    if (isSuppressed(site.email, suppressed)) { skip("suppressed"); continue; }
    const loc = usLocation(site.homeHtml);
    if (!loc) { skip("not_us"); continue; }
    if (!(await (d.hasMx ?? defaultHasMx)(site.email.split("@")[1] ?? "").catch(() => true))) { skip("no_mx"); continue; }
    const name = titleName(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(site.homeHtml)?.[1] ?? "", domain);
    const place = { name, website: site.finalUrl, city: loc.city, state: loc.state, lat: null, lon: null, source: "ct" } as unknown as Parameters<Qualifier>[0];
    const q = qualify ? await qualify(place, site.homeHtml).catch((e: unknown) => (log("warn", "kly new_business qualify failed", { domain, error: errMsg(e) }), null)) : null;
    if (qualify && (!q || q.score < d.minScore)) { skip("unqualified"); continue; }
    const id = await createLead(d, { domain, name, site, loc, niche: k.niche, first: first!, q });
    if (!id) { skip("taken"); continue; }
    r.leads++;
    await systemEvent(db, SYSTEM_EVENTS.lead, NEW_BIZ_SYSTEM, { leadId: id, domain, firstCertAt: first!.toISOString() });
    await systemEvent(db, SYSTEM_EVENTS.gift, NEW_BIZ_SYSTEM, { leadId: id, timing: "on-click" });
  }
}

/** Lead + on-click gift page in one transaction (sendable at once; Ozzy draws the ads when they open it). */
async function createLead(
  d: NewBizDeps,
  x: { domain: string; name: string; site: { email: string | null; page: string; finalUrl: string; phone: string | null }; loc: { city: string; state: string }; niche: string; first: Date; q: { score: number; qualification: unknown; costMicros: number } | null },
): Promise<string | null> {
  const env = d.env ?? process.env;
  const sender = await senderWorkspace(d.db, env);
  if (!sender) throw new Error("kly: no sender workspace (set OUTBOUND_GIFT_WORKSPACE_ID or OUTBOUND_ADMIN_EMAIL)");
  const reachBy = new Date(x.first.getTime() + REACH_WITHIN_DAYS * 86_400_000);
  return d.db.$transaction(async (tx) => {
    const lead = await tx.outboundLead.create({
      data: {
        businessName: x.name.slice(0, 120),
        website: x.site.finalUrl,
        domain: x.domain,
        niche: x.niche,
        city: x.loc.city,
        region: x.loc.state,
        timezone: timezoneFor(x.loc.state, null),
        email: x.site.email ?? "",
        emailFoundOn: x.site.page,
        source: "ct",
        system: NEW_BIZ_SYSTEM,
        systemData: { firstCertAt: x.first.toISOString(), foundAt: d.now.toISOString(), reachBy: reachBy.toISOString() },
        ...(x.site.phone ? { phone: x.site.phone, phoneSource: "site" } : {}),
        ...(x.q ? { score: x.q.score, qualification: x.q.qualification as Prisma.InputJsonValue, costMicros: BigInt(Math.round(x.q.costMicros)) } : {}),
        claimToken: newLeadToken(),
        unsubToken: newLeadToken(),
      },
      select: { id: true },
    });
    const gift = await tx.adsGift.create({
      data: { token: randomBytes(12).toString("base64url"), senderWorkspaceId: sender.workspaceId, senderUserId: sender.userId, senderName: d.senderName.slice(0, 40), recipientUrl: x.site.finalUrl, recipientDomainHash: domainHash(x.domain, env), recipientName: x.name.slice(0, 60), source: OUTBOUND_GIFT_SOURCE },
    });
    await tx.outboundLead.update({ where: { id: lead.id }, data: { giftId: gift.id, giftToken: gift.token, status: "ad_made", qualityNotes: ON_CLICK_NOTE } });
    return lead.id;
  }).catch((e: unknown) => {
    if ((e as { code?: string }).code === "P2002") return null; // unique domain race
    throw e;
  });
}
