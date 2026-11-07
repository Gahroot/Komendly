// Local smoke helper: create a test workspace + trial run + extract job on the dev DB.
// Usage: tsx scripts/smoke-insert.ts <url>
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const url = process.argv[2] ?? "https://plausible.io";
const email = "engine-smoke@komendly.test";
const user =
  (await db.user.findUnique({ where: { email } })) ??
  (await db.user.create({ data: { email, passwordHash: "smoke-not-a-login" } }));
const ws = await db.adsWorkspace.create({ data: { name: "engine smoke", ownerId: user.id, creditBalance: 0 } });
const run = await db.adRun.create({
  data: { workspaceId: ws.id, userId: user.id, url, isTrial: true, status: "extracting", ratios: ["1:1"], staticCount: 10, motionCount: 1, creditsReserved: 15 },
});
await db.adJob.create({ data: { type: "extract", runId: run.id, workspaceId: ws.id, priority: 50 } });
console.log(JSON.stringify({ runId: run.id, workspaceId: ws.id }));
await db.$disconnect();
