// Public Meta webhook for page `leadgen` events (growth system lead_alerts, kill switch AdsFeatureFlag sys_lead_alerts).
// GET: subscription handshake (META_WEBHOOK_VERIFY_TOKEN). POST: raw body read first, X-Hub-Signature-256 verified with
// META_APP_SECRET, then each lead is fetched, stored once in MetaLead (leadgenId unique) and emailed to the page's
// MarketingMandate lead email, else the workspace owner (src/lib/ads/leads/alert.ts).
// Listed in publicPrefixes (src/middleware.ts). 500 on a failed fetch/store/send so Meta retries; a stored lead whose
// email failed (notifiedAt null) is sent by the retry, duplicates are skipped.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordSystemRun, systemEnabled } from "@/lib/growth/systems";
import { processLeadgen } from "@/lib/ads/leads/alert";
import { leadAlertDeps } from "@/lib/ads/leads/server";
import { parseLeadgenPayload, verifyHandshake, verifyMetaSignature } from "@/lib/ads/leads/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const challenge = verifyHandshake(new URL(request.url).searchParams, process.env.META_WEBHOOK_VERIFY_TOKEN);
  return challenge === null ? new NextResponse("Forbidden", { status: 403 }) : new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const changes = parseLeadgenPayload(payload);
  if (!changes.length) return NextResponse.json({ ok: true, leads: 0 });
  if (!(await systemEnabled(prisma, "lead_alerts"))) return NextResponse.json({ ok: true, skipped: "disabled" });
  const deps = leadAlertDeps(new URL(request.url).origin);
  const errors: string[] = [];
  let sent = 0;
  for (const c of changes) {
    try {
      const r = await processLeadgen(c, deps);
      if (r.outcome === "sent") sent++;
      if (r.outcome === "blocked") console.warn("[lead_alerts] blocked by precheck", c.leadgenId, r.reasons);
    } catch (e) {
      errors.push(`${c.leadgenId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await recordSystemRun(prisma, "lead_alerts", { ok: errors.length === 0, outputs: sent, error: errors.join("; ") || null });
  if (errors.length) {
    console.warn("[lead_alerts] failed", errors);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sent });
}
