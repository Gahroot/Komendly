// Inbound auto-responder, server side. Fail closed: any error = no send (the reply is still stored and forwarded).
import { prisma } from "@/lib/prisma";
import { founderFrom } from "./lifecycle/founder";
import { sendAdsMail } from "./mailer";
import { reviewGate, type TextFn } from "@/lib/growth/review-gate";
import { getSelfRefundEligibility } from "./self-refund";
import { ANSWER_FACTS, AUTO_HEADER, buildAutoReply, CLASSIFY_SCHEMA, CLASSIFY_SYSTEM, classifyByRules, guardrailBlock, loopSkipReason, needsHuman, parseCategory, repliesTo, SENDER_WINDOW_MS, threadKey, type ReplyCategory } from "./auto-reply";

export interface InboundReply {
  emailId: string;
  from: string;
  fromName: string | null;
  subject: string;
  text: string;
  headers: Record<string, string | null>;
  userId: string | null;
  workspaceId: string | null;
  forwardTo: string;
}
export interface AutoReplyOutcome { category: ReplyCategory | null; replied: string | null; flagged: boolean; skipped: string | null }

const PAYING = ["active", "trialing", "past_due"];

/** The existing AI vendor (OpenAI Responses API, same key/model env as engine/src/providers/openai.ts), read inside the function. */
export const webText: TextFn = async (req) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const body: Record<string, unknown> = { model: process.env.OPENAI_TEXT_MODEL || "gpt-6.2-sol", instructions: req.system, input: [{ role: "user", content: [{ type: "input_text", text: req.prompt }] }], reasoning: { effort: "low" }, store: false };
  if (req.jsonSchema) body.text = { format: { type: "json_schema", name: "result", schema: req.jsonSchema, strict: false } };
  const res = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const r = (await res.json()) as { output?: Array<{ type: string; content?: Array<{ text?: string }> }> };
  const text = (r.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("");
  let json: unknown;
  if (req.jsonSchema) { try { json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { json = undefined; } }
  return { text, json };
};

export async function handleAutoReply(r: InboundReply, text: TextFn = webText): Promise<AutoReplyOutcome> {
  const out: AutoReplyOutcome = { category: null, replied: null, flagged: false, skipped: null };
  try {
    const skip = loopSkipReason({ from: r.from, subject: r.subject, headers: r.headers, forwardTo: r.forwardTo });
    if (skip) return { ...out, skipped: skip };

    const [user, ws] = await Promise.all([
      r.userId ? prisma.user.findUnique({ where: { id: r.userId }, select: { id: true, email: true, name: true, subscriptionStatus: true } }) : null,
      r.workspaceId ? prisma.adsWorkspace.findUnique({ where: { id: r.workspaceId } }) : null,
    ]);
    const paying = Boolean((ws && PAYING.includes(ws.subscriptionStatus) && ws.stripeSubscriptionId) || (user && PAYING.includes(user.subscriptionStatus ?? "")));

    let category = classifyByRules(r.text, { paying });
    if (!category) {
      try {
        const ai = await text({ system: CLASSIFY_SYSTEM, prompt: `Subject: ${r.subject}\n\n${r.text.slice(0, 3000)}`, jsonSchema: CLASSIFY_SCHEMA as unknown as Record<string, unknown> });
        category = parseCategory(ai.json ?? ai.text) ?? "other";
      } catch { category = "other"; }
    }
    out.category = category;

    if (needsHuman(category)) {
      let eligible: boolean | null = null;
      if (category === "refund_request" && ws && user) eligible = (await getSelfRefundEligibility(ws, user).catch(() => null))?.ok ?? null;
      await prisma.adsEvent.create({ data: { name: "email_needs_human", userId: r.userId, workspaceId: r.workspaceId, props: { emailId: r.emailId, from: r.from, subject: r.subject, category, paying, refundEligible: eligible } } });
      out.flagged = true;
    }
    if (category === "unsubscribe" || category === "not_interested") {
      const already = await prisma.adsEvent.findFirst({ where: { name: "email_unsubscribed", OR: [...(r.userId ? [{ userId: r.userId }] : []), { props: { path: ["email"], equals: r.from } }] }, select: { id: true } });
      if (!already) await prisma.adsEvent.create({ data: { name: "email_unsubscribed", userId: r.userId, workspaceId: r.workspaceId, props: { via: "reply", email: r.from, category } } });
    }
    if (!repliesTo(category)) return { ...out, skipped: "no auto-reply for category" };

    const key = threadKey(r.subject);
    const [senderRecent, threadTotal] = await Promise.all([
      prisma.adsEvent.count({ where: { name: "email_auto_replied", createdAt: { gte: new Date(Date.now() - SENDER_WINDOW_MS) }, props: { path: ["to"], equals: r.from } } }),
      prisma.adsEvent.count({ where: { name: "email_auto_replied", AND: [{ props: { path: ["to"], equals: r.from } }, { props: { path: ["thread"], equals: key } }] } }),
    ]);
    const blocked = guardrailBlock({ senderRecent, threadTotal });
    if (blocked) return { ...out, skipped: blocked };

    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
    const run = r.userId ? await prisma.adRun.findFirst({ where: { userId: r.userId }, orderBy: { createdAt: "desc" }, select: { id: true } }) : null;
    const ctx = { category, firstName: (user?.name ?? r.fromName ?? "").trim().split(/\s+/)[0] || null, runUrl: run ? `${base}/ads/runs/${run.id}` : null, pricingUrl: `${base}/pricing`, billingUrl: `${base}/ads/billing`, paying, answer: null as string | null };
    if (category === "how_to" || category === "interested" || category === "objection") {
      ctx.answer = await text({
        system: "You write ONE short paragraph (max 60 words, plain text, no greeting, no sign-off, no links) answering a customer's email as Nolan, Komendly's founder. Warm, honest. Use ONLY the facts given. Never promise leads, sales or results. If unsure, say you'll check.",
        prompt: `FACTS:\n${ANSWER_FACTS}\n\nTheir email:\n${r.text.slice(0, 2000)}`,
      }).then((x) => x.text.trim().slice(0, 600) || null).catch(() => null);
    }
    const body = buildAutoReply(ctx);
    if (!body) return { ...out, skipped: "nothing to send" };

    const gate = await reviewGate(text, { system: "inbound_auto_reply", kind: "email", itemKey: `reply:${r.emailId}`, content: body, facts: ANSWER_FACTS });
    await prisma.adsEvent.create({ data: { name: "review_gate", props: { system: "inbound_auto_reply", kind: "email", itemKey: `reply:${r.emailId}`, approved: gate.approved, reasons: gate.verdict.reasons, attempt: 1 } } }).catch(() => {});
    if (!gate.approved || !gate.content) return { ...out, skipped: "review gate blocked" };

    const subject = `Re: ${r.subject.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim() || "your message"}`.slice(0, 200);
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Record first: if the send then fails we under-reply rather than double-reply (fail closed).
    await prisma.adsEvent.create({ data: { name: "email_auto_replied", userId: r.userId, workspaceId: r.workspaceId, props: { emailId: r.emailId, to: r.from, category, subject, thread: key } } });
    const outcome = await sendAdsMail({ to: r.from, from: founderFrom(), replyTo: "nolan@prestyj.com", subject, text: gate.content, html: `<pre style="white-space:pre-wrap;font-family:inherit">${esc(gate.content)}</pre>`, headers: { [AUTO_HEADER]: "1", "Auto-Submitted": "auto-replied" } });
    return { ...out, replied: outcome === "sent" ? gate.content : null, skipped: outcome === "sent" ? null : "log only" };
  } catch (err) {
    console.error("[auto-reply] failed closed", err);
    return { ...out, skipped: "error" };
  }
}
