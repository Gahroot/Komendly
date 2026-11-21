// Meta `leadgen` webhook primitives (growth system lead_alerts, flag sys_lead_alerts). Framework-free (node:crypto only).
// Signature: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, META_APP_SECRET); verify on request.text() before parsing.
import { createHmac, timingSafeEqual } from "node:crypto";

/** True only for a well-formed header whose HMAC of the exact raw body matches (constant-time). */
export function verifyMetaSignature(rawBody: string, header: string | null | undefined, appSecret: string | undefined): boolean {
  if (!appSecret || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const got = Buffer.from(m[1]!, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** GET subscription handshake: returns hub.challenge to echo, or null (respond 403). */
export function verifyHandshake(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  const t = params.get("hub.verify_token") ?? "";
  const a = Buffer.from(t), b = Buffer.from(verifyToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return params.get("hub.challenge");
}

export interface LeadgenChange { leadgenId: string; pageId: string; formId: string | null; adId: string | null; createdTime: number | null }

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

/** Leadgen changes of a page webhook payload; anything else is ignored. */
export function parseLeadgenPayload(json: unknown): LeadgenChange[] {
  const o = json as { object?: unknown; entry?: unknown };
  if (!o || o.object !== "page" || !Array.isArray(o.entry)) return [];
  const out: LeadgenChange[] = [];
  for (const e of o.entry as Array<{ id?: unknown; changes?: unknown }>) {
    if (!e || !Array.isArray(e.changes)) continue;
    for (const c of e.changes as Array<{ field?: unknown; value?: Record<string, unknown> }>) {
      if (!c || c.field !== "leadgen" || !c.value) continue;
      const leadgenId = str(c.value.leadgen_id);
      const pageId = str(c.value.page_id) ?? str(e.id);
      if (!leadgenId || !pageId) continue;
      const t = Number(c.value.created_time);
      out.push({ leadgenId, pageId, formId: str(c.value.form_id), adId: str(c.value.ad_id), createdTime: Number.isFinite(t) && t > 0 ? t : null });
    }
  }
  return out;
}
