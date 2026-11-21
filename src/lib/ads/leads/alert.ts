// Instant lead alerts (growth system lead_alerts): a Meta `leadgen` webhook -> fetch the lead (leads_retrieval, page
// token) -> email the business owner. Email only (no SMS/calls). Idempotent by leadgen_id: an AdsEvent
// `meta_lead_alerted` {leadgenId} is claimed before sending and released if the send fails (Meta then retries).
// Framework-free; Prisma/Next glue lives in ./server.ts.
import { precheck } from "../../growth/review-gate";
import { renderLifecycleHtml, renderLifecycleText, unsubscribeHeaders, type LifecycleEmailInput } from "../lifecycle/template";
import { answerText, questionLabel } from "./questions";
import type { LeadgenChange } from "./webhook";

export const LEAD_ALERTED_EVENT = "meta_lead_alerted";
export const LEADGEN_SUBSCRIBED_EVENT = "meta_leadgen_subscribed";
export const LEADS_CENTER_URL = "https://business.facebook.com/latest/leads_center";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export interface MetaLead { id: string; createdTime: string | null; adName: string | null; fields: Array<{ name: string; values: string[] }> }

export function parseLead(json: unknown): MetaLead | null {
  const o = json as { id?: unknown; created_time?: unknown; ad_name?: unknown; field_data?: unknown };
  if (!o || typeof o.id !== "string") return null;
  const fields = Array.isArray(o.field_data)
    ? (o.field_data as Array<{ name?: unknown; values?: unknown }>).flatMap((f) => (f && typeof f.name === "string" ? [{ name: f.name, values: Array.isArray(f.values) ? f.values.filter((v): v is string => typeof v === "string") : [] }] : []))
    : [];
  return { id: o.id, createdTime: typeof o.created_time === "string" ? o.created_time : null, adName: typeof o.ad_name === "string" && o.ad_name ? o.ad_name : null, fields };
}

async function graphJson(f: FetchLike, url: string, init?: RequestInit): Promise<unknown> {
  const res = await f(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`meta_${res.status}: ${(json as { error?: { message?: string } }).error?.message ?? "request failed"}`);
  return json;
}

/** Page access token from the owner's user token (the user must manage the page). */
export async function pageAccessToken(f: FetchLike, o: { userToken: string; pageId: string; graphVersion: string }): Promise<string> {
  const j = (await graphJson(f, `https://graph.facebook.com/${o.graphVersion}/${encodeURIComponent(o.pageId)}?${new URLSearchParams({ fields: "access_token", access_token: o.userToken })}`)) as { access_token?: string };
  if (!j.access_token) throw new Error("meta_page_token_missing");
  return j.access_token;
}

/** The lead itself (leads_retrieval), read with a page access token. */
export async function fetchLead(f: FetchLike, o: { pageToken: string; leadgenId: string; graphVersion: string }): Promise<MetaLead> {
  const j = await graphJson(f, `https://graph.facebook.com/${o.graphVersion}/${encodeURIComponent(o.leadgenId)}?${new URLSearchParams({ fields: "id,created_time,ad_name,field_data", access_token: o.pageToken })}`);
  const lead = parseLead(j);
  if (!lead) throw new Error("meta_lead_unreadable");
  return lead;
}

/** Subscribe the app to the page's leadgen webhook (pages_manage_metadata). Idempotent on Meta's side. */
export async function subscribePageToLeadgen(f: FetchLike, o: { pageToken: string; pageId: string; graphVersion: string }): Promise<void> {
  const body = new URLSearchParams({ subscribed_fields: "leadgen", access_token: o.pageToken });
  const j = (await graphJson(f, `https://graph.facebook.com/${o.graphVersion}/${encodeURIComponent(o.pageId)}/subscribed_apps`, { method: "POST", body })) as { success?: boolean };
  if (j.success !== true) throw new Error("meta_subscribe_failed");
}

const MASK = "[answer]";

/** The owner's email. `mask` swaps lead answers for a token so precheck judges only our own wording. */
export function leadAlertEmail(lead: MetaLead, o: { businessName: string | null; appUrl: string; unsubscribeUrl: string; mask?: boolean }): LifecycleEmailInput {
  const answers = lead.fields.map((f) => ({ label: questionLabel(f.name), text: answerText(f.values) })).filter((a) => a.text);
  const name = lead.fields.find((f) => f.name === "full_name" || f.name === "first_name")?.values[0]?.trim();
  const who = o.mask ? MASK : name || "someone";
  const brand = o.businessName?.trim();
  const when = lead.createdTime ? new Date(lead.createdTime) : null;
  const received = when && !Number.isNaN(when.getTime()) ? when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : null;
  return {
    appUrl: o.appUrl,
    subject: `New lead from your Meta ad: ${who}`.slice(0, 120),
    preheader: `${who} filled in your lead form${brand ? ` for ${brand}` : ""}.`,
    paragraphs: [
      `New lead${brand ? ` for ${brand}` : ""}: ${who} just filled in the lead form on your Facebook/Instagram ad. Their answers:`,
      ...(answers.length ? answers.map((a) => `${a.label}: ${o.mask ? MASK : a.text}`) : ["(The form came in without answers. You can see it in Meta's Leads Center.)"]),
      [lead.adName ? `Ad: ${o.mask ? MASK : lead.adName}` : null, received ? `Received: ${received}` : null].filter(Boolean).join(" · ") || "This lead came from your ad's instant form.",
      "The lead is also saved in Meta's Leads Center.",
      "You get this alert because your ads run through Komendly's Ozzy Ad Department.",
    ],
    cta: { label: "Open Leads Center", href: LEADS_CENTER_URL },
    unsubscribeUrl: o.unsubscribeUrl,
  };
}

export interface LeadOwner { workspaceId: string; userId: string; email: string; businessName: string | null; userToken: string }
export interface LeadAlertDeps {
  /** The workspace whose Meta connection uses this page (null = not ours). */
  ownerForPage(pageId: string): Promise<LeadOwner | null>;
  optedOut(userId: string): Promise<boolean>;
  /** Claim the leadgen id; returns a claim id, or null when it was already alerted. Must be race-safe. */
  claim(leadgenId: string, owner: LeadOwner, change: LeadgenChange): Promise<string | null>;
  release(claimId: string): Promise<void>;
  getLead(owner: LeadOwner, change: LeadgenChange): Promise<MetaLead>;
  unsubscribeUrl(userId: string): string | null;
  send(m: { to: string; subject: string; text: string; html: string; headers: Record<string, string> }): Promise<void>;
  appUrl: string;
}

export type LeadAlertOutcome = "sent" | "duplicate" | "not_ours" | "opted_out" | "no_unsubscribe" | "blocked";

/** One leadgen change end to end. Throws (after releasing the claim) when fetching or sending fails, so Meta retries. */
export async function processLeadgen(change: LeadgenChange, d: LeadAlertDeps): Promise<{ outcome: LeadAlertOutcome; reasons?: string[] }> {
  const owner = await d.ownerForPage(change.pageId);
  if (!owner) return { outcome: "not_ours" };
  if (await d.optedOut(owner.userId)) return { outcome: "opted_out" };
  const unsub = d.unsubscribeUrl(owner.userId);
  if (!unsub) return { outcome: "no_unsubscribe" };
  const claimId = await d.claim(change.leadgenId, owner, change);
  if (!claimId) return { outcome: "duplicate" };
  try {
    const lead = await d.getLead(owner, change);
    const base = { businessName: owner.businessName, appUrl: d.appUrl, unsubscribeUrl: unsub };
    const reasons = precheck({ system: "lead_alerts", kind: "email", itemKey: `lead:${change.leadgenId}`, content: renderLifecycleText(leadAlertEmail(lead, { ...base, mask: true })) });
    if (reasons.length) return { outcome: "blocked", reasons }; // claim kept: our template is wrong, retrying would not help
    const input = leadAlertEmail(lead, base);
    await d.send({ to: owner.email, subject: input.subject, text: renderLifecycleText(input), html: renderLifecycleHtml(input), headers: unsubscribeHeaders(unsub) });
    return { outcome: "sent" };
  } catch (e) {
    await d.release(claimId).catch(() => undefined);
    throw e;
  }
}
