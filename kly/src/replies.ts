// Reply handling: AI-classify each human reply's intent; interested/question -> a short threaded auto-answer from the
// same mailbox (known facts only, max 2 per lead), anything uncertain -> founder alert; not_interested/unsubscribe ->
// suppress; not_now -> noted; auto_reply/OOO -> ignored.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ADS_GUARANTEE, ADS_PLANS } from "../../src/lib/ads/billing-config";
import { claimLink, signature, unsubscribeHeaders, unsubscribeLink } from "../../src/lib/ads/outbound/copy";
import { emailDomain, type MailboxEnv } from "../../src/lib/ads/outbound/policy";
import type { InboundClass } from "../../src/lib/ads/outbound/inbound";
import { ask, type AIProvider } from "./ai";
import type { Db } from "./db";
import { errMsg, log } from "./log";
import type { OutboundEnv, Transport } from "./sender";
import { addCost } from "./settings";

export const INTENTS = ["interested", "question", "not_now", "not_interested", "unsubscribe", "auto_reply", "other"] as const;
export type Intent = (typeof INTENTS)[number];
export const MAX_AUTO_REPLIES = 2;

export type AlertFn = (subject: string, text: string) => Promise<void>;
export type ReplyAction = "ignore" | "suppress" | "note" | "auto_reply" | "alert";

/** What to do with a classified reply. */
export function planReply(p: { intent: Intent; autoReply: boolean; autoReplies: number; canSend: boolean }): ReplyAction {
  switch (p.intent) {
    case "auto_reply":
      return "ignore";
    case "not_interested":
    case "unsubscribe":
      return "suppress";
    case "not_now":
      return "note";
    case "interested":
    case "question":
      return p.autoReply && p.canSend && p.autoReplies < MAX_AUTO_REPLIES ? "auto_reply" : "alert";
    default:
      return "alert";
  }
}

const IntentSchema = z.object({ intent: z.enum(INTENTS) });

export async function classifyIntent(provider: AIProvider | null, c: Pick<InboundClass, "subject" | "snippet">): Promise<{ intent: Intent; costMicros: number }> {
  if (!provider) return { intent: "other", costMicros: 0 };
  const r = await ask(provider, IntentSchema, {
    system: "Classify a reply to a cold email that offered a free Facebook/Instagram ad. interested = wants it / positive; question = asks something; not_now = maybe later; not_interested = no; unsubscribe = stop emailing; auto_reply = out-of-office or automatic; other = anything else.",
    prompt: `Subject: ${c.subject}\n\n${c.snippet.slice(0, 1500)}`,
    reasoning: "low",
  });
  return { intent: r.out.intent, costMicros: r.costMicros };
}

/** The only things Kly may say about Komendly (prices come from the live billing config). */
export function komendlyFacts(): string {
  const plans = ADS_PLANS.map((p) => `${p.name}: $${(p.priceCents / 100).toFixed(0)}/month`).join("; ");
  return [
    "Komendly turns a business's own website into Facebook and Instagram ads. Its ad wizard is called Ozzy.",
    "The ad we sent is free to keep and use, no strings attached. The claim link lets them get it plus a few more made the same way, free.",
    "After that there's a free trial, then monthly plans: " + plans + ".",
    ADS_GUARANTEE,
    "Komendly can publish ads to their Facebook/Instagram once they connect their Meta account; they can also download the images and run them themselves.",
    "They can unsubscribe anytime; we won't email again unless they reply.",
  ].join("\n");
}

const AnswerSchema = z.object({ answer: z.string().max(700), confident: z.boolean() });

/** Validate an AI answer: short, no links/emails/prices beyond the facts' wording, no hype. Error or null. */
export function checkAnswer(a: string): string | null {
  const t = a.trim();
  if (t.length < 20 || t.length > 700) return "length";
  if (/https?:|www\.|@/i.test(t)) return "link or address";
  if (/\b(guarantee(d)? (results|leads|sales)|roi|#1|act now|limited time|urgent)\b/i.test(t)) return "claim";
  return null;
}

export function replyEmail(o: { answer: string; senderName: string; claimUrl: string; postalAddress: string; unsubscribeUrl: string }): string {
  return [o.answer.trim(), "", `Your ad is here: ${o.claimUrl}`, "", ...signature(o.senderName), "", "--", `Komendly, ${o.postalAddress}`, `Not for you? Reply "stop" or unsubscribe: ${o.unsubscribeUrl}`].join("\n");
}

export async function suppress(db: Db, value: string, kind: "email" | "domain", reason: string): Promise<void> {
  const v = value.trim().toLowerCase();
  if (!v) return;
  await db.outboundSuppression.upsert({ where: { value: v }, create: { value: v, kind, reason }, update: {} });
}

export interface ReplyDeps {
  db: Db;
  provider: AIProvider | null;
  alert: AlertFn;
  autoReply: boolean;
  cfg: OutboundEnv;
  mailbox: MailboxEnv | null;
  transport: ((m: MailboxEnv) => Transport) | null;
  now?: () => Date;
}

type Lead = NonNullable<Awaited<ReturnType<Db["outboundLead"]["findFirst"]>>>;

export async function handleReply(d: ReplyDeps, x: { lead: Lead; sendId: string | undefined; mailboxId: string; c: InboundClass; inboundMessageId: string | null }): Promise<string> {
  const { db, lead, c } = { db: d.db, lead: x.lead, c: x.c };
  const now = d.now?.() ?? new Date();
  let intent: Intent = "other";
  try {
    const r = await classifyIntent(d.provider, c);
    intent = r.intent;
    await addCost(db, lead.id, r.costMicros, now);
  } catch (e) {
    log("warn", "kly intent failed", { error: errMsg(e) });
  }
  if (c.kind === "unsubscribe") intent = "unsubscribe";
  const autoReplies = await db.outboundSend.count({ where: { leadId: lead.id, kind: "reply" } });
  const action = planReply({ intent, autoReply: d.autoReply, autoReplies, canSend: Boolean(d.mailbox && d.transport && d.provider) });
  if (action === "ignore") return "auto_reply ignored";
  // Any human reply ends the sequence.
  if (x.sendId) await db.outboundSend.update({ where: { id: x.sendId }, data: { replied: true, replySnippet: c.snippet.slice(0, 500) } });
  await db.outboundMailbox.update({ where: { id: x.mailboxId }, data: { repliedTotal: { increment: 1 } } });
  if (action === "suppress") {
    await suppress(db, lead.email, "email", intent === "unsubscribe" ? "reply_stop" : "not_interested");
    if (c.fromAddress && emailDomain(c.fromAddress) === lead.domain) await suppress(db, lead.domain, "domain", "reply_stop");
    await db.outboundLead.update({ where: { id: lead.id }, data: { status: "unsubscribed", repliedAt: lead.repliedAt ?? now, replyIntent: intent } });
    return `suppressed (${intent})`;
  }
  await db.outboundLead.update({ where: { id: lead.id }, data: { status: lead.status === "signed_up" || lead.status === "paid" ? lead.status : "replied", repliedAt: lead.repliedAt ?? now, replyIntent: intent } });
  if (action === "note") return "noted (not now)";
  const claimUrl = claimLink(d.cfg.base, lead.claimToken);
  const unsubscribeUrl = unsubscribeLink(d.cfg.base, lead.unsubToken);
  let why = action === "alert" ? (autoReplies >= MAX_AUTO_REPLIES ? "auto-reply limit reached" : `intent ${intent}`) : "";
  if (action === "auto_reply" && d.provider && d.mailbox && d.transport) {
    try {
      const r = await ask(d.provider, AnswerSchema, {
        system: `You answer a small business owner who replied to Komendly's cold email (Ozzy, Komendly's ad wizard, made them a free ad). Write 1-4 short, friendly, plain sentences. Use ONLY these facts; if the answer isn't in them, set confident=false.\n${komendlyFacts()}\nNo links (one is added after your text), no greeting line, no sign-off, no hype.`,
        prompt: `Their message (subject "${c.subject}"):\n${c.snippet.slice(0, 1500)}`,
        reasoning: "medium",
      });
      await addCost(db, lead.id, r.costMicros, now);
      const bad = checkAnswer(r.out.answer);
      if (r.out.confident && !bad) {
        const m = d.mailbox;
        const text = replyEmail({ answer: r.out.answer, senderName: m.name, claimUrl, postalAddress: d.cfg.postalAddress, unsubscribeUrl });
        const subject = /^re:/i.test(c.subject) ? c.subject : `Re: ${c.subject || lead.businessName}`;
        const messageId = `<${randomUUID()}@${m.address.split("@")[1] ?? "getkomendly.com"}>`;
        const refs = [...c.refs, ...(x.inboundMessageId ? [x.inboundMessageId] : [])].join(" ");
        await d.transport(m)({ from: `"${m.name}" <${m.address}>`, to: c.fromAddress ?? lead.email, subject, text, messageId, headers: { ...unsubscribeHeaders(unsubscribeUrl, m.address), ...(x.inboundMessageId ? { "In-Reply-To": x.inboundMessageId } : {}), ...(refs ? { References: refs } : {}) } });
        await db.outboundSend.create({ data: { leadId: lead.id, mailboxId: x.mailboxId, step: 0, messageId, toEmail: c.fromAddress ?? lead.email, subject, body: text, copySource: "ai", sentAt: now, kind: "reply" } });
        return `auto-replied (${intent})`;
      }
      why = bad ? `draft rejected: ${bad}` : "not confident";
    } catch (e) {
      why = `auto-reply failed: ${errMsg(e)}`;
    }
  }
  await d.alert(
    `[Kly] Reply from ${lead.businessName} (${intent})`.slice(0, 120),
    [`${lead.businessName} (${lead.website}) replied; Kly did not answer automatically (${why}).`, "", `From: ${c.fromAddress ?? lead.email}`, `Subject: ${c.subject}`, "", c.snippet || "(no text)", "", `Claim link: ${claimUrl}`, "Answer them from the outbound mailbox. Their sequence is stopped."].join("\n"),
  ).catch((e: unknown) => log("warn", "kly reply alert failed", { error: errMsg(e) }));
  return `alerted (${intent})`;
}
