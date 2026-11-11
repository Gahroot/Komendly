import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { adsErrorResponse } from "@/lib/ads/workspace";
import { eventView, parseCursor, requireStudioSession } from "@/lib/studio/server";
import { sseComment, sseEvent } from "@/lib/studio/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_MS = 250;
const STATUS_EVERY_MS = 2000;
const HEARTBEAT_MS = 15_000;
const MAX_MS = 280_000;

type Ctx = { params: Promise<{ id: string }> };

/**
 * SSE tail of StudioEvent rows (id = StudioEvent.id). Resumes after Last-Event-ID (or ?after=). Polls the DB while the
 * session is queued/working; ends after done/error, when the session goes idle, or after ~280s (EventSource reconnects).
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  let sessionId: string;
  try {
    sessionId = (await requireStudioSession((await params).id)).session.id;
  } catch (error) {
    return adsErrorResponse(error);
  }
  let cursor = parseCursor(request.headers.get("last-event-id") ?? request.nextUrl.searchParams.get("after"));
  const signal = request.signal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          /* closed */
        }
      };
      const started = Date.now();
      let lastBeat = started;
      let lastStatus = 0;
      send("retry: 1500\n\n");
      try {
        while (!signal.aborted && Date.now() - started < MAX_MS) {
          const rows = await prisma.studioEvent.findMany({ where: { sessionId, id: { gt: cursor } }, orderBy: { id: "asc" }, take: 200 });
          let finished = false;
          for (const row of rows) {
            const e = eventView(row);
            send(sseEvent(e.id, e));
            cursor = row.id;
            if (row.type === "done" || row.type === "error") finished = true;
          }
          if (finished && rows.length < 200) {
            send(sseEvent(null, { type: "end" }, "end"));
            break;
          }
          const now = Date.now();
          if (rows.length === 0 && now - lastStatus > STATUS_EVERY_MS) {
            lastStatus = now;
            const s = await prisma.studioSession.findUnique({ where: { id: sessionId }, select: { status: true } });
            if (!s || (s.status !== "queued" && s.status !== "working")) {
              // Re-check once for events written just before the status flip.
              const tail = await prisma.studioEvent.count({ where: { sessionId, id: { gt: cursor } } });
              if (tail === 0) {
                send(sseEvent(null, { type: "idle", status: s?.status ?? "idle" }, "end"));
                break;
              }
            }
          }
          if (now - lastBeat > HEARTBEAT_MS) {
            lastBeat = now;
            send(sseComment("ping"));
          }
          if (rows.length === 0) await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch (error) {
        console.error("[studio] stream failed", error);
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
