// Classify one raw inbound message from an outbound mailbox (IMAP): bounce (DSN), spam complaint (ARF), reply,
// unsubscribe-style reply, or auto-reply. Pure; the engine maps the result onto leads/sends/suppressions.

export type InboundKind = "bounce" | "complaint" | "unsubscribe" | "reply" | "auto_reply" | "other";

export interface InboundClass {
  kind: InboundKind;
  /** Message-IDs this message refers to (In-Reply-To / References / embedded original headers). */
  refs: string[];
  /** Failed recipient for DSNs, when present. */
  failedRecipient: string | null;
  fromAddress: string | null;
  subject: string;
  /** First lines of the human text, for the founder alert. */
  snippet: string;
}

function header(head: string, name: string): string {
  const re = new RegExp(`^${name}:[ \\t]*((?:.*)(?:\\r?\\n[ \\t].*)*)`, "im");
  return (head.match(re)?.[1] ?? "").replace(/\r?\n[ \t]+/g, " ").trim();
}

const STOP_RE = /^\s*(unsubscribe|stop|remove( me)?|take me off|no thanks|not interested|do not (contact|email)|don'?t (contact|email))\b/i;
const STOP_ANY_RE = /\b(unsubscribe|remove me|take me off (your|the) list|stop emailing|do not contact|don'?t contact|opt.?out)\b/i;

/** The human part of a reply: drop quoted lines and everything after "On ... wrote:". */
export function replyText(body: string): string {
  const lines: string[] = [];
  for (const l of body.split(/\r?\n/)) {
    if (/^On .+wrote:\s*$/i.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim()) || /^From: /i.test(l.trim())) break;
    if (l.trim().startsWith(">")) continue;
    lines.push(l);
  }
  return lines.join("\n").trim();
}

function textPart(raw: string, head: string): string {
  const ctype = header(head, "Content-Type");
  const body = raw.slice(head.length);
  const boundary = ctype.match(/boundary="?([^";]+)"?/i)?.[1];
  if (!boundary) return body;
  for (const part of body.split(`--${boundary}`)) {
    const sep = part.search(/\r?\n\r?\n/);
    if (sep === -1) continue;
    const ph = part.slice(0, sep);
    if (/content-type:\s*text\/plain/i.test(ph)) {
      const content = part.slice(sep).trim();
      return /quoted-printable/i.test(ph) ? content.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))) : content;
    }
  }
  return body;
}

export function classifyInbound(raw: string): InboundClass {
  const sep = raw.search(/\r?\n\r?\n/);
  const head = sep === -1 ? raw : raw.slice(0, sep);
  const from = header(head, "From");
  const fromAddress = (from.match(/<([^>]+)>/)?.[1] ?? from.match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? "").toLowerCase() || null;
  const subject = header(head, "Subject");
  const ctype = header(head, "Content-Type");
  const refs = [...new Set(`${header(head, "In-Reply-To")} ${header(head, "References")} ${raw.match(/^Message-ID:.*$/gim)?.slice(1).join(" ") ?? ""}`.match(/<[^<>\s]+@[^<>\s]+>/g) ?? [])];
  const failed = raw.match(/^(?:Final-Recipient|Original-Recipient):\s*rfc822;\s*<?([^\s>]+@[^\s>]+)>?/im)?.[1] ?? header(head, "X-Failed-Recipients").split(",")[0]?.trim() ?? "";
  const text = textPart(raw, head);
  const snippet = replyText(text).replace(/\s+/g, " ").slice(0, 400);
  const base = { refs, failedRecipient: failed ? failed.toLowerCase() : null, fromAddress, subject, snippet };

  if (/report-type="?feedback-report/i.test(ctype) || /^Feedback-Type:\s*abuse/im.test(raw)) return { ...base, kind: "complaint" };
  const daemon = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i.test(from);
  if (/report-type="?delivery-status/i.test(ctype) || (daemon && /(undeliver|delivery (status|failure|has failed)|failure notice|returned mail|address not found)/i.test(`${subject} ${text.slice(0, 2000)}`))) {
    // Delayed DSNs are not bounces.
    if (/^Action:\s*delayed/im.test(raw) && !/^Action:\s*failed/im.test(raw)) return { ...base, kind: "other" };
    return { ...base, kind: "bounce" };
  }
  if (/^Auto-Submitted:\s*auto-(replied|generated)/im.test(head) || /^X-Autoreply:/im.test(head) || /^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office)/i.test(subject)) return { ...base, kind: "auto_reply" };
  const human = replyText(text);
  if (STOP_RE.test(human) || STOP_RE.test(subject) || (human.length < 400 && STOP_ANY_RE.test(human))) return { ...base, kind: "unsubscribe" };
  if (refs.length > 0 || /^re:/i.test(subject)) return { ...base, kind: "reply" };
  return { ...base, kind: "other" };
}
