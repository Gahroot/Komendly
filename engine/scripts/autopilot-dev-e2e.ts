// Dev-only proof of one Ozzy Autopilot drop (never point at prod). Creates a throwaway ad_department workspace that
// copies a benchmark brand, sets a focus, runs the scheduler's own decision + startWeeklyRun + startAutopilotVideo,
// builds the planner block, checks the charge decision, then deletes the workspace (and its queued jobs).
// Usage: set -a; . ../.env.local; set +a; npx tsx scripts/autopilot-dev-e2e.ts <sourceWorkspaceId>
import { PrismaClient } from "@prisma/client";
import { autopilotSettings } from "../../src/lib/ads/autopilot";
import { isAdDepartment, weeklyDropDecision } from "../../src/lib/ads/weekly-drop";
import { startAutopilotVideo } from "../src/jobs/autopilot-video";
import { startWeeklyRun, weeklyAvoidPrompt } from "../src/jobs/weekly";
import { decideCharge } from "../src/studio/charge";

async function main() {
  if (!/rlwy|localhost/.test(process.env.DATABASE_URL ?? "")) throw new Error("dev DB only");
  const db = new PrismaClient();
  const srcId = process.argv[2] ?? "";
  const src = await db.adRun.findFirstOrThrow({ where: { workspaceId: srcId, brandProfileId: { not: null } }, orderBy: { createdAt: "desc" }, include: { brandProfile: true, workspace: true } });
  const bp = src.brandProfile;
  if (!bp) throw new Error("no brand");
  const now = new Date();
  const ws = await db.adsWorkspace.create({ data: { name: "autopilot e2e", ownerId: src.workspace.ownerId, adsPlan: "ad_department", subscriptionStatus: "active" } });
  try {
    const { id: _i, workspaceId: _w, createdAt: _c, updatedAt: _u, ...bpData } = bp;
    const nbp = await db.brandProfile.create({ data: { ...bpData, workspaceId: ws.id } as never });
    await db.adRun.create({ data: { workspaceId: ws.id, userId: src.userId, brandProfileId: nbp.id, url: src.url, goal: src.goal, kind: "standard", status: "completed", extraction: src.extraction as never, staticCount: 0, motionCount: 0, creditsReserved: 0, ratios: ["4:5"], createdAt: now } });
    await db.adsAutopilot.create({ data: { workspaceId: ws.id, focus: "push the Black Friday sale" } });
    const ap = autopilotSettings(await db.adsAutopilot.findUnique({ where: { workspaceId: ws.id } }));
    const decision = weeklyDropDecision({ now, tz: ap.timezone, enabled: ap.enabled, subscribed: isAdDepartment(ws), weeksDone: [], dayOfWeek: ap.dayOfWeek, hour: ap.hour });
    if (!decision.due) throw new Error(`not due: ${decision.reason}`);
    const run = await startWeeklyRun(db, ws, decision.week, now, ap.focus);
    const again = await startWeeklyRun(db, ws, decision.week, now, ap.focus);
    const video = await startAutopilotVideo(db, ws, { week: decision.week, focus: ap.focus, tz: ap.timezone, now });
    const video2 = await startAutopilotVideo(db, ws, { week: decision.week, focus: ap.focus, tz: ap.timezone, now });
    if (!run.created || !video.created) throw new Error("not created");
    const runRow = await db.adRun.findUniqueOrThrow({ where: { id: run.runId }, select: { kind: true, status: true, creditsReserved: true, staticCount: true, motionCount: true, createdAt: true, url: true, id: true, workspaceId: true } });
    const session = await db.studioSession.findUniqueOrThrow({ where: { id: video.sessionId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    const job = await db.adJob.findUniqueOrThrow({ where: { id: video.jobId }, select: { type: true, priority: true, status: true } });
    const planner = await weeklyAvoidPrompt(db, runRow);
    const charge = decideCharge({ ...ws, creditBalance: 0 }, { priorRenders: 0, seconds: 15, sessionFree: false, autopilot: session.autopilotWeek !== null });
    console.log(JSON.stringify({ decision, run, idempotentRun: again, runRow, video, idempotentVideo: video2, session: { title: session.title, status: session.status, autopilotWeek: session.autopilotWeek, userMessage: session.messages[0]?.content }, job, planner, charge }, null, 2));
  } finally {
    await db.adJob.deleteMany({ where: { workspaceId: ws.id } });
    await db.adsWorkspace.delete({ where: { id: ws.id } });
    await db.$disconnect();
  }
}
void main();
