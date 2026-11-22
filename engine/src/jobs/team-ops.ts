// Ozzy's AI marketing team: campaign operations (prd.md R2 launch, R3 budget protection, R4 measurement, R5 analyst).
// Growth system `team_ops` (AdsFeatureFlag sys_team_ops, missing = off; the kill switch team_ops_kill still pauses
// everything when the loop is off). Every 15 min, single replica. No AI: every decision is a rule from
// src/lib/ads/team/contracts.ts. Every Meta write is recorded as a MarketingAction (dedupeKey makes retried ticks quiet).
// Only objects in the mandate's ad account that Komendly created (mandate ids / MetaPublish rows) are ever touched.
// The monthly limit is read-only here: nothing in this file writes monthlyLimitMinor.
import { accountReadiness } from "../../../src/lib/ads/meta/readiness";
import {
  createLeadAd, createLeadAdSet, createLeadCampaign, createLeadForm, fetchAdStatuses, fetchDailyAdInsights, GraphClient,
  isMetaAuthError, listCampaignAdSets, pageToken, readAccount, readCampaign, setDailyBudget, setSpendCap, setStatus,
  TEAM_ADSET_NAMES, type DailyAdRow, type TeamAccount,
} from "../../../src/lib/ads/meta/core/team-graph";
import { placementGroupForRatio, type PlacementGroup } from "../../../src/lib/ads/meta/core/mapping";
import { uploadViaGraph } from "../../../src/lib/ads/meta/core/graph-publisher";
import type { FetchLike, MetaMedia, StoredMetaToken, UploadedMedia } from "../../../src/lib/ads/meta/core/types";
import { subscribePageToLeadgen } from "../../../src/lib/ads/leads/alert";
import {
  budgetGuard, campaignSpendCap, dailyBudgetMinor, dayKey, decideOptimizations, monthKey, specialAdCategory, splitDailyBudget, stopVerdict,
  TARGET_ACTIVE_ADS, TEAM_EVENTS, TEAM_KILL_FLAG, TEAM_PAUSE_JOB, TEAM_SYSTEM_KEY, formatMoney,
  type AdStats, type MandateState, type TeamActionKind, type TeamRole,
} from "../../../src/lib/ads/team/contracts";
import { hasAdDepartment } from "../../../src/lib/ads/billing-config";
import { classifyIndustry } from "../../../src/lib/ads/industries";
import { isoWeekKey } from "../../../src/lib/ads/weekly-drop";
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import { defaultTeamNotify } from "./team-notice";
import type { Storage } from "../storage/s3";
import { PermanentJobError, type JobContext } from "./context";
import { workspaceToken } from "./publish-meta";
import { startWeeklyRun } from "./weekly";

export { TEAM_PAUSE_JOB };

const SYSTEM = TEAM_SYSTEM_KEY;
const FEED_RATIOS = ["4:5", "1:1"] as const;
const VIDEO_URL_TTL_SECONDS = 3600;
export const OWNER_PAUSED_REASON = "You paused the campaign in Ads Manager, so the team stopped changing it. Resume on your team page when you want the team back.";
export const NO_ADS_REASON = "Creative Studio is making your first ads. The team launches as soon as they're ready.";
const RECONNECT_REASON = "Meta asked us to reconnect. Reconnect Meta on your team page so the team can keep working. Meta's spend cap still protects your budget.";

// ---------- store (Prisma in production, in-memory in tests) ----------

export interface TeamMandate {
  id: string; workspaceId: string; status: string; state: string; stateReason: string | null;
  monthlyLimitMinor: number; currency: string; zips: string[]; leadEmail?: string | null; privacyUrl: string | null; adAccountId: string; pageId: string;
  authorizedAt: Date; leadFormId: string | null; campaignId: string | null; spendBeforeMonthMinor: number | null; capMonth: string | null;
  spendCapMinor: number | null; launchedAt: Date | null; lastCheckedAt: Date | null; lastAnalyzedOn: string | null;
  workspace: { ownerId: string; adsPlan: string; subscriptionStatus: string; suspendedAt: Date | null };
}
export type MandatePatch = Partial<Pick<TeamMandate, "state" | "stateReason" | "leadFormId" | "campaignId" | "spendBeforeMonthMinor" | "capMonth" | "spendCapMinor" | "launchedAt" | "lastCheckedAt" | "lastAnalyzedOn">>;
export interface ReadyAsset { ratio: string; storageKey: string; mime: string }
export interface ReadyAd { id: string; headline: string; body: string | null; cta: string | null; assets: ReadyAsset[] }
export interface PublishRow { adId: string; ratio: string | null; metaAdId: string | null; adSetId: string | null; status: string; createdAt: Date; headline: string }
export interface ActionInput { workspaceId: string; role: TeamRole; kind: TeamActionKind; summary: string; outcome?: "done" | "failed" | "skipped"; evidence?: Record<string, unknown>; metaObjectId?: string | null; dedupeKey: string }
export interface Brand { name: string | null; website: string | null; niche: string | null; screenText: string }

export interface TeamStore {
  killSwitch(): Promise<boolean>;
  mandates(): Promise<TeamMandate[]>;
  mandate(workspaceId: string): Promise<TeamMandate | null>;
  /** null = not connected. Throws when the token is unusable (expired/undecryptable). */
  token(workspaceId: string, now: Date): Promise<StoredMetaToken | null>;
  brand(workspaceId: string): Promise<Brand>;
  readyAds(workspaceId: string, excludeAdIds: string[], limit: number): Promise<ReadyAd[]>;
  media(ad: ReadyAd, asset: ReadyAsset): Promise<MetaMedia>;
  updateMandate(id: string, patch: MandatePatch): Promise<void>;
  /** Insert unless dedupeKey exists; true when inserted. */
  action(a: ActionInput): Promise<boolean>;
  lastActionAt(workspaceId: string, kind: TeamActionKind): Promise<Date | null>;
  event(name: string, workspaceId: string, userId: string | null, props: Record<string, unknown>): Promise<void>;
  publishRows(workspaceId: string, campaignId: string): Promise<PublishRow[]>;
  recordPublish(r: { adId: string; ratio: string; metaAdId: string | null; campaignId: string; adSetId: string; adAccountId: string; status: "published" | "failed"; error?: string | null }): Promise<void>;
  upsertPerf(workspaceId: string, rows: Array<DailyAdRow & { adId: string | null; status: string | null }>): Promise<void>;
  /** Ask Creative Studio for ads now (weekly drop). Returns true when a run was started. */
  requestDrop(m: TeamMandate, now: Date): Promise<boolean>;
}

/** Owner notice when the team pauses or needs them (Terms: "We email you whenever we pause your ads and say why"). */
export type TeamNotify = (n: { to: string; workspaceId: string; state: MandateState; reason: string; teamUrl: string }) => Promise<void>;

export interface TeamDeps { db?: Db; store: TeamStore; fetch?: FetchLike; now?: () => Date; graphVersion?: string; appUrl?: string; signal?: AbortSignal; notify?: TeamNotify }

/** States that change what the owner's money is doing or need the owner: each change sends one email. */
const NOTIFY_STATES = new Set<MandateState>(["capped", "paused", "stopped", "needs_reconnect", "blocked"]);

/** team_pause reason codes (web: stop.ts / rules.ts) -> owner-facing text. */
const PAUSE_REASONS: Record<string, string> = {
  owner_paused: "You paused your ads.",
  meta_disconnect: "You disconnected Meta, so the team paused your ads.",
  suspended: "Your account is on hold, so the team paused your ads.",
  subscription_ended: "Your team subscription ended, so the team paused your ads.",
  refund: "Your payment was refunded, so the team paused your ads.",
  limit_below_spend: "Your new monthly limit is below what's already been spent this month, so the team paused your ads until the 1st.",
};

async function notifyOwner(d: TeamDeps, m: TeamMandate, state: MandateState, reason: string): Promise<void> {
  if (!d.notify || !m.leadEmail) return;
  try {
    await d.notify({ to: m.leadEmail, workspaceId: m.workspaceId, state, reason, teamUrl: `${appUrl(d)}/ads/team` });
  } catch (e) {
    log("warn", "team notice email failed", { workspaceId: m.workspaceId, state, error: errMsg(e) });
  }
}

// ---------- helpers ----------

function graphVersion(d: TeamDeps): string {
  return d.graphVersion ?? (process.env.META_GRAPH_VERSION || "v25.0");
}
function graphFor(d: TeamDeps, token: string): GraphClient {
  return new GraphClient({ accessToken: token, version: graphVersion(d), fetch: d.fetch });
}
function appUrl(d: TeamDeps): string {
  return (d.appUrl ?? (process.env.LIFECYCLE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com")).replace(/\/$/, "");
}
const shortHash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

class Ctx {
  actions = 0;
  constructor(readonly d: TeamDeps, readonly m: TeamMandate, readonly now: Date) {}
  /** Per-tick key: a retried tick (same lastCheckedAt) dedupes; the next tick gets new keys. */
  get tickKey(): string {
    return `${this.m.id}:${this.m.lastCheckedAt?.getTime() ?? 0}`;
  }
  async act(a: Omit<ActionInput, "workspaceId">): Promise<void> {
    if (await this.d.store.action({ ...a, workspaceId: this.m.workspaceId })) this.actions++;
  }
  async patch(p: MandatePatch): Promise<void> {
    Object.assign(this.m, p);
    await this.d.store.updateMandate(this.m.id, p);
  }
  /** State change + one owner-facing action when the state (or blocked reason) actually changes. */
  async setState(state: MandateState, reason: string | null, a?: { role: TeamRole; kind: TeamActionKind; metaObjectId?: string | null; evidence?: Record<string, unknown> }): Promise<void> {
    const changed = this.m.state !== state || (state === "blocked" && this.m.stateReason !== reason);
    if (!changed) {
      if (this.m.stateReason !== reason) await this.patch({ stateReason: reason });
      return;
    }
    const key = `${this.tickKey}:${a?.kind ?? "state"}:${state}:${shortHash(reason ?? "")}`;
    await this.patch({ state, stateReason: reason });
    if (a) await this.act({ ...a, summary: reason ?? `State: ${state}`, dedupeKey: key });
    if (reason && NOTIFY_STATES.has(state) && a?.kind !== "owner_paused") await notifyOwner(this.d, this.m, state, reason);
  }
}

class NeedsReconnect extends Error {}

export interface TeamOpsTick { enabled: boolean; mandates: number; actions: number; errors: number }

// ---------- tick ----------

export async function teamOpsTick(d: TeamDeps): Promise<TeamOpsTick> {
  const out: TeamOpsTick = { enabled: false, mandates: 0, actions: 0, errors: 0 };
  const kill = await d.store.killSwitch();
  const enabled = d.db ? await systemEnabled(d.db, SYSTEM) : true;
  if (!enabled && !kill) return out; // off: no cycle, no heartbeat (the kill switch still pauses)
  out.enabled = true;
  const now = d.now?.() ?? new Date();
  const errors: string[] = [];
  try {
    for (const m of await d.store.mandates()) {
      out.mandates++;
      const c = new Ctx(d, m, now);
      try {
        await runMandate(c, kill);
      } catch (e) {
        out.errors++;
        errors.push(`${m.workspaceId}: ${errMsg(e)}`.slice(0, 200));
      }
      out.actions += c.actions;
    }
  } catch (e) {
    errors.push(errMsg(e));
  }
  if (d.db) await recordSystemRun(d.db, SYSTEM, { ok: errors.length === 0, outputs: out.actions, error: errors.join("; ") || null }, now);
  return out;
}

async function runMandate(c: Ctx, kill: boolean): Promise<void> {
  const { m, d, now } = c;
  let token: StoredMetaToken | null = null;
  let tokenBad = false;
  try {
    token = await d.store.token(m.workspaceId, now);
  } catch {
    tokenBad = true;
  }
  const ws = m.workspace;
  const verdict = stopVerdict({
    killSwitch: kill,
    mandateStatus: m.status === "paused" || m.status === "stopped" ? m.status : "active",
    subscriptionLive: hasAdDepartment({ adsPlan: ws.adsPlan, subscriptionStatus: ws.subscriptionStatus, suspendedAt: null }),
    suspended: !!ws.suspendedAt,
    metaConnected: !!token || tokenBad,
  });
  try {
    if (tokenBad) throw new NeedsReconnect();
    if (verdict.stop) return await stopMandate(c, verdict.state, verdict.reason, token);
    const graph = graphFor(d, token!.accessToken);
    if (!m.launchedAt) await launch(c, graph, token!);
    else await operate(c, graph);
  } catch (e) {
    if (e instanceof NeedsReconnect || isMetaAuthError(e)) {
      await c.setState("needs_reconnect", RECONNECT_REASON, { role: "director", kind: "needs_reconnect" });
      return;
    }
    throw e;
  } finally {
    await c.patch({ lastCheckedAt: now });
  }
}

async function stopMandate(c: Ctx, state: MandateState, reason: string, token: StoredMetaToken | null): Promise<void> {
  const { m } = c;
  if (m.state === state) return; // already stopped this way (campaign paused when we got here)
  if (m.campaignId && token && m.launchedAt) {
    await setStatus(graphFor(c.d, token.accessToken), m.campaignId, "PAUSED", c.d.signal);
  }
  await c.setState(state, reason, { role: "launch", kind: state === "needs_reconnect" ? "needs_reconnect" : "service_paused", metaObjectId: m.campaignId });
  if (m.campaignId) await c.d.store.event(TEAM_EVENTS.paused, m.workspaceId, null, { campaignId: m.campaignId, state, by: "engine" });
}

// ---------- launch (R2) ----------

function pickAssets(ad: ReadyAd): Array<{ group: PlacementGroup; asset: ReadyAsset }> {
  const feed = FEED_RATIOS.map((r) => ad.assets.find((a) => a.ratio === r)).find(Boolean);
  const story = ad.assets.find((a) => a.ratio === "9:16");
  const out: Array<{ group: PlacementGroup; asset: ReadyAsset }> = [];
  if (feed) out.push({ group: "feed", asset: feed });
  if (story) out.push({ group: placementGroupForRatio("9:16"), asset: story });
  return out;
}

async function launch(c: Ctx, graph: GraphClient, token: StoredMetaToken): Promise<void> {
  const { m, d, now } = c;
  const account = await readAccount(graph, m.adAccountId, d.signal);
  const ready = accountReadiness({ id: account.id, name: account.name, status: account.status, hasPayment: account.hasPayment }, null);
  if (!ready.ok) {
    const issue = ready.issues[0]!;
    await c.setState("blocked", `${issue.text} (${issue.fixLabel}: ${issue.fixUrl})`, { role: "launch", kind: "blocked", evidence: { code: issue.code } });
    return;
  }
  const brand = await d.store.brand(m.workspaceId);
  const special = specialAdCategory(brand.screenText);
  if (special) {
    await c.setState("blocked", `Your business looks like it falls in Meta's special ad category "${special}". Meta restricts targeting there, so Ozzy's team can't run these campaigns. Your ads are still yours to use.`,
      { role: "strategy", kind: "blocked", evidence: { category: special } });
    return;
  }
  const existing = m.campaignId ? await d.store.publishRows(m.workspaceId, m.campaignId) : [];
  const done = new Set(existing.filter((r) => r.status === "published").map((r) => r.adId));
  const fresh = await d.store.readyAds(m.workspaceId, [...done], Math.max(0, TARGET_ACTIVE_ADS - done.size));
  const picks = fresh.filter((a) => pickAssets(a).length > 0);
  if (!done.size && !picks.length) {
    if (await d.store.requestDrop(m, now)) {
      await c.act({ role: "creative", kind: "drop_requested", summary: "Creative Studio started making your first ads.", dedupeKey: `${m.id}:drop:${isoWeekKey(now)}` });
    }
    await c.setState("blocked", NO_ADS_REASON, { role: "creative", kind: "blocked" });
    return;
  }

  // Lead form (Page token) + leadgen webhook subscription.
  const pToken = await pageToken(graph, m.pageId, d.signal);
  if (!m.leadFormId) {
    const pageGraph = graphFor(d, pToken);
    const privacyUrl = m.privacyUrl ?? `${appUrl(d)}/lead-privacy`;
    const formId = await createLeadForm(pageGraph, m.pageId, { name: `Ozzy team leads · ${brand.name ?? "your business"} · ${dayKey(now)}`, niche: brand.niche, privacyUrl, followUpUrl: brand.website }, d.signal);
    await c.patch({ leadFormId: formId });
    await c.act({ role: "launch", kind: "lead_form_created", summary: `Created your lead form${brand.niche ? ` with ${brand.niche.replace(/-/g, " ")} questions` : ""}.`, metaObjectId: formId, dedupeKey: `${m.id}:form:${formId}`, evidence: { privacyUrl } });
  }
  try {
    await subscribePageToLeadgen((u, init) => (d.fetch ?? fetch)(u, init), { pageToken: pToken, pageId: m.pageId, graphVersion: graphVersion(d) });
  } catch (e) {
    await c.act({ role: "leads", kind: "blocked", outcome: "failed", summary: "Couldn't switch on instant lead emails yet; leads still arrive in Meta's Leads Center.", evidence: { error: errMsg(e).slice(0, 200) }, dedupeKey: `${m.id}:leadgen_sub:${dayKey(now)}` });
  }

  // Campaign with the Meta-enforced spend cap (R3.1).
  const month = monthKey(now, account.timezone);
  if (!m.campaignId) {
    const cap = campaignSpendCap(0, m.monthlyLimitMinor);
    const campaignId = await createLeadCampaign(graph, m.adAccountId, { name: `Ozzy's team · Leads · ${brand.name ?? "Komendly"}`, spendCapMinor: cap }, d.signal);
    await c.patch({ campaignId, capMonth: month, spendBeforeMonthMinor: 0, spendCapMinor: cap });
    await c.act({ role: "launch", kind: "spend_cap_set", summary: `Set Meta's spend cap so this month can't go over ${formatMoney(m.monthlyLimitMinor, m.currency)}.`, metaObjectId: campaignId, evidence: { spendCapMinor: cap, month }, dedupeKey: `${m.id}:cap:${campaignId}:${month}` });
  }
  const campaignId = m.campaignId!;

  // Ad sets by placement (feed, plus Stories/Reels when we have 9:16), daily budget split (R2).
  const groups = new Set<PlacementGroup>(["feed"]);
  for (const a of picks) for (const p of pickAssets(a)) groups.add(p.group);
  for (const r of existing) if (r.ratio === "9:16") groups.add("stories_reels");
  const current = await listCampaignAdSets(graph, campaignId, d.signal);
  const adSets = new Map<PlacementGroup, string>();
  const groupList = [...groups];
  const budgets = splitDailyBudget(dailyBudgetMinor(m.monthlyLimitMinor), groupList.length);
  for (const [i, g] of groupList.entries()) {
    const found = current.find((s) => s.name === TEAM_ADSET_NAMES[g]);
    if (found) { adSets.set(g, found.id); continue; }
    const id = await createLeadAdSet(graph, m.adAccountId, { name: TEAM_ADSET_NAMES[g], campaignId, pageId: m.pageId, dailyBudgetMinor: budgets[i]!, zips: m.zips, group: g }, d.signal);
    adSets.set(g, id);
    await c.act({ role: "launch", kind: "budget_set", summary: `${g === "feed" ? "Feed" : "Stories & Reels"} ad set: ${formatMoney(budgets[i]!, m.currency)} a day, people 18+ in your ${m.zips.length} ZIP code${m.zips.length === 1 ? "" : "s"}.`, metaObjectId: id, evidence: { dailyBudgetMinor: budgets[i]!, zips: m.zips.length }, dedupeKey: `${m.id}:adset:${id}` });
  }

  // Ads (PAUSED until everything exists).
  const published = await publishAds(c, graph, picks, adSets, campaignId);
  const rows = await d.store.publishRows(m.workspaceId, campaignId);
  const adIds = [...new Set(rows.filter((r) => r.status === "published" && r.metaAdId).map((r) => r.metaAdId!))];
  if (!adIds.length) throw new Error("no ads could be published");
  // Activation order: ads -> ad sets -> campaign (spend only starts when the campaign flips).
  for (const id of adIds) await setStatus(graph, id, "ACTIVE", d.signal);
  for (const id of new Set(adSets.values())) await setStatus(graph, id, "ACTIVE", d.signal);
  await setStatus(graph, campaignId, "ACTIVE", d.signal);
  await c.patch({ launchedAt: now, state: "live", stateReason: null });
  const n = new Set(rows.filter((r) => r.status === "published").map((r) => r.adId)).size;
  await c.act({ role: "launch", kind: "campaign_launched", summary: `Your campaign is live: ${n} ad${n === 1 ? "" : "s"} in ${adSets.size} ad set${adSets.size === 1 ? "" : "s"}, up to ${formatMoney(m.monthlyLimitMinor, m.currency)} this month.`, metaObjectId: campaignId, evidence: { ads: n, metaAds: adIds.length, adSets: adSets.size, newThisTick: published }, dedupeKey: `${m.id}:launched:${campaignId}` });
  await d.store.event(TEAM_EVENTS.launched, m.workspaceId, m.workspace.ownerId, { campaignId, ads: n, adSets: adSets.size, monthlyLimitMinor: m.monthlyLimitMinor });
}

/** Create one Meta ad per (ad, placement) into the matching ad set; records MetaPublish rows. Returns Komendly ads published. */
async function publishAds(c: Ctx, graph: GraphClient, ads: ReadyAd[], adSets: Map<PlacementGroup, string>, campaignId: string, activate = false): Promise<number> {
  const { m, d } = c;
  let n = 0;
  for (const ad of ads) {
    let ok = false;
    for (const { group, asset } of pickAssets(ad)) {
      const adSetId = adSets.get(group);
      if (!adSetId) continue;
      try {
        const media: UploadedMedia = await uploadViaGraph(graph, m.adAccountId, await d.store.media(ad, asset), d.signal);
        const r = await createLeadAd(graph, m.adAccountId, { name: `${ad.headline.slice(0, 60)} · ${asset.ratio}`, adSetId, pageId: m.pageId, formId: m.leadFormId!, headline: ad.headline, body: ad.body, cta: ad.cta, media }, d.signal);
        await d.store.recordPublish({ adId: ad.id, ratio: asset.ratio, metaAdId: r.adId, campaignId, adSetId, adAccountId: m.adAccountId, status: "published" });
        if (activate) await setStatus(graph, r.adId, "ACTIVE", d.signal);
        ok = true;
      } catch (e) {
        if (isMetaAuthError(e)) throw e;
        await d.store.recordPublish({ adId: ad.id, ratio: asset.ratio, metaAdId: null, campaignId, adSetId, adAccountId: m.adAccountId, status: "failed", error: errMsg(e).slice(0, 300) });
      }
    }
    if (ok) n++;
  }
  return n;
}

// ---------- live operations (R3, R4, R5) ----------

async function operate(c: Ctx, graph: GraphClient): Promise<void> {
  const { m, d, now } = c;
  const campaignId = m.campaignId!;
  const account: TeamAccount = await readAccount(graph, m.adAccountId, d.signal);
  const camp = await readCampaign(graph, campaignId, d.signal);

  // Owner paused/deleted it in Ads Manager: don't fight (§7).
  const ownerOff = camp.status === "DELETED" || camp.status === "ARCHIVED" || (camp.status === "PAUSED" && m.state === "live");
  if (ownerOff) {
    await c.setState("paused", OWNER_PAUSED_REASON, { role: "director", kind: "owner_paused", metaObjectId: campaignId, evidence: { metaStatus: camp.status } });
    return;
  }
  if (m.stateReason === OWNER_PAUSED_REASON && m.state === "paused") {
    const pausedAt = await d.store.lastActionAt(m.workspaceId, "owner_paused");
    const reauthorized = !!pausedAt && m.authorizedAt > pausedAt;
    if (camp.status !== "ACTIVE" && !reauthorized) return; // still the owner's call
  }

  // Month rollover / limit change: spend_cap = spend before this month + limit (R3.1).
  const month = monthKey(now, account.timezone);
  const before = m.capMonth === month && m.spendBeforeMonthMinor !== null ? m.spendBeforeMonthMinor : camp.lifetimeSpendMinor;
  const cap = campaignSpendCap(before, m.monthlyLimitMinor);
  if (m.capMonth !== month || m.spendCapMinor !== cap) {
    await setSpendCap(graph, campaignId, cap, d.signal);
    const rollover = m.capMonth !== month;
    await c.patch({ capMonth: month, spendBeforeMonthMinor: before, spendCapMinor: cap });
    await c.act({ role: "launch", kind: "spend_cap_set", metaObjectId: campaignId, dedupeKey: `${m.id}:cap:${month}:${cap}`,
      summary: rollover ? `New month: Meta's spend cap now allows ${formatMoney(m.monthlyLimitMinor, m.currency)} for ${month}.` : `Your limit changed: Meta's spend cap now allows ${formatMoney(m.monthlyLimitMinor, m.currency)} this month.`,
      evidence: { spendBeforeMonthMinor: before, monthlyLimitMinor: m.monthlyLimitMinor, spendCapMinor: cap, month } });
    await syncDailyBudgets(c, graph, campaignId);
  }

  // Engine guard on month-to-date spend (R3.2).
  const mtd = Math.max(0, camp.lifetimeSpendMinor - before);
  const guard = budgetGuard({ monthToDateMinor: mtd, monthlyLimitMinor: m.monthlyLimitMinor, currency: m.currency });
  if (guard.action === "cap") {
    if (m.state !== "capped") {
      await setStatus(graph, campaignId, "PAUSED", d.signal);
      await c.setState("capped", guard.reason, { role: "launch", kind: "capped", metaObjectId: campaignId, evidence: { monthToDateMinor: mtd, monthlyLimitMinor: m.monthlyLimitMinor, month } });
    }
    return;
  }
  if (m.state !== "live") {
    await setStatus(graph, campaignId, "ACTIVE", d.signal);
    const wasCapped = m.state === "capped";
    await c.setState("live", null);
    await c.act({ role: "launch", kind: wasCapped ? "uncapped" : "owner_resumed", metaObjectId: campaignId, dedupeKey: `${c.tickKey}:resume`,
      summary: wasCapped ? `Ads are running again: ${formatMoney(m.monthlyLimitMinor - mtd, m.currency)} of this month's budget is left.` : "Your ads are running again." , evidence: { monthToDateMinor: mtd, month } });
  }

  // Daily analyst pass (account time zone).
  const day = dayKey(now, account.timezone);
  if (m.lastAnalyzedOn !== day) {
    await analyze(c, graph, account, day);
    await c.patch({ lastAnalyzedOn: day });
  }
}

async function syncDailyBudgets(c: Ctx, graph: GraphClient, campaignId: string): Promise<void> {
  const { m, d } = c;
  const ours = (await listCampaignAdSets(graph, campaignId, d.signal)).filter((s) => Object.values(TEAM_ADSET_NAMES).includes(s.name));
  if (!ours.length) return;
  const budgets = splitDailyBudget(dailyBudgetMinor(m.monthlyLimitMinor), ours.length);
  for (const [i, s] of ours.entries()) {
    if (s.dailyBudgetMinor === budgets[i]) continue;
    await setDailyBudget(graph, s.id, budgets[i]!, d.signal);
    await c.act({ role: "launch", kind: "budget_set", metaObjectId: s.id, dedupeKey: `${m.id}:budget:${s.id}:${budgets[i]}`,
      summary: `Daily budget for "${s.name}" set to ${formatMoney(budgets[i]!, m.currency)} to stay inside your monthly limit.`, evidence: { fromMinor: s.dailyBudgetMinor, toMinor: budgets[i]! } });
  }
}

async function analyze(c: Ctx, graph: GraphClient, account: TeamAccount, day: string): Promise<void> {
  const { m, d, now } = c;
  const campaignId = m.campaignId!;
  const rows = (await d.store.publishRows(m.workspaceId, campaignId)).filter((r) => r.status === "published" && r.metaAdId);
  if (!rows.length) return;
  const since = dayKey(new Date(now.getTime() - 13 * 86_400_000), account.timezone);
  const insights = await fetchDailyAdInsights(graph, m.adAccountId, campaignId, since, day, d.signal);
  const statuses = new Map((await fetchAdStatuses(graph, rows.map((r) => r.metaAdId!), d.signal)).map((s) => [s.id, s]));
  const adOf = new Map(rows.map((r) => [r.metaAdId!, r]));
  const ourInsights = insights.filter((r) => adOf.has(r.metaAdId));
  await d.store.upsertPerf(m.workspaceId, ourInsights.map((r) => ({ ...r, adId: adOf.get(r.metaAdId)!.adId, status: statuses.get(r.metaAdId)?.effectiveStatus ?? null })));

  // Rejected by Meta review: record (the add step below replaces it).
  for (const r of rows) {
    const s = statuses.get(r.metaAdId!);
    if (s?.rejected) await c.act({ role: "analyst", kind: "ad_rejected", metaObjectId: r.metaAdId, dedupeKey: `${m.id}:rejected:${r.metaAdId}`,
      summary: `Meta didn't approve "${r.headline}"${s.reviewFeedback ? `: ${s.reviewFeedback}` : ""}. The team replaces it with another ad.`, evidence: { effectiveStatus: s.effectiveStatus } });
  }

  // Aggregate per Komendly ad (one ad = up to 2 Meta ads: feed + stories).
  const groups = new Map<string, { stats: AdStats; metaIds: string[] }>();
  for (const r of rows) {
    const g = groups.get(r.adId) ?? { stats: { metaAdId: r.metaAdId!, adId: r.adId, label: r.headline, launchedAt: r.createdAt, active: false, spendMinor: 0, impressions: 0, clicks: 0, leads: 0 }, metaIds: [] };
    g.metaIds.push(r.metaAdId!);
    if (statuses.get(r.metaAdId!)?.active) g.stats.active = true;
    if (r.createdAt < g.stats.launchedAt) g.stats.launchedAt = r.createdAt;
    groups.set(r.adId, g);
  }
  const groupOfMeta = new Map<string, string>();
  for (const [k, g] of groups) for (const id of g.metaIds) groupOfMeta.set(id, k);
  for (const r of ourInsights) {
    const g = groups.get(groupOfMeta.get(r.metaAdId)!)!;
    g.stats.spendMinor += r.spendMinor; g.stats.impressions += r.impressions; g.stats.clicks += r.clicks; g.stats.leads += r.leads;
  }
  const stats = [...groups.values()].map((g) => g.stats);
  const used = [...groups.keys()];
  const fresh = (await d.store.readyAds(m.workspaceId, used, TARGET_ACTIVE_ADS)).filter((a) => pickAssets(a).length > 0);
  const total = stats.reduce((t, s) => ({ spendMinor: t.spendMinor + s.spendMinor, impressions: t.impressions + s.impressions, leads: t.leads + s.leads }), { spendMinor: 0, impressions: 0, leads: 0 });
  await c.act({ role: "analyst", kind: "metrics_read", dedupeKey: `${m.id}:metrics:${day}`,
    summary: `Read the last 14 days from Meta: ${formatMoney(total.spendMinor, m.currency)} spent, ${total.leads} lead${total.leads === 1 ? "" : "s"} reported by Meta.`,
    evidence: { since, until: day, ...total, ads: stats.length, active: stats.filter((s) => s.active).length } });

  const decisions = decideOptimizations(stats, { now, dailyBudgetMinor: dailyBudgetMinor(m.monthlyLimitMinor), currency: m.currency, freshAvailable: fresh.length });
  for (const dec of decisions) {
    if (dec.kind === "pause") {
      const g = groups.get(dec.adId ?? "");
      if (!g) continue; // only ads Komendly published in this campaign
      for (const id of g.metaIds) {
        if (!statuses.get(id)?.active) continue;
        await setStatus(graph, id, "PAUSED", d.signal);
      }
      await c.act({ role: "analyst", kind: "ad_paused", metaObjectId: g.metaIds[0], dedupeKey: `${m.id}:pause:${g.metaIds.join(",")}`, summary: `Paused "${dec.label}". ${dec.reason}`, evidence: { ...dec.evidence, windowDays: 14, since, until: day } });
    } else if (dec.kind === "add") {
      const adSets = new Map<PlacementGroup, string>();
      for (const s of await listCampaignAdSets(graph, campaignId, d.signal)) {
        if (s.name === TEAM_ADSET_NAMES.feed) adSets.set("feed", s.id);
        if (s.name === TEAM_ADSET_NAMES.stories_reels) adSets.set("stories_reels", s.id);
      }
      const n = await publishAds(c, graph, fresh.slice(0, dec.count), adSets, campaignId, true);
      if (n) await c.act({ role: "creative", kind: "ads_added", dedupeKey: `${m.id}:add:${day}`, summary: `Added ${n} fresh ad${n === 1 ? "" : "s"} to your campaign.`, evidence: { requested: dec.count, added: n } });
    }
  }
}

// ---------- team_pause job (owner button, disconnect, refund) ----------

export async function teamPause(d: TeamDeps, workspaceId: string, reason: string | null, jobId: string): Promise<{ paused: boolean; error?: string }> {
  const m = await d.store.mandate(workspaceId);
  if (!m) return { paused: false, error: "no mandate" };
  const now = d.now?.() ?? new Date();
  const c = new Ctx(d, m, now);
  const code = reason?.trim() || "owner_paused";
  const why = PAUSE_REASONS[code] ?? code;
  let paused = false;
  let error: string | undefined;
  if (m.campaignId && m.launchedAt) {
    try {
      const token = await d.store.token(workspaceId, now);
      if (token) {
        await setStatus(graphFor(d, token.accessToken), m.campaignId, "PAUSED", d.signal);
        paused = true;
      } else error = "Meta not connected";
    } catch (e) {
      error = errMsg(e);
    }
  }
  if (!error || !isMetaAuthError(error)) {
    await c.patch({ state: "paused", stateReason: why });
  } else {
    await c.patch({ state: "needs_reconnect", stateReason: RECONNECT_REASON });
  }
  await c.act({ role: "launch", kind: "service_paused", outcome: error ? "failed" : "done", summary: error ? `Tried to pause your campaign but Meta answered: ${error.slice(0, 120)}. Meta's spend cap still holds.` : m.campaignId ? `Paused your campaign. ${why}` : why, metaObjectId: m.campaignId, dedupeKey: `team_pause:${jobId}` });
  await d.store.event(TEAM_EVENTS.paused, workspaceId, null, { campaignId: m.campaignId, reason: code, jobId, paused });
  if (code !== "owner_paused") await notifyOwner(d, m, error && isMetaAuthError(error) ? "needs_reconnect" : "paused", error ? `${why} Meta didn't confirm the pause (${error.slice(0, 120)}); the campaign's spend cap still holds.` : why);
  return { paused, ...(error ? { error } : {}) };
}

export async function handleTeamPause(ctx: JobContext, deps: Partial<TeamDeps> = {}): Promise<unknown> {
  const p = ctx.job.payload as { workspaceId?: unknown; reason?: unknown };
  const workspaceId = typeof p.workspaceId === "string" ? p.workspaceId : ctx.job.workspaceId;
  if (!workspaceId) throw new PermanentJobError("team_pause needs workspaceId");
  const store = deps.store ?? prismaTeamStore(ctx.db, ctx.storage);
  return teamPause({ notify: defaultTeamNotify(), ...deps, db: ctx.db, store, now: ctx.now, signal: ctx.signal }, workspaceId, typeof p.reason === "string" ? p.reason : null, ctx.job.id);
}

// ---------- loop ----------

export function startTeamOpsLoop(d: { db: Db; storage: Storage; fetch?: FetchLike; notify?: TeamNotify }, everyMs = 15 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    teamOpsTick({ db: d.db, store: prismaTeamStore(d.db, d.storage), fetch: d.fetch, notify: d.notify ?? defaultTeamNotify() })
      .then((r) => r.enabled && (r.actions || r.errors) && log("info", "team ops tick", { ...r }))
      .catch((e) => log("warn", "team ops tick failed", { error: errMsg(e) }))
      .finally(() => { running = false; });
  };
  const first = setTimeout(tick, 90_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}

// ---------- Prisma store ----------

const isQcPass = (r: unknown) => !!r && typeof r === "object" && (r as { pass?: unknown }).pass === true;
const PUBLISHABLE = new Set(["4:5", "1:1", "9:16"]);

export function prismaTeamStore(db: Db, storage: Storage): TeamStore {
  const mandateSelect = { workspace: { select: { ownerId: true, adsPlan: true, subscriptionStatus: true, suspendedAt: true } } } as const;
  return {
    async killSwitch() {
      return Boolean((await db.adsFeatureFlag.findUnique({ where: { key: TEAM_KILL_FLAG } }))?.enabled);
    },
    async mandates() {
      return db.marketingMandate.findMany({ include: mandateSelect, orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } }, take: 200 });
    },
    async mandate(workspaceId) {
      return db.marketingMandate.findUnique({ where: { workspaceId }, include: mandateSelect });
    },
    async token(workspaceId, now) {
      const conn = await db.metaConnection.findUnique({ where: { workspaceId }, select: { id: true } });
      if (!conn) return null;
      return workspaceToken(db, workspaceId, now.getTime());
    },
    async brand(workspaceId) {
      const run = await db.adRun.findFirst({ where: { workspaceId, kind: { not: "gift" }, brandProfileId: { not: null } }, orderBy: { createdAt: "desc" }, select: { url: true, extraction: true, brandProfile: true } });
      const bp = run?.brandProfile;
      const ex = (run?.extraction ?? {}) as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === "string" ? v : "");
      const industry = classifyIndustry({ brandName: s(ex.brandName) || bp?.name, mainOffer: s(ex.mainOffer) || bp?.mainOffer, audience: s(ex.audience) || bp?.audience, facts: ex.facts ?? bp?.facts, pains: ex.pains ?? bp?.pains, url: bp?.domain || run?.url });
      const screenText = [s(ex.industry), s(ex.brandName) || bp?.name, s(ex.mainOffer) || bp?.mainOffer, s(ex.description), bp?.audience].filter(Boolean).join(" · ");
      return { name: (s(ex.brandName) || bp?.name) ?? null, website: bp?.landingPage || bp?.url || run?.url || null, niche: industry?.slug ?? null, screenText };
    },
    async readyAds(workspaceId, exclude, limit) {
      if (limit <= 0) return [];
      const ads = await db.ad.findMany({
        where: { workspaceId, status: "ready", id: { notIn: exclude }, run: { kind: { not: "gift" } } },
        include: { assets: true }, orderBy: [{ run: { createdAt: "desc" } }, { index: "asc" }], take: 60,
      });
      return ads.filter((a) => isQcPass(a.qcReport) && a.assets.some((x) => PUBLISHABLE.has(x.ratio))).slice(0, limit).map((a) => ({
        id: a.id, headline: a.headline, body: a.body, cta: a.cta,
        assets: a.assets.filter((x) => PUBLISHABLE.has(x.ratio)).map((x) => ({ ratio: x.ratio, storageKey: x.storageKey, mime: x.mime })),
      }));
    },
    async media(ad, asset) {
      const filename = `komendly-${ad.id}-${asset.ratio.replace(":", "x")}`;
      if (asset.mime.startsWith("video/")) {
        const poster = (await db.adAsset.findFirst({ where: { adId: ad.id, ratio: "poster" } }))?.storageKey;
        return { kind: "video", filename, fileUrl: await storage.presignGet(asset.storageKey, VIDEO_URL_TTL_SECONDS), thumbnailUrl: await storage.presignGet(poster ?? asset.storageKey, VIDEO_URL_TTL_SECONDS) };
      }
      return { kind: "image", filename, mime: asset.mime, bytes: new Uint8Array(await storage.get(asset.storageKey)) };
    },
    async updateMandate(id, patch) {
      await db.marketingMandate.update({ where: { id }, data: patch });
    },
    async action(a) {
      try {
        await db.marketingAction.create({ data: { workspaceId: a.workspaceId, role: a.role, kind: a.kind, summary: a.summary, outcome: a.outcome ?? "done", evidence: (a.evidence ?? undefined) as object | undefined, metaObjectId: a.metaObjectId ?? null, dedupeKey: a.dedupeKey } });
        return true;
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") return false;
        throw e;
      }
    },
    async lastActionAt(workspaceId, kind) {
      return (await db.marketingAction.findFirst({ where: { workspaceId, kind }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }))?.createdAt ?? null;
    },
    async event(name, workspaceId, userId, props) {
      await db.adsEvent.create({ data: { name, workspaceId, userId, props: props as object } }).catch(() => undefined);
    },
    async publishRows(workspaceId, campaignId) {
      const rows = await db.metaPublish.findMany({ where: { campaignId, ad: { workspaceId } }, select: { adId: true, ratio: true, metaAdId: true, adSetId: true, status: true, createdAt: true, ad: { select: { headline: true } } } });
      return rows.map((r) => ({ adId: r.adId, ratio: r.ratio, metaAdId: r.metaAdId, adSetId: r.adSetId, status: r.status, createdAt: r.createdAt, headline: r.ad.headline || "Untitled ad" }));
    },
    async recordPublish(r) {
      await db.metaPublish.create({ data: { adId: r.adId, ratio: r.ratio, metaAdId: r.metaAdId, campaignId: r.campaignId, adSetId: r.adSetId, adAccountId: r.adAccountId, status: r.status, error: r.error ?? null } });
    },
    async upsertPerf(workspaceId, rows) {
      for (const r of rows) {
        const data = { workspaceId, adId: r.adId, spendMinor: r.spendMinor, impressions: r.impressions, clicks: r.clicks, leads: r.leads, status: r.status };
        await db.adPerformanceDay.upsert({ where: { metaAdId_day: { metaAdId: r.metaAdId, day: r.day } }, create: { ...data, metaAdId: r.metaAdId, day: r.day }, update: data });
      }
    },
    async requestDrop(m, now) {
      const r = await startWeeklyRun(db, { id: m.workspaceId, ownerId: m.workspace.ownerId }, isoWeekKey(now), now);
      return r.created;
    },
  };
}
