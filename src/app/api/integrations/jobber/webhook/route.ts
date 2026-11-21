import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jobberEnv, parseWebhook, verifyWebhookHmac } from "@/lib/integrations/jobber/core";
import { findConnection, logWebhook, processWebhook, WEBHOOK_EVENT } from "@/lib/integrations/jobber/server";

export const dynamic = "force-dynamic";

/**
 * All Jobber webhook topics (APP_DISCONNECT, JOB_CLOSED, VISIT_COMPLETE). HMAC over the raw body with the client secret.
 * Jobber wants a 2xx within 1 second: log the delivery, answer, then process with after().
 */
export async function POST(request: NextRequest) {
  const raw = await request.text(); // raw body BEFORE verification
  const env = jobberEnv();
  if (!env || !verifyWebhookHmac(raw, request.headers.get("x-jobber-hmac-sha256"), env.clientSecret)) {
    return NextResponse.json({ error: "invalid hmac" }, { status: 401 });
  }
  const hook = parseWebhook(raw);
  if (!hook) return NextResponse.json({ ok: true, result: "unparsed" });
  const conn = await findConnection(prisma, hook.accountId);
  const logId = await logWebhook(prisma, hook, conn);
  after(async () => {
    const result = await processWebhook(prisma, env, hook).catch((e: unknown) => {
      console.error("[jobber] webhook processing failed", hook.topic, e);
      return "error";
    });
    await prisma.adsEvent.updateMany({ where: { id: logId, name: WEBHOOK_EVENT }, data: { props: { ...hook, system: "jobber", result, processedAt: new Date().toISOString() } } }).catch(() => undefined);
  });
  return NextResponse.json({ ok: true });
}
