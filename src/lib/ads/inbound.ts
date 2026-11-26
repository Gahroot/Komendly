// Founder reply inbox (Resend inbound): pure helpers, no package imports (unit-tested).
import { createHmac, timingSafeEqual } from "node:crypto";

export const SVIX_TOLERANCE_MS = 5 * 60_000;

/** Svix/Resend webhook signature check: HMAC-SHA256(`${id}.${timestamp}.${body}`) with the base64 secret after `whsec_`. */
export function verifySvixSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now: number = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts * 1000) > SVIX_TOLERANCE_MS) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** `"Jane Doe" <jane@x.com>` | `jane@x.com` -> { email (lower-cased), name }. */
export function parseAddress(raw: string | null | undefined): { email: string; name: string | null } {
  const s = (raw ?? "").trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim() || null };
  return { email: s.toLowerCase(), name: null };
}

export const REPLY_TEXT_MAX = 8000;

/** Plain-text reply without the quoted history (cut at "On ... wrote:", "-----Original Message-----", or a trailing `>` block). */
export function stripQuotedReply(text: string | null | undefined, max: number = REPLY_TEXT_MAX): string {
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(t) || /^_{5,}$/.test(t)) break;
    // "On Mon, 1 Jan 2026 at 10:00, Nolan <nolan@komendly.com> wrote:" (Gmail sometimes wraps it over 2 lines)
    if (/^On\s.+wrote:$/i.test(t) || (/^On\s/i.test(t) && /wrote:$/i.test((lines[i + 1] ?? "").trim()))) break;
    if (t.startsWith(">")) {
      // A quote block that runs to the end (ignoring blank lines) is history; inline quotes stay.
      if (lines.slice(i).every((x) => !x.trim() || x.trim().startsWith(">"))) break;
    }
    out.push(l);
  }
  const s = out.join("\n").trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** Header value from Resend's `headers` (object or [{name, value}] list). */
export function headerValue(headers: unknown, name: string): string | null {
  const n = name.toLowerCase();
  if (Array.isArray(headers)) {
    const h = headers.find((x) => x && typeof x === "object" && String((x as Record<string, unknown>).name ?? "").toLowerCase() === n);
    const v = h ? (h as Record<string, unknown>).value : null;
    return typeof v === "string" ? v : null;
  }
  if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === n) return typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") || null : null;
    }
  }
  return null;
}

/** Very small HTML -> text fallback when the email has no text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*$/i, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n");
}

/** Where replies to Komendly mail are forwarded so a person reads them (REPLY_FORWARD_TO, default Nolan's inbox). */
export function replyForwardTo(): string {
  return (process.env.REPLY_FORWARD_TO || "nolan@prestyj.com").trim();
}

/** Our own sending domains: mail from these (codes, tests) is stored but never forwarded (no loops). */
const OWN_DOMAINS = ["komendly.com", "getkomendly.com"];

/**
 * The forward of one received reply to the founder's inbox, or null when it shouldn't be forwarded
 * (no sender, sent by us, or sent by the forward address itself). Reply-To is the original sender,
 * so hitting Reply answers the customer directly.
 */
export function buildReplyForward(r: { from: string; fromName: string | null; to: string[]; subject: string; text: string }, forwardTo: string = replyForwardTo(), auto?: { category: string | null; replied: string | null; flagged: boolean }): { to: string; replyTo: string; subject: string; text: string; html: string } | null {
  const from = r.from.trim().toLowerCase();
  if (!from || !forwardTo || from === forwardTo.toLowerCase()) return null;
  const domain = from.split("@")[1] ?? "";
  if (OWN_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return null;
  const who = r.fromName ? `${r.fromName} <${r.from}>` : r.from;
  const prefix = auto?.replied ? "Auto-replied: " : auto?.flagged ? "Needs review: " : "";
  const subject = `${prefix}Reply from ${r.fromName || r.from}: ${r.subject || "(no subject)"}`.slice(0, 200);
  const autoNote = auto?.replied ? `\n\n--- I auto-replied (${auto.category}) with:\n${auto.replied}` : auto?.flagged ? `\n\n--- Flagged for you (${auto.category}).` : "";
  const bodyText = `${r.text || "(no text)"}${autoNote}`;
  const text = `${who} replied to ${r.to.join(", ") || "Komendly"}.\nHit Reply to answer them directly.\n\n${bodyText}`;
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<p><b>${esc(who)}</b> replied to ${esc(r.to.join(", ") || "Komendly")}. Hit Reply to answer them directly.</p><pre style="white-space:pre-wrap;font-family:inherit">${esc(bodyText)}</pre>`;
  return { to: forwardTo, replyTo: r.from, subject, text, html };
}
