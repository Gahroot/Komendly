import { prisma } from "@/lib/prisma";
import type { JobType } from "./contracts";

/** Enqueue an engine job (Postgres queue). Paid work gets higher priority than trials. */
export async function enqueueJob(input: {
  type: JobType;
  runId?: string;
  adId?: string;
  workspaceId?: string;
  payload?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
}) {
  return prisma.adJob.create({
    data: {
      type: input.type,
      runId: input.runId,
      adId: input.adId,
      workspaceId: input.workspaceId,
      payload: (input.payload ?? {}) as object,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
    },
  });
}
