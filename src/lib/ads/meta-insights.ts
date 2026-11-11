import { z } from "zod";
import type { AdSpend, CampaignSpend } from "./funnel";

const Row = z.object({ campaign_id: z.string(), campaign_name: z.string().default(""), spend: z.string().default("0"), clicks: z.string().default("0"), impressions: z.string().default("0") });
const Page = z.object({ data: z.array(Row).default([]), paging: z.object({ next: z.string().optional() }).optional() });

export type SpendResult = { campaigns: CampaignSpend[]; status: "ok" | "no_token" | "error"; error?: string };

/**
 * Meta Marketing API campaign insights for [since, until] (YYYY-MM-DD, account timezone). Read-only.
 * Token: META_ADS_TOKEN, else META_CAPI_TOKEN. Account: META_AD_ACCOUNT_ID (act_...). Never throws.
 */
export async function loadMetaCampaignSpend(since: string, until: string, signal?: AbortSignal): Promise<SpendResult> {
  const token = process.env.META_ADS_TOKEN || process.env.META_CAPI_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) return { campaigns: [], status: "no_token" };
  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_id,campaign_name,spend,clicks,impressions",
    time_range: JSON.stringify({ since, until }),
    limit: "200",
    access_token: token,
  });
  let url: string | undefined = `${GRAPH}/${actOf(account)}/insights?${params}`;
  const campaigns: CampaignSpend[] = [];
  try {
    for (let page = 0; url && page < 10; page++) {
      const res: Response = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000), cache: "no-store" });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (json as { error?: { message?: string } }).error?.message;
        return { campaigns: [], status: "error", error: msg ?? `http_${res.status}` };
      }
      const parsed = Page.parse(json);
      for (const r of parsed.data) {
        campaigns.push({ campaignId: r.campaign_id, campaignName: r.campaign_name, spendCents: Math.round(Number(r.spend) * 100) || 0, clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0 });
      }
      url = parsed.paging?.next;
    }
    // Our campaigns only (the account also holds unrelated ones), plus ACTIVE ones with no spend in range.
    const prefix = campaignPrefix();
    const ours = campaigns.filter((c) => c.campaignName.startsWith(prefix));
    const active = await listActiveCampaigns(account, token, signal);
    for (const c of active) {
      if (c.name.startsWith(prefix) && !ours.some((o) => o.campaignId === c.id)) ours.push({ campaignId: c.id, campaignName: c.name, spendCents: 0, clicks: 0, impressions: 0 });
    }
    return { campaigns: ours, status: "ok" };
  } catch (error) {
    return { campaigns: [], status: "error", error: error instanceof Error ? error.message : "fetch_failed" };
  }
}

const GRAPH = "https://graph.facebook.com/v23.0";
const actOf = (account: string) => (account.startsWith("act_") ? account : `act_${account}`);
const tokenOf = () => process.env.META_ADS_TOKEN || process.env.META_CAPI_TOKEN;
/** Only campaigns whose name starts with this are ours (META_CAMPAIGN_PREFIX, default "Komendly"). */
export const campaignPrefix = (): string => process.env.META_CAMPAIGN_PREFIX ?? "Komendly";

const NamedPage = z.object({ data: z.array(z.object({ id: z.string(), name: z.string().default("") })).default([]), paging: z.object({ next: z.string().optional() }).optional() });

/** ACTIVE campaigns (id, name); [] on any failure. Read-only. */
async function listActiveCampaigns(account: string, token: string, signal?: AbortSignal): Promise<{ id: string; name: string }[]> {
  const params = new URLSearchParams({ fields: "id,name", effective_status: JSON.stringify(["ACTIVE"]), limit: "200", access_token: token });
  let url: string | undefined = `${GRAPH}/${actOf(account)}/campaigns?${params}`;
  const out: { id: string; name: string }[] = [];
  try {
    for (let page = 0; url && page < 5; page++) {
      const res: Response = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) return out;
      const parsed = NamedPage.parse(await res.json());
      out.push(...parsed.data);
      url = parsed.paging?.next;
    }
  } catch {
    // fail soft
  }
  return out;
}

const AdRowSchema = z.object({ ad_id: z.string(), ad_name: z.string().default(""), spend: z.string().default("0"), impressions: z.string().default("0"), inline_link_clicks: z.string().default("0"), ctr: z.string().default("0") });
const AdPage = z.object({ data: z.array(AdRowSchema).default([]), paging: z.object({ next: z.string().optional() }).optional() });
export type AdSpendResult = { ads: AdSpend[]; status: "ok" | "no_token" | "error"; error?: string };

/** Ad-level insights for one campaign over [since, until] (paginated, ~260 ads). Read-only; never throws. */
export async function loadMetaAdSpend(campaignId: string, since: string, until: string, signal?: AbortSignal): Promise<AdSpendResult> {
  const token = tokenOf();
  if (!token) return { ads: [], status: "no_token" };
  if (!/^\d+$/.test(campaignId)) return { ads: [], status: "error", error: "invalid campaign id" };
  const params = new URLSearchParams({
    level: "ad",
    fields: "ad_id,ad_name,spend,impressions,inline_link_clicks,ctr",
    time_range: JSON.stringify({ since, until }),
    limit: "200",
    access_token: token,
  });
  let url: string | undefined = `${GRAPH}/${campaignId}/insights?${params}`;
  const ads: AdSpend[] = [];
  try {
    for (let page = 0; url && page < 20; page++) {
      const res: Response = await fetch(url, { signal: signal ?? AbortSignal.timeout(10000), cache: "no-store" });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) return { ads, status: "error", error: (json as { error?: { message?: string } }).error?.message ?? `http_${res.status}` };
      const parsed = AdPage.parse(json);
      for (const r of parsed.data) {
        ads.push({ adId: r.ad_id, adName: r.ad_name, spendCents: Math.round(Number(r.spend) * 100) || 0, impressions: Number(r.impressions) || 0, linkClicks: Number(r.inline_link_clicks) || 0, ctr: Number(r.ctr) || 0 });
      }
      url = parsed.paging?.next;
    }
    return { ads, status: "ok" };
  } catch (error) {
    return { ads, status: "error", error: error instanceof Error ? error.message : "fetch_failed" };
  }
}

// In-memory id -> name cache (per server instance; names rarely change). Deliberate process-level cache.
const NAME_TTL_MS = 6 * 3600 * 1000;
const nameCache = new Map<string, { name: string; at: number }>();

/** Resolve Meta object ids (campaign/ad set/ad) to names via batched `?ids=` reads (50 per call). Unknown ids are omitted; never throws. */
export async function resolveMetaNames(ids: readonly string[], now: number = Date.now()): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const token = tokenOf();
  const want = [...new Set(ids.filter((id) => /^\d{6,}$/.test(id)))].sort();
  const missing: string[] = [];
  for (const id of want) {
    const hit = nameCache.get(id);
    if (hit && now - hit.at < NAME_TTL_MS) out.set(id, hit.name);
    else missing.push(id);
  }
  if (!token) return out;
  for (let i = 0; i < missing.length && i < 500; i += 50) {
    const chunk = missing.slice(i, i + 50);
    try {
      const params = new URLSearchParams({ ids: chunk.join(","), fields: "name", access_token: token });
      const res = await fetch(`${GRAPH}/?${params}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, { name?: unknown } | undefined>;
      for (const id of chunk) {
        const name = json[id]?.name;
        if (typeof name === "string" && name) {
          out.set(id, name);
          nameCache.set(id, { name, at: now });
        }
      }
    } catch {
      // fail soft to ids
    }
  }
  return out;
}
