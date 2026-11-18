// One session, one turn at a time. When the user sends a message while the previous turn is still winding down
// (e.g. it was just cancelled), the new turn waits for it so they never share files or overwrite each other's
// project snapshot / session status.
import { join } from "node:path";

/** Pure: each turn gets its own scratch folder (a finishing turn's cleanup must never delete the next turn's files). */
export function studioWorkdir(scratchDir: string, sessionId: string, jobId: string): string {
  return join(scratchDir, "studio", sessionId, jobId);
}

interface TurnDb {
  adJob: { findFirst(args: { where: Record<string, unknown>; select: { id: true } }): Promise<{ id: string } | null> };
  studioMessage: { findFirst(args: { where: Record<string, unknown>; orderBy: { createdAt: "desc" }; select: { id: true } }): Promise<{ id: string } | null> };
}

/** Waits (up to maxWaitMs) while an earlier studio_turn of this session is still running. True when clear. */
export async function waitForEarlierTurns(
  db: TurnDb,
  o: { sessionId: string; jobId: string; createdAt: Date; signal: AbortSignal; maxWaitMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<boolean> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollMs = o.pollMs ?? 1_000;
  const deadline = (o.maxWaitMs ?? 120_000) / pollMs;
  for (let i = 0; ; i++) {
    const busy = await db.adJob.findFirst({
      where: { type: "studio_turn", status: "running", id: { not: o.jobId }, createdAt: { lt: o.createdAt }, payload: { path: ["sessionId"], equals: o.sessionId } },
      select: { id: true },
    });
    if (!busy) return true;
    if (i >= deadline || o.signal.aborted) return false;
    await sleep(pollMs);
  }
}

/** A newer reply exists in this session: this (older) turn must not change the session's status. */
export async function isLatestReply(db: TurnDb, sessionId: string, assistantMessageId: string): Promise<boolean> {
  const latest = await db.studioMessage.findFirst({ where: { sessionId, role: "assistant" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return !latest || latest.id === assistantMessageId;
}
