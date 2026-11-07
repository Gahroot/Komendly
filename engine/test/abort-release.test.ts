// An aborted job surfaces as JobAbortedError and, once released, is re-claimed with its attempt
// given back. DB part isolated: a test-only job type that no real worker claims.
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { JobAbortedError, throwIfAborted } from "../src/jobs/abort";

describe("throwIfAborted", () => {
  it("throws JobAbortedError only when the signal is aborted", () => {
    const c = new AbortController();
    expect(() => throwIfAborted(c.signal)).not.toThrow();
    c.abort(new Error("shutdown"));
    expect(() => throwIfAborted(c.signal)).toThrow(JobAbortedError);
    expect(() => throwIfAborted(c.signal)).toThrow("aborted: shutdown");
  });
});

function loadEnv(): void {
  try {
    for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2]?.replace(/^"|"$/g, "");
    }
  } catch {
    /* no env file */
  }
}
loadEnv();

describe.skipIf(!process.env.DATABASE_URL)("released job is re-run (dev DB)", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const q = await import("../src/queue/queue");
  const db = new PrismaClient();
  const T = `test_abort_${process.pid}_${Date.now()}`;
  afterAll(async () => {
    await db.adJob.deleteMany({ where: { type: T } });
    await db.$disconnect();
  });

  it("release on abort re-queues without spending an attempt; the next claim runs it again", async () => {
    const job = await db.adJob.create({ data: { type: T, maxAttempts: 1 } });
    const [c1] = await q.claimJobs(db, "w1", [T], 1);
    expect(c1?.attempts).toBe(1);
    await q.releaseJob(db, job.id, 0, new JobAbortedError("shutdown").message); // what the runner does
    const r = await db.adJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(r.status).toBe("queued");
    expect(r.attempts).toBe(0);
    expect(r.lastError).toBe("aborted: shutdown");
    const [c2] = await q.claimJobs(db, "w2", [T], 1);
    expect(c2?.id).toBe(job.id); // even with maxAttempts 1, the abort did not use it up
    expect(c2?.attempts).toBe(1);
  });
});
