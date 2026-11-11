import { createHash } from "node:crypto";

/** Meta Conversions API (server events). No-op without META_CAPI_TOKEN; never throws; 2.5 s timeout. */
export const META_PIXEL_ID_DEFAULT = "2076490092891007";
const GRAPH_VERSION = "v23.0";

export type MetaEventName = "CompleteRegistration" | "StartTrial" | "TrialCompleted" | "InitiateCheckout" | "Purchase" | "Subscribe" | "Renewal" | "ViewContent" | "Lead" | "StudioFirstVideo";

export type MetaUserContext = {
  email?: string | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** ISO 3166 alpha-2, e.g. "us". */
  country?: string | null;
  /** State / region code, e.g. "ca". */
  state?: string | null;
  city?: string | null;
  zip?: string | null;
};

/** Meta normalisation before hashing: lowercase; city without spaces/punctuation; US zip = first 5 digits. */
const norm = {
  name: (v: string) => v.trim().toLowerCase().replace(/[^\p{L}\p{M}'-]/gu, ""),
  city: (v: string) => v.trim().toLowerCase().replace(/[^\p{L}]/gu, ""),
  code: (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]/g, ""),
  zip: (v: string) => v.trim().toLowerCase().replace(/\s+/g, "").split("-")[0],
};

export type MetaServerEvent = {
  eventName: MetaEventName;
  eventId: string;
  eventTime: Date;
  sourceUrl?: string | null;
  user: MetaUserContext;
  value?: number;
  currency?: string;
  customData?: Record<string, string | number | boolean>;
};

export const sha256 = (v: string): string => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

/** The Graph API `data[]` item (pure; exported for tests). */
export function buildMetaEvent(e: MetaServerEvent): Record<string, unknown> {
  const u = e.user;
  const user_data: Record<string, unknown> = {};
  if (u.email) user_data.em = [sha256(u.email)];
  if (u.userId) user_data.external_id = [sha256(u.userId)];
  if (u.ip) user_data.client_ip_address = u.ip;
  if (u.userAgent) user_data.client_user_agent = u.userAgent;
  if (u.fbc) user_data.fbc = u.fbc;
  if (u.fbp) user_data.fbp = u.fbp;
  const hashed = (key: string, v: string | null | undefined, f: (s: string) => string) => {
    const n = v ? f(v) : "";
    if (n) user_data[key] = [sha256(n)];
  };
  hashed("fn", u.firstName, norm.name);
  hashed("ln", u.lastName, norm.name);
  hashed("country", u.country, norm.code);
  hashed("st", u.state, norm.code);
  hashed("ct", u.city, norm.city);
  hashed("zp", u.zip, norm.zip);
  const custom_data: Record<string, unknown> = { ...(e.customData ?? {}) };
  if (e.value !== undefined) {
    custom_data.value = e.value;
    custom_data.currency = (e.currency ?? "USD").toUpperCase();
  }
  return {
    event_name: e.eventName,
    event_time: Math.floor(e.eventTime.getTime() / 1000),
    event_id: e.eventId,
    action_source: "website",
    ...(e.sourceUrl ? { event_source_url: e.sourceUrl } : {}),
    user_data,
    ...(Object.keys(custom_data).length ? { custom_data } : {}),
  };
}

export type MetaSendResult = { ok: true; eventsReceived: number } | { ok: false; reason: string };

export async function sendMetaEvents(events: MetaServerEvent[], signal?: AbortSignal): Promise<MetaSendResult> {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return { ok: false, reason: "no_token" };
  if (events.length === 0) return { ok: true, eventsReceived: 0 };
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID || META_PIXEL_ID_DEFAULT;
  const testCode = process.env.META_CAPI_TEST_CODE;
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: events.map(buildMetaEvent), ...(testCode ? { test_event_code: testCode } : {}) }),
      signal: signal ?? AbortSignal.timeout(2500),
    });
    const body = (await res.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string } };
    if (!res.ok) return { ok: false, reason: body.error?.message ?? `http_${res.status}` };
    return { ok: true, eventsReceived: body.events_received ?? 0 };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "fetch_failed" };
  }
}
