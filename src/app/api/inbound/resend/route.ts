import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReplyForward, headerValue, htmlToText, parseAddress, stripQuotedReply, verifySvixSignature } from "@/lib/ads/inbound";
import { sendAdsMail } from "@/lib/ads/mailer";

export const dynamic = "force-dynamic";

/**
 * Resend inbound webhook (email.received): replies to Nolan's emails land in /admin/ads/inbox as `email_replied`
 * AdsEvents. Not forwarded to Meta CAPI (written directly, not via trackAdsEvent). Svix-signed; no secret = 503.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Inbound webhook not configured" }, { status: 503 });
  const ok = verifySvixSignature(secret, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  }, body);
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (event.type !== "email.received") return NextResponse.json({ ignored: true });
  const data = event.data ?? {};
  const emailId = typeof data.email_id === "string" ? data.email_id : null;
  if (!emailId) return NextResponse.json({ ignored: true, reason: "no email_id" });

  try {
    const dup = await prisma.adsEvent.findFirst({ where: { name: "email_replied", props: { path: ["emailId"], equals: emailId } }, select: { id: true } });
    if (dup) return NextResponse.json({ ok: true, duplicate: true });

    const full = await fetchReceivedEmail(emailId);
    const fromRaw = str(full?.from) ?? str(data.from) ?? "";
    const { email: fromEmail, name: fromName } = parseAddress(fromRaw);
    const rawText = str(full?.text) ?? (str(full?.html) ? htmlToText(str(full?.html)!) : "");
    const to = full?.to ?? data.to ?? null;

    const user = fromEmail
      ? await prisma.user.findFirst({ where: { email: { equals: fromEmail, mode: "insensitive" } }, select: { id: true } })
      : null;
    const member = user
      ? await prisma.adsWorkspaceMember.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { workspaceId: true } })
      : null;

    const subject = str(full?.subject) ?? str(data.subject) ?? "";
    const text = stripQuotedReply(rawText);
    const toList = Array.isArray(to) ? to.map(String) : to ? [String(to)] : [];
    await prisma.adsEvent.create({
      data: {
        name: "email_replied",
        userId: user?.id ?? null,
        workspaceId: member?.workspaceId ?? null,
        props: {
          emailId,
          from: fromEmail,
          fromName,
          to: toList,
          subject,
          text,
          receivedAt: str(full?.created_at) ?? str(data.created_at) ?? new Date().toISOString(),
          inReplyTo: headerValue(full?.headers, "in-reply-to"),
          fetched: Boolean(full),
        },
      },
    });
    // A person must read replies: forward to the founder's inbox (Reply-To = the sender). Best effort: the reply is stored.
    const fwd = buildReplyForward({ from: fromEmail, fromName, to: toList, subject, text });
    if (fwd) await sendAdsMail(fwd).catch((err) => console.error("[inbound/resend] forward", err));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[inbound/resend]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Full received email (text/html/headers); null if the API key is missing or the fetch fails (metadata is still stored). */
async function fetchReceivedEmail(id: string): Promise<Record<string, unknown> | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[inbound/resend] fetch", id, res.status);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error("[inbound/resend] fetch", id, err);
    return null;
  }
}
