// Partner access (founding customers, before Meta App Review): the customer adds Komendly's Business portfolio as a
// partner on their ad account + Page, and the connection uses Komendly's own token (MetaConnection.viaPartner).
// Pure TS: imported by the engine (publish-meta workspaceToken) and the web app.
import type { StoredMetaToken } from "./types";

/** Owner-facing reason when a partner connection stops working: Komendly reconnects it, the customer does nothing. */
export const PARTNER_RECONNECT_REASON = "Komendly's Meta connection for your ads needs a refresh. We're on it and will reconnect it for you; you don't need to do anything. Meta's spend cap still protects your budget.";

/** System-user token for partner connections (never expires), read per call. Null when unset. */
export function partnerSystemToken(env: Record<string, string | undefined> = process.env): string | null {
  const t = env.META_PARTNER_SYSTEM_TOKEN?.trim();
  return t ? t : null;
}

/** Partner connections use META_PARTNER_SYSTEM_TOKEN when set; everything else uses its stored token. */
export function systemTokenFor(conn: { viaPartner?: boolean | null }, env: Record<string, string | undefined> = process.env): StoredMetaToken | null {
  if (!conn.viaPartner) return null;
  const t = partnerSystemToken(env);
  return t ? { mode: "graph", accessToken: t } : null;
}

const stripAct = (id: string) => id.replace(/^act_/, "");

/**
 * A partner token sees every partner customer's assets, so a customer workspace only ever sees (and can use) the
 * ad account + Page Komendly picked for it.
 */
export function scopeToSelection<A extends { id: string }, P extends { id: string }>(
  sel: { adAccountId: string | null; pageId: string | null },
  adAccounts: A[], pages: P[],
): { adAccounts: A[]; pages: P[] } {
  return {
    adAccounts: sel.adAccountId ? adAccounts.filter((a) => stripAct(a.id) === stripAct(sel.adAccountId!)) : [],
    pages: sel.pageId ? pages.filter((p) => p.id === sel.pageId) : [],
  };
}
