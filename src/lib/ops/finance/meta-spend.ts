// Read-only Meta Insights spend for one UTC day (GET only; no writes to Meta). Token is read inside the function and never logged.
export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export const META_GRAPH_VERSION = "v21.0";

export function parseInsightsSpend(body: unknown): number | null {
  const rows = (body as { data?: { spend?: string }[] } | null)?.data;
  if (!Array.isArray(rows)) return null;
  return Math.round(rows.reduce((t, r) => t + (Number(r.spend) || 0), 0) * 100);
}

/** Spend in cents for `day` (YYYY-MM-DD) on the account; null when no token/account or on any error. */
export async function fetchMetaDaySpendCents(day: string, env: Record<string, string | undefined> = process.env, f: FetchLike = fetch as unknown as FetchLike): Promise<number | null> {
  const token = env.META_ADS_TOKEN?.trim(), account = (env.META_AD_ACCOUNT_ID || "act_838454441892655").trim();
  if (!token) return null;
  const acct = account.startsWith("act_") ? account : `act_${account}`;
  const qs = new URLSearchParams({ fields: "spend", time_range: JSON.stringify({ since: day, until: day }), level: "account", access_token: token });
  try {
    const res = await f(`https://graph.facebook.com/${META_GRAPH_VERSION}/${acct}/insights?${qs}`);
    return res.ok ? parseInsightsSpend(await res.json()) : null;
  } catch { return null; }
}
