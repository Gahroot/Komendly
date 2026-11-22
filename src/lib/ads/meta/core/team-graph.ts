// Ozzy's AI marketing team (prd.md R2-R4): Meta lead-ad objects over the Marketing API. Framework-free.
// Separate from the manual publish flow (graph-publisher.ts / mapping.ts), which keeps creating everything PAUSED.
// Here too every object is created PAUSED; the team engine turns ads -> ad sets -> campaign ACTIVE with setStatus.
// Param names checked against developers.facebook.com (lead ads create guide, campaigns, basic targeting, insights).
import { leadFormQuestions } from "../../leads/questions";
import { GraphClient } from "./graph-publisher";
import { actId, ctaType, placementTargeting, type PlacementGroup } from "./mapping";
import { MetaApiError, type UploadedMedia } from "./types";

export { GraphClient };

/** Lead-ad creatives only accept these call_to_action types (lead ads create guide). */
export const LEAD_CTA_TYPES = ["APPLY_NOW", "DOWNLOAD", "GET_QUOTE", "LEARN_MORE", "SIGN_UP", "SUBSCRIBE"] as const;
/** Lead-ad link_data.link must be fb.me (lead ads create guide). */
export const LEAD_LINK = "https://fb.me/";
/** Meta lead action types counted as leads, in preference order (they overlap: only the first present is used). */
export const TEAM_LEAD_ACTIONS = ["lead", "onsite_conversion.lead_grouped"] as const;
/** Ad set names are deterministic so a resumed launch reuses them instead of creating duplicates. */
export const TEAM_ADSET_NAMES: Record<PlacementGroup, string> = { feed: "Ozzy team · Feed", stories_reels: "Ozzy team · Stories & Reels" };

const OFF = new Set(["PAUSED", "DELETED", "ARCHIVED", "DISAPPROVED", "ADSET_PAUSED", "CAMPAIGN_PAUSED"]);

/** Decimal currency string from Graph ("12.34") -> minor units. Assumes a 2-decimal currency (v1: USD). */
export function toMinor(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** Token expired/revoked or permission missing: the team must stop changing things and ask the owner to reconnect. */
export function isMetaAuthError(e: unknown): boolean {
  if (e instanceof MetaApiError) {
    if (e.status === 401) return true;
    if (e.code === 190 || e.code === 102 || e.code === 10 || (typeof e.code === "number" && e.code >= 200 && e.code < 300)) return true;
  }
  const m = e instanceof Error ? e.message : String(e);
  return /reconnect|access token|OAuthException|session has expired|permission/i.test(m);
}

// ---------- payload builders (pure) ----------

/** Meta's lead-form-safe types (lead ads create guide: other types make the form ineligible). */
export const SAFE_QUESTION_TYPES = ["CUSTOM", "EMAIL", "FIRST_NAME", "FULL_NAME", "LAST_NAME", "PHONE"] as const;
/** Field names the lead parser (leads/alert.ts leadContact) reads; ZIP becomes CUSTOM "zip_code". */
const CUSTOM_FOR: Record<string, { key: string; label: string }> = { ZIP: { key: "zip_code", label: "What's your ZIP code?" } };

function safeQuestion(q: { type: string; key?: string; label?: string; options?: Array<{ key: string; value: string }> }) {
  if ((SAFE_QUESTION_TYPES as readonly string[]).includes(q.type)) {
    return { type: q.type, ...(q.key ? { key: q.key } : {}), ...(q.label ? { label: q.label } : {}), ...(q.options ? { options: q.options } : {}) };
  }
  const c = CUSTOM_FOR[q.type] ?? { key: q.key ?? q.type.toLowerCase(), label: q.label ?? q.type.toLowerCase().replace(/_/g, " ") };
  return { type: "CUSTOM", key: q.key ?? c.key, label: q.label ?? c.label, ...(q.options ? { options: q.options } : {}) };
}

export function leadFormPayload(o: { name: string; niche: string | null; privacyUrl: string; followUpUrl?: string | null; includePhone?: boolean }) {
  const { questions } = leadFormQuestions(o.niche, { includePhone: o.includePhone });
  return {
    name: o.name.slice(0, 200),
    questions: questions.map(safeQuestion),
    privacy_policy: { url: o.privacyUrl, link_text: "Privacy policy" },
    ...(o.followUpUrl ? { follow_up_action_url: o.followUpUrl } : {}),
    block_display_for_non_targeted_viewer: true, // ad-only form: no organic leads outside the campaign
    locale: "EN_US",
  };
}

export function leadCampaignPayload(o: { name: string; spendCapMinor: number }) {
  return {
    name: o.name,
    objective: "OUTCOME_LEADS",
    buying_type: "AUCTION",
    status: "PAUSED",
    special_ad_categories: [] as string[],
    spend_cap: Math.round(o.spendCapMinor),
    is_adset_budget_sharing_enabled: false,
  };
}

export function leadAdSetPayload(o: { name: string; campaignId: string; pageId: string; dailyBudgetMinor: number; zips: string[]; group: PlacementGroup | null }) {
  return {
    name: o.name,
    campaign_id: o.campaignId,
    status: "PAUSED",
    daily_budget: Math.max(100, Math.round(o.dailyBudgetMinor)),
    billing_event: "IMPRESSIONS",
    optimization_goal: "LEAD_GENERATION",
    destination_type: "ON_AD",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    promoted_object: { page_id: o.pageId },
    targeting: {
      geo_locations: { zips: o.zips.map((z) => ({ key: `US:${z}` })) },
      age_min: 18,
      // Keep the owner's service area and age as hard limits (no Advantage+ audience expansion).
      targeting_automation: { advantage_audience: 0 },
      ...(o.group ? placementTargeting(o.group) : {}), // null = Advantage+ placements
    },
  };
}

export function leadCtaType(cta: string | null | undefined): string {
  const t = ctaType(cta, "OUTCOME_LEADS");
  if ((LEAD_CTA_TYPES as readonly string[]).includes(t)) return t;
  return /contact|call|quote|estimate|book/i.test(cta ?? "") ? "GET_QUOTE" : "LEARN_MORE";
}

export function leadCreativePayload(o: { name: string; pageId: string; formId: string; headline: string; body: string | null; cta: string | null; media: UploadedMedia }) {
  const type = leadCtaType(o.cta);
  const message = o.body ?? o.headline;
  const object_story_spec = o.media.kind === "image"
    ? { page_id: o.pageId, link_data: { image_hash: o.media.imageHash, link: LEAD_LINK, message, name: o.headline, call_to_action: { type, value: { lead_gen_form_id: o.formId } } } }
    : { page_id: o.pageId, video_data: { video_id: o.media.videoId, image_url: o.media.thumbnailUrl, title: o.headline, message, call_to_action: { type, value: { lead_gen_form_id: o.formId, link: LEAD_LINK } } } };
  return { name: o.name, object_story_spec };
}

// ---------- Graph calls ----------

/** Page access token (lead forms and the leadgen subscription need it), read with the owner's user token. */
export async function pageToken(graph: GraphClient, pageId: string, signal?: AbortSignal): Promise<string> {
  const r = await graph.request<{ access_token?: string }>("GET", pageId, { fields: "access_token" }, signal);
  if (!r.access_token) throw new MetaApiError("Meta did not return a Page access token (does the owner manage this Page?)");
  return r.access_token;
}

/** POST /{page-id}/leadgen_forms. `pageGraph` must carry the Page access token. */
export async function createLeadForm(pageGraph: GraphClient, pageId: string, o: Parameters<typeof leadFormPayload>[0], signal?: AbortSignal): Promise<string> {
  return (await pageGraph.request<{ id: string }>("POST", `${pageId}/leadgen_forms`, leadFormPayload(o), signal)).id;
}

export async function createLeadCampaign(graph: GraphClient, adAccountId: string, o: Parameters<typeof leadCampaignPayload>[0], signal?: AbortSignal): Promise<string> {
  return (await graph.request<{ id: string }>("POST", `${actId(adAccountId)}/campaigns`, leadCampaignPayload(o), signal)).id;
}

export async function createLeadAdSet(graph: GraphClient, adAccountId: string, o: Parameters<typeof leadAdSetPayload>[0], signal?: AbortSignal): Promise<string> {
  return (await graph.request<{ id: string }>("POST", `${actId(adAccountId)}/adsets`, leadAdSetPayload(o), signal)).id;
}

/** Creative + ad (PAUSED). */
export async function createLeadAd(graph: GraphClient, adAccountId: string, o: Parameters<typeof leadCreativePayload>[0] & { adSetId: string }, signal?: AbortSignal): Promise<{ adId: string; creativeId: string }> {
  const creative = await graph.request<{ id: string }>("POST", `${actId(adAccountId)}/adcreatives`, leadCreativePayload(o), signal);
  const ad = await graph.request<{ id: string }>("POST", `${actId(adAccountId)}/ads`, { name: o.name, adset_id: o.adSetId, creative: { creative_id: creative.id }, status: "PAUSED" }, signal);
  return { adId: ad.id, creativeId: creative.id };
}

function checkId(id: string): void {
  if (!/^\d+$/.test(id)) throw new MetaApiError(`Invalid Meta object id: ${id}`);
}

export async function setStatus(graph: GraphClient, id: string, status: "ACTIVE" | "PAUSED", signal?: AbortSignal): Promise<void> {
  checkId(id);
  await graph.request("POST", id, { status }, signal);
}

export async function setSpendCap(graph: GraphClient, campaignId: string, minor: number, signal?: AbortSignal): Promise<void> {
  checkId(campaignId);
  await graph.request("POST", campaignId, { spend_cap: Math.round(minor) }, signal);
}

export async function setDailyBudget(graph: GraphClient, adSetId: string, minor: number, signal?: AbortSignal): Promise<void> {
  checkId(adSetId);
  await graph.request("POST", adSetId, { daily_budget: Math.max(100, Math.round(minor)) }, signal);
}

export interface TeamAccount { id: string; name: string; timezone: string; currency: string; status?: number; hasPayment?: boolean }

/** act_?fields=timezone_name,... (account time zone drives month/day keys; status/payment drive readiness). */
export async function readAccount(graph: GraphClient, adAccountId: string, signal?: AbortSignal): Promise<TeamAccount> {
  const r = await graph.request<{ id?: string; name?: string; timezone_name?: string; currency?: string; account_status?: number; funding_source?: string }>(
    "GET", actId(adAccountId), { fields: "name,timezone_name,currency,account_status,funding_source" }, signal);
  return {
    id: actId(adAccountId), name: r.name ?? adAccountId, timezone: r.timezone_name || "America/New_York", currency: r.currency || "USD",
    status: typeof r.account_status === "number" ? r.account_status : undefined, hasPayment: !!r.funding_source,
  };
}

export interface TeamCampaign { id: string; status: string; effectiveStatus: string; spendCapMinor: number | null; lifetimeSpendMinor: number }

/** Campaign status + lifetime spend (insights date_preset=maximum). A deleted campaign reads as status DELETED. */
export async function readCampaign(graph: GraphClient, campaignId: string, signal?: AbortSignal): Promise<TeamCampaign> {
  checkId(campaignId);
  let c: { status?: string; effective_status?: string; spend_cap?: string };
  try {
    c = await graph.request("GET", campaignId, { fields: "status,effective_status,spend_cap" }, signal);
  } catch (e) {
    // Graph answers 100 "does not exist" (or 803) for a deleted object.
    if (e instanceof MetaApiError && (e.code === 100 || e.code === 803) && !isMetaAuthError(e)) return { id: campaignId, status: "DELETED", effectiveStatus: "DELETED", spendCapMinor: null, lifetimeSpendMinor: 0 };
    throw e;
  }
  const ins = await graph.request<{ data?: Array<{ spend?: string }> }>("GET", `${campaignId}/insights`, { fields: "spend", date_preset: "maximum" }, signal);
  const cap = Number(c.spend_cap);
  return {
    id: campaignId, status: c.status ?? "UNKNOWN", effectiveStatus: c.effective_status ?? c.status ?? "UNKNOWN",
    spendCapMinor: Number.isFinite(cap) && cap > 0 ? cap : null,
    lifetimeSpendMinor: (ins.data ?? []).reduce((s, r) => s + toMinor(r.spend), 0),
  };
}

export interface TeamAdSet { id: string; name: string; dailyBudgetMinor: number; status: string }

export async function listCampaignAdSets(graph: GraphClient, campaignId: string, signal?: AbortSignal): Promise<TeamAdSet[]> {
  checkId(campaignId);
  const r = await graph.request<{ data?: Array<{ id: string; name?: string; daily_budget?: string; status?: string }> }>(
    "GET", `${campaignId}/adsets`, { fields: "id,name,daily_budget,status", limit: "50" }, signal);
  return (r.data ?? []).map((a) => ({ id: a.id, name: a.name ?? "", dailyBudgetMinor: Number(a.daily_budget) || 0, status: a.status ?? "UNKNOWN" }));
}

export interface DailyAdRow { metaAdId: string; day: string; spendMinor: number; impressions: number; clicks: number; leads: number }

export function teamLeads(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  for (const t of TEAM_LEAD_ACTIONS) {
    const a = (actions as Array<{ action_type?: unknown; value?: unknown }>).find((x) => x && x.action_type === t);
    if (a) return Math.max(0, Math.round(Number(a.value) || 0));
  }
  return 0;
}

/** Ad-level daily insights of one campaign (level=ad, time_increment=1). Days are in the ad account's time zone. */
export async function fetchDailyAdInsights(graph: GraphClient, adAccountId: string, campaignId: string, since: string, until: string, signal?: AbortSignal): Promise<DailyAdRow[]> {
  const out: DailyAdRow[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const r = await graph.request<{ data?: Array<Record<string, unknown>>; paging?: { cursors?: { after?: string }; next?: string } }>("GET", `${actId(adAccountId)}/insights`, {
      level: "ad",
      time_increment: "1",
      time_range: { since, until },
      filtering: [{ field: "campaign.id", operator: "EQUAL", value: campaignId }],
      fields: "ad_id,spend,impressions,inline_link_clicks,actions,date_start",
      limit: "500",
      ...(after ? { after } : {}),
    }, signal);
    for (const row of r.data ?? []) {
      if (typeof row.ad_id !== "string" || typeof row.date_start !== "string") continue;
      out.push({ metaAdId: row.ad_id, day: row.date_start, spendMinor: toMinor(row.spend), impressions: Math.round(Number(row.impressions) || 0), clicks: Math.round(Number(row.inline_link_clicks) || 0), leads: teamLeads(row.actions) });
    }
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

export interface TeamAdStatus { id: string; effectiveStatus: string; active: boolean; rejected: boolean; reviewFeedback: string | null }

/** effective_status + ad_review_feedback for our ads (GET ?ids=...). */
export async function fetchAdStatuses(graph: GraphClient, adIds: string[], signal?: AbortSignal): Promise<TeamAdStatus[]> {
  const out: TeamAdStatus[] = [];
  for (let i = 0; i < adIds.length; i += 50) {
    const ids = adIds.slice(i, i + 50);
    ids.forEach(checkId);
    const r = await graph.request<Record<string, { id?: string; effective_status?: string; ad_review_feedback?: { global?: Record<string, string> } }>>(
      "GET", "", { ids: ids.join(","), fields: "effective_status,ad_review_feedback" }, signal);
    for (const id of ids) {
      const a = r[id];
      if (!a) continue;
      const s = a.effective_status ?? "UNKNOWN";
      const fb = a.ad_review_feedback?.global ? Object.values(a.ad_review_feedback.global).filter(Boolean).join(" ") : "";
      out.push({ id, effectiveStatus: s, active: !OFF.has(s), rejected: s === "DISAPPROVED", reviewFeedback: fb || null });
    }
  }
  return out;
}
