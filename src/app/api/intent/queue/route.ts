// Media Master desktop agent contract for public intent opportunities (docs/growth-ecosystem/intent-signals.md).
// Bearer INTENT_AGENT_TOKEN (or CRON_SECRET). Nothing is posted by Komendly: a human/agent replies, then marks done.
//   GET  ?limit=50                          -> {items:[{id,url,text,score,draft,source,title,postedAt,createdAt}]} (status "new", best score first)
//   POST {action:"done", id, outcome?, replyUrl?}   -> status "done"   ("skip" -> status "skipped")
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const EVENT = "intent_opportunity";

function authorized(request: Request): boolean {
  const secrets = [process.env.INTENT_AGENT_TOKEN, process.env.CRON_SECRET].filter((s): s is string => Boolean(s));
  const got = request.headers.get("authorization");
  return secrets.some((s) => got === `Bearer ${s}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 50));
  const rows = await prisma.adsEvent.findMany({ where: { name: EVENT }, orderBy: { createdAt: "desc" }, take: 500 });
  const items = rows
    .map((r) => ({ id: r.id, createdAt: r.createdAt, ...(r.props as Record<string, unknown>) }))
    .filter((p) => (p as { status?: string }).status === "new")
    .sort((a, b) => Number((b as { score?: number }).score ?? 0) - Number((a as { score?: number }).score ?? 0))
    .slice(0, limit);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || (body.action !== "done" && body.action !== "skip") || typeof body.id !== "string") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const row = await prisma.adsEvent.findFirst({ where: { id: body.id, name: EVENT } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const status = body.action === "done" ? "done" : "skipped";
  const props = { ...(row.props as Record<string, unknown>), status, doneAt: new Date().toISOString(), ...(typeof body.outcome === "string" ? { outcome: body.outcome.slice(0, 500) } : {}), ...(typeof body.replyUrl === "string" ? { replyUrl: body.replyUrl.slice(0, 500) } : {}) };
  await prisma.adsEvent.update({ where: { id: row.id }, data: { props: props as object } });
  return NextResponse.json({ status });
}
