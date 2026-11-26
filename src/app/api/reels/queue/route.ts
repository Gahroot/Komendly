// Desktop publisher / motion-agent contract (docs/growth-ecosystem/reels.md). Bearer REELS_AGENT_TOKEN (or CRON_SECRET).
//   GET                      -> due social_queue items (+ 10-min presigned silent/voiced video URL + script)
//   POST {action:"status", id, ok, postUrl?|error?}      -> record the attempt (retry/backoff or pause)
//   POST {action:"voiced-upload", reelId}                -> presigned PUT url for voiced.mp4
//   POST {action:"voiced", reelId}                       -> register the uploaded voiced.mp4 (preferred over silent for publishing)
import { NextResponse } from "next/server";
import { presignGet } from "@/lib/ads/storage";
import { headObjectSize, presignPut } from "@/lib/studio/storage";
import { prisma } from "@/lib/prisma";
import { REEL_EVENTS, nextQueueState, queueItemDue, type QueueProps, type ReelReadyProps } from "@/lib/growth/reels-core";
import { REEL_ID_RE, reelVideoKey } from "@/lib/growth/reels-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secrets = [process.env.REELS_AGENT_TOKEN, process.env.CRON_SECRET].filter((s): s is string => Boolean(s));
  const got = request.headers.get("authorization");
  return secrets.some((s) => got === `Bearer ${s}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const rows = await prisma.adsEvent.findMany({ where: { name: REEL_EVENTS.queue }, orderBy: { createdAt: "asc" }, take: 200 });
  const items = [];
  for (const r of rows) {
    const q = r.props as unknown as QueueProps;
    if (!queueItemDue(q, now)) continue;
    const v = await reelVideoKey(q.reelId);
    if (!v) continue;
    const ready = await prisma.adsEvent.findFirst({ where: { name: REEL_EVENTS.ready, props: { path: ["reelId"], equals: q.reelId } }, select: { props: true } });
    items.push({ id: r.id, ...q, voiced: v.voiced, videoUrl: await presignGet(v.key, { seconds: 600 }), script: (ready?.props as unknown as ReelReadyProps | undefined)?.script ?? "" });
    if (items.length >= 20) break;
  }
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  if (body.action === "status" && typeof body.id === "string") {
    const row = await prisma.adsEvent.findFirst({ where: { id: body.id, name: REEL_EVENTS.queue } });
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    const next = nextQueueState(row.props as unknown as QueueProps, body.ok === true ? { ok: true, postUrl: typeof body.postUrl === "string" ? body.postUrl : undefined } : { ok: false, error: typeof body.error === "string" ? body.error : "failed" }, new Date());
    await prisma.adsEvent.update({ where: { id: row.id }, data: { props: next as unknown as object } });
    return NextResponse.json({ status: next.status, nextAttemptAt: next.nextAttemptAt });
  }
  const reelId = typeof body.reelId === "string" ? body.reelId : "";
  if (!REEL_ID_RE.test(reelId)) return NextResponse.json({ error: "bad reelId" }, { status: 400 });
  const key = `reels/${reelId}/voiced.mp4`;
  if (body.action === "voiced-upload") return NextResponse.json({ key, url: await presignPut(key, "video/mp4") });
  if (body.action === "voiced") {
    const ready = await prisma.adsEvent.findFirst({ where: { name: REEL_EVENTS.ready, props: { path: ["reelId"], equals: reelId } }, select: { id: true } });
    if (!ready) return NextResponse.json({ error: "unknown reel" }, { status: 404 });
    if (!(await headObjectSize(key))) return NextResponse.json({ error: "voiced.mp4 not uploaded" }, { status: 409 });
    await prisma.adsEvent.create({ data: { name: REEL_EVENTS.voiced, props: { reelId, key } } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
