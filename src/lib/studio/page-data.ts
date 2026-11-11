// Server data for the Studio pages (rail + account).
import type { AdsWorkspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionSummary, studioAccountFor } from "./server";

export async function railData(workspace: AdsWorkspace) {
  const sessions = await prisma.studioSession.findMany({ where: { workspaceId: workspace.id, archivedAt: null }, orderBy: { lastActivityAt: "desc" }, take: 60 });
  return { sessions: sessions.map(sessionSummary), account: await studioAccountFor(workspace) };
}
