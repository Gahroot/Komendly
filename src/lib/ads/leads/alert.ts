// Instant lead alerts (growth system lead_alerts; Lead Desk of the team service, prd.md R6): a Meta `leadgen` webhook ->
// fetch the lead (leads_retrieval, page token) -> store it once in MetaLead -> email the lead email of the page's
// MarketingMandate (else the workspace owner). Email only: we never contact the lead.
// Idempotency (like CreditPurchase): the MetaLead create runs before any email and `leadgenId @unique` makes a replay
// fail there. `notifiedAt` is claimed (null -> now) right before sending and reset to null if the send fails, so Meta's
// retry sends it without a second row. Framework-free; Prisma/Next glue lives in ./server.ts.
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

/** Contact fields + answers pulled out of a Meta lead (what MetaLead stores). */
export interface LeadContact { name: string | null; email: string | null; phone: string | null; zip: string | null; answers: Array<{ label: string; text: string }> }

const firstValue = (lead: MetaLead, ...names: string[]): string | null => {
  for (const n of names) {
    const v = lead.fields.find((f) => f.name === n)?.values.map((x) => x.trim()).find(Boolean);
    if (v) return v;
  }
  return null;
};

export function extractLeadContact(lead: MetaLead): LeadContact {
  const joined = [firstValue(lead, "first_name"), firstValue(lead, "last_name")].filter(Boolean).join(" ");
  return {
    name: firstValue(lead, "full_name") ?? (joined || null),
    email: firstValue(lead, "email")?.toLowerCase() ?? null,
    phone: firstValue(lead, "phone_number", "phone"),
    zip: firstValue(lead, "zip_code", "post_code", "zip", "postal_code"),
    answers: lead.fields.map((f) => ({ label: questionLabel(f.name), text: answerText(f.values) })).filter((a) => a.text),
  };
}

/** Owner-facing activity line: "New lead: Jane from 94110" (first name only). */
export function leadSummary(c: Pick<LeadContact, "name" | "zip">): string {
  const first = c.name?.trim().split(/\s+/)[0] || "someone";
  return `New lead: ${first}${c.zip ? ` from ${c.zip}` : ""}`.slice(0, 120);
}

export { leadActionKey } from "./retention";

export interface LeadOwner {
  workspaceId: string;
  userId: string;
  /** Where the lead goes: the mandate's lead email, else the workspace owner's email. */
  email: string;
  businessName: string | null;
  userToken: string;
  /** True when the page belongs to a MarketingMandate (team service): the lead is also recorded as team activity. */
  mandate: boolean;
}
export interface StoredLead { id: string; notifiedAt: Date | null }
export interface NewLeadRow extends LeadContact { workspaceId: string; leadgenId: string; metaAdId: string | null; formId: string | null; pageId: string; receivedAt: Date }
export interface LeadAlertDeps {
  /** The mandate (else Meta connection) whose page this is (null = not ours). */
  ownerForPage(pageId: string): Promise<LeadOwner | null>;
  findLead(leadgenId: string): Promise<StoredLead | null>;
  /** Plain create (never an upsert). Returns null when the leadgenId already exists (unique violation). */
  storeLead(row: NewLeadRow): Promise<StoredLead | null>;
  /** Atomically set notifiedAt where it is still null; false = someone else is sending / sent it. */
  claimNotify(id: string): Promise<boolean>;
  /** Reset notifiedAt to null after a failed send so a retry can deliver it. */
  releaseNotify(id: string): Promise<void>;
  /** Team activity: MarketingAction (dedupeKey lead:<id>) + AdsEvent team_first_lead once per workspace. Idempotent. */
  recordTeamLead(o: { workspaceId: string; leadgenId: string; summary: string }): Promise<void>;
  optedOut(userId: string): Promise<boolean>;
  getLead(owner: LeadOwner, change: LeadgenChange): Promise<MetaLead>;
  unsubscribeUrl(userId: string): string | null;
  send(m: { to: string; subject: string; text: string; html: string; headers: Record<string, string> }): Promise<void>;
  appUrl: string;
  now?: () => Date;
}

export type LeadAlertOutcome = "sent" | "duplicate" | "not_ours" | "opted_out" | "no_unsubscribe" | "blocked";

/**
 * One leadgen change end to end. Throws when fetching, storing or sending fails, so Meta retries; a stored lead whose
 * email failed keeps notifiedAt null and is sent by the retry. Opted-out / blocked leads stay stored (dashboard) unsent.
 */
export async function processLeadgen(change: LeadgenChange, d: LeadAlertDeps): Promise<{ outcome: LeadAlertOutcome; reasons?: string[] }> {
  const owner = await d.ownerForPage(change.pageId);
  if (!owner) return { outcome: "not_ours" };
  const existing = await d.findLead(change.leadgenId);
  if (existing?.notifiedAt) return { outcome: "duplicate" };
  const lead = await d.getLead(owner, change);
  const contact = extractLeadContact(lead);
  let row = existing;
  if (!row) {
    const when = change.createdTime ? new Date(change.createdTime * 1000) : d.now?.() ?? new Date();
    row = await d.storeLead({ ...contact, workspaceId: owner.workspaceId, leadgenId: change.leadgenId, metaAdId: change.adId, formId: change.formId, pageId: change.pageId, receivedAt: when });
    if (!row) return { outcome: "duplicate" }; // a concurrent delivery stored it first and is sending it
  }
  if (owner.mandate) {
    await d.recordTeamLead({ workspaceId: owner.workspaceId, leadgenId: change.leadgenId, summary: leadSummary(contact) })
      .catch((e) => console.warn("[lead_alerts] team activity failed", change.leadgenId, e instanceof Error ? e.message : e));
  }
  if (await d.optedOut(owner.userId)) return { outcome: "opted_out" };
  const unsub = d.unsubscribeUrl(owner.userId);
  if (!unsub) return { outcome: "no_unsubscribe" };
  const base = { businessName: owner.businessName, appUrl: d.appUrl, unsubscribeUrl: unsub };
  const reasons = precheck({ system: "lead_alerts", kind: "email", itemKey: `lead:${change.leadgenId}`, content: renderLifecycleText(leadAlertEmail(lead, { ...base, mask: true })) });
  if (reasons.length) return { outcome: "blocked", reasons }; // stored, not sent: our template is wrong, retrying would not help
  if (!(await d.claimNotify(row.id))) return { outcome: "duplicate" };
  const input = leadAlertEmail(lead, base);
  try {
    await d.send({ to: owner.email, subject: input.subject, text: renderLifecycleText(input), html: renderLifecycleHtml(input), headers: unsubscribeHeaders(unsub) });
  } catch (e) {
    await d.releaseNotify(row.id).catch(() => undefined);
    throw e;
  }
  return { outcome: "sent" };
}
