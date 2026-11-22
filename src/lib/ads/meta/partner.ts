// Partner access (founding customers): Komendly's Business portfolio is a partner on the customer's ad account + Page and
// the founder (a Meta app admin) connects Komendly's own token to the customer's workspace (MetaConnection.viaPartner).
import { GraphClient } from "./core/graph-publisher";
import type { FetchLike, MetaAdAccount, MetaPage } from "./core/types";

/** Komendly's Business portfolio ID shown to founding customers. Null when unset (the UI says we'll email it). */
export function partnerBusinessId(env: Record<string, string | undefined> = process.env): string | null {
  const id = env.META_PARTNER_BUSINESS_ID?.trim();
  return id && /^\d+$/.test(id) ? id : null;
}

/** Where partner-access requests go. */
export function adminNotifyEmail(env: Record<string, string | undefined> = process.env): string {
  return env.ADMIN_NOTIFY_EMAIL?.trim() || "nolan@komendly.com";
}

type RawAccount = { id: string; name?: string; currency?: string; account_status?: number; disable_reason?: number; funding_source?: string };
const ACCOUNT_FIELDS = "id,name,currency,account_status,disable_reason,funding_source";

function toAccount(a: RawAccount): MetaAdAccount {
  return {
    id: a.id, name: a.name ?? a.id, currency: a.currency,
    status: typeof a.account_status === "number" ? a.account_status : undefined,
    disableReason: typeof a.disable_reason === "number" ? a.disable_reason : undefined,
    hasPayment: !!a.funding_source,
  };
}

/**
 * Every ad account + Page the founder's token can use: his own (/me/adaccounts, /me/accounts) plus the assets customers
 * shared with his Business portfolios as a partner (/{business-id}/client_ad_accounts and /client_pages). Business edges
 * that fail (no business_management, not an admin there) are skipped so the personal lists still show.
 */
export async function listPartnerAssets(o: { accessToken: string; version?: string; fetch?: FetchLike; signal?: AbortSignal }): Promise<{ adAccounts: MetaAdAccount[]; pages: MetaPage[] }> {
  const g = new GraphClient({ accessToken: o.accessToken, version: o.version, fetch: o.fetch });
  const get = <T>(path: string, fields: string) => g.request<{ data: T[] }>("GET", path, { fields, limit: "200" }, o.signal).then((r) => r.data ?? []);
  const soft = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [mine, myPages, businesses] = await Promise.all([
    get<RawAccount>("me/adaccounts", ACCOUNT_FIELDS),
    get<{ id: string; name?: string }>("me/accounts", "id,name"),
    soft(get<{ id: string; name?: string }>("me/businesses", "id,name")),
  ]);
  const shared = await Promise.all(businesses.map(async (b) => ({
    accounts: await soft(get<RawAccount>(`${b.id}/client_ad_accounts`, ACCOUNT_FIELDS)),
    pages: await soft(get<{ id: string; name?: string }>(`${b.id}/client_pages`, "id,name")),
  })));
  const adAccounts = new Map<string, MetaAdAccount>();
  for (const a of [...mine, ...shared.flatMap((s) => s.accounts)]) if (!adAccounts.has(a.id)) adAccounts.set(a.id, toAccount(a));
  const pages = new Map<string, MetaPage>();
  for (const p of [...myPages, ...shared.flatMap((s) => s.pages)]) if (!pages.has(p.id)) pages.set(p.id, { id: p.id, name: p.name ?? p.id });
  return { adAccounts: [...adAccounts.values()], pages: [...pages.values()] };
}

/** Plain-text email to the founder when an owner says they added Komendly as a partner. */
export function partnerRequestMail(o: { workspaceId: string; workspaceName: string; ownerEmail: string; adminUrl: string }) {
  const text = [
    `${o.ownerEmail} says they added Komendly's Business as a partner on their ad account and Facebook Page.`,
    `Workspace: ${o.workspaceName} (${o.workspaceId})`,
    `Connect it and pick their ad account + Page here: ${o.adminUrl}`,
  ].join("\n\n");
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return { subject: `Partner access ready: ${o.ownerEmail}`, text, html: text.split("\n\n").map((l) => `<p>${esc(l)}</p>`).join("") };
}
