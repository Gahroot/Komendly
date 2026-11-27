// Support ops (flag sys_support_ops, default OFF): turns failed customer jobs into `support_ticket` AdsEvents so they show in
// /admin/ads/support. It never emails customers and never touches billing; the auto-responder and the owner do that.
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import { SUPPORT_TICKET_EVENT } from "../../../src/lib/ops/support";
import { isInternalEmail } from "../../../src/lib/internal-email";
import type { Db } from "../db";
import { errMsg } from "../log";

const CUSTOMER_JOBS = ["extract", "plan", "render_static", "render_motion", "qc"];

export async function supportTick(db: Db, now = new Date()): Promise<number> {
  if (!(await systemEnabled(db, "support_ops"))) return 0;
  try {
    const since = new Date(now.getTime() - 24 * 3_600_000);
    const jobs = await db.adJob.findMany({ where: { status: "failed", type: { in: CUSTOMER_JOBS }, createdAt: { gte: since }, runId: { not: null } }, select: { id: true, runId: true, type: true, lastError: true, workspaceId: true, finishedAt: true, createdAt: true, run: { select: { userId: true, isTrial: true, kind: true } } }, take: 100 });
    let made = 0;
    for (const j of jobs) {
      if (j.run?.kind === "gift") continue; // gifts are for outbound prospects, not customers
      const dup = await db.adsEvent.findFirst({ where: { name: SUPPORT_TICKET_EVENT, props: { path: ["jobId"], equals: j.id } }, select: { id: true } });
      if (dup) continue;
      const user = j.run?.userId ? await db.user.findUnique({ where: { id: j.run.userId }, select: { email: true } }) : null;
      if (!user || isInternalEmail(user.email)) continue;
      await db.adsEvent.create({ data: { name: SUPPORT_TICKET_EVENT, userId: j.run?.userId ?? null, workspaceId: j.workspaceId, props: { source: "failed_job", jobId: j.id, runId: j.runId, type: j.type, cause: (j.lastError ?? "failed").slice(0, 300) } } });
      made++;
    }
    await recordSystemRun(db, "support_ops", { ok: true, outputs: made }, now);
    return made;
  } catch (e) {
    await recordSystemRun(db, "support_ops", { ok: false, error: errMsg(e) }, now);
    return 0;
  }
}
