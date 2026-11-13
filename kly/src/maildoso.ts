// Maildoso REST client (read-only): lists the account's mailboxes with their SMTP/IMAP details and upserts them into the
// mailbox store. Endpoint/shape per https://developers.maildoso.com/openapi.json (GET /v1/user/accounts-lookup, Bearer PAT).
// Paging + field mapping adapted from warmbly/warmbly (Apache-2.0) internal/pkg/mailvendor/maildoso.go.
import { z } from "zod";
import { DEFAULT_DOMAIN_DAILY_CAP, VENDOR_WARMUP_DAYS } from "../../src/lib/ads/outbound/policy";
import type { Db } from "./db";
import { upsertStoredMailboxes, type StoreInput } from "./mailboxes";

export const MAILDOSO_BASE = "https://api.maildoso.com";
export const MAILDOSO_PAGE = 500;
const MAX_PAGES = 40;

const Host = z.object({ port: z.number().int() });
const Account = z.object({
  id: z.number().int(),
  email_account: z.string(),
  password: z.string(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  created_at: z.string().nullish(),
  provider: z.string(),
  status: z.string(),
  is_active: z.boolean().optional(),
  imap: Host.extend({ imap_host: z.string() }).nullish(),
  smtp: Host.extend({ smtp_host: z.string() }).nullish(),
});
export type MaildosoAccount = z.infer<typeof Account>;
const Page = z.object({ items: z.array(Account), meta: z.object({ total: z.number().int() }) });

export type Fetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export async function listMaildosoAccounts(token: string, f: Fetch = fetch, signal?: AbortSignal): Promise<MaildosoAccount[]> {
  const out: MaildosoAccount[] = [];
  for (let page = 0, offset = 0; page < MAX_PAGES; page++) {
    const url = `${MAILDOSO_BASE}/v1/user/accounts-lookup?limit=${MAILDOSO_PAGE}&offset=${offset}&order_by=id`;
    const res = await f(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal });
    if (!res.ok) throw new Error(`Maildoso accounts-lookup HTTP ${res.status}`);
    const p = Page.safeParse(await res.json());
    if (!p.success) throw new Error(`Maildoso accounts-lookup: unexpected shape (${p.error.issues[0]?.message ?? "invalid"})`);
    out.push(...p.data.items);
    offset += p.data.items.length;
    if (!p.data.items.length || offset >= p.data.meta.total) break;
  }
  return out;
}

/** Maildoso account -> store input; null for Google-provider accounts (no SMTP/IMAP) and ones not set up yet. */
export function toStoreInput(a: MaildosoAccount): StoreInput | null {
  if (!a.smtp || !a.imap || !a.password) return null;
  if (["setup_awaiting", "setup_processing", "pending", "failed", "deletion_scheduled"].includes(a.status)) return null;
  const created = a.created_at ? new Date(a.created_at) : null;
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ").trim() || a.email_account.split("@")[0] || a.email_account;
  return {
    address: a.email_account.toLowerCase(),
    displayName: name.slice(0, 60),
    password: a.password,
    provider: "maildoso",
    smtpHost: a.smtp.smtp_host,
    smtpPort: a.smtp.port,
    imapHost: a.imap.imap_host,
    imapPort: a.imap.port,
    readyAt: created && !Number.isNaN(created.getTime()) ? new Date(created.getTime() + VENDOR_WARMUP_DAYS * 86_400_000) : null,
    vendorId: String(a.id),
    vendorStatus: a.status,
  };
}

/** Maildoso pre-warmed domains: rented already warm (weeks of warm-up history), so their mailboxes send from day one,
 * up to 50 mailboxes x 15/day = 750/day per domain (maildoso.com/pricing). */
export const PREWARMED_DOMAIN_DAILY_CAP = 750;

const Prewarmed = z.array(z.object({ domain_name: z.string(), status: z.string().nullish() }).passthrough());

/** The user's active pre-warmed domains (lowercase names). */
export async function listPrewarmedDomains(token: string, f: Fetch = fetch, signal?: AbortSignal): Promise<Set<string>> {
  const res = await f(`${MAILDOSO_BASE}/v1/user/prewarmed-domains`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`maildoso prewarmed-domains ${res.status}`);
  const p = Prewarmed.safeParse(await res.json());
  if (!p.success) throw new Error("maildoso prewarmed-domains: unexpected response shape");
  return new Set(p.data.filter((d) => !d.status || !/paused|removed|deleted|inactive/i.test(d.status)).map((d) => d.domain_name.toLowerCase()));
}

export async function syncMaildoso(db: Db, o: { token: string; tokenKey: string | undefined; now: Date; fetch?: Fetch; signal?: AbortSignal }): Promise<{ listed: number; skipped: number; created: number; updated: number; unchanged: number; suspended: number; prewarmed: number }> {
  const accounts = await listMaildosoAccounts(o.token, o.fetch, o.signal);
  const warm = await listPrewarmedDomains(o.token, o.fetch, o.signal).catch(() => new Set<string>());
  const items: StoreInput[] = [];
  for (const a of accounts) {
    const i = toStoreInput(a);
    if (!i) continue;
    const domain = i.address.split("@")[1] ?? "";
    // Pre-warmed domain: ready now. Otherwise 14 days from creation (no creation date: from now).
    const readyAt = warm.has(domain) ? o.now : (i.readyAt ?? new Date(o.now.getTime() + VENDOR_WARMUP_DAYS * 86_400_000));
    items.push({ ...i, readyAt });
  }
  const r = await upsertStoredMailboxes(db, o.tokenKey, items, o.now);
  // Pre-warmed: lift the default per-domain cap (only while it's still the default, so an admin's cap stays), and
  // release mailboxes created before the domain was known as pre-warmed.
  for (const domain of warm) {
    await db.outboundDomain.upsert({ where: { domain }, create: { domain, dailyCap: PREWARMED_DOMAIN_DAILY_CAP }, update: {} });
    await db.outboundDomain.updateMany({ where: { domain, dailyCap: DEFAULT_DOMAIN_DAILY_CAP }, data: { dailyCap: PREWARMED_DOMAIN_DAILY_CAP } });
    await db.outboundMailbox.updateMany({ where: { domain, provider: "maildoso", readyAt: { gt: o.now } }, data: { readyAt: o.now } });
  }
  // Maildoso-suspended mailboxes must not send: pause them (lifted by the next sync when active again).
  const suspended = items.filter((i) => i.vendorStatus?.startsWith("suspended") || i.vendorStatus === "inactive").map((i) => i.address);
  const active = items.filter((i) => i.vendorStatus === "active").map((i) => i.address);
  if (suspended.length) await db.outboundMailbox.updateMany({ where: { address: { in: suspended }, paused: false }, data: { paused: true, pausedReason: "vendor: suspended by Maildoso" } });
  if (active.length) await db.outboundMailbox.updateMany({ where: { address: { in: active }, pausedReason: "vendor: suspended by Maildoso" }, data: { paused: false, pausedReason: null } });
  return { listed: accounts.length, skipped: accounts.length - items.length, ...r, suspended: suspended.length, prewarmed: warm.size };
}
