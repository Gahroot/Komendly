// Customer-memory refresh loop. Behind AdsFeatureFlag sys_customer_memory (default OFF): hourly, rebuilds the memory
// (src/lib/customer-intel) of workspaces that finished a pack in the last 14 days and whose memory is >= 24h old.
// Report/store only: writes AdsEvent `customer_memory` rows. The planner only sees it through sys_customer_memory_planner
// (style-only, A/B holdout; see hook.ts). CM_DRY_RUN=1 computes and logs counts without writing.
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import { MEMORY_EVENT } from "../../../src/lib/customer-intel/memory";
import { refreshCustomerMemory } from "../../../src/lib/customer-intel/server";
import type { Db } from "../db";
import { errMsg, log } from "../log";

const DAY = 86_400_000;
const MAX_PER_TICK = 10;

export async function customerMemoryTick(db: Db, now = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<{ enabled: boolean; candidates: number; refreshed: number }> {
  if (!(await systemEnabled(db, "customer_memory"))) return { enabled: false, candidates: 0, refreshed: 0 };
  const runs = await db.adRun.findMany({ where: { kind: { notIn: ["gift", "nurture"] }, status: { in: ["completed", "partial"] }, completedAt: { gte: new Date(now.getTime() - 14 * DAY) } }, orderBy: { completedAt: "desc" }, take: 200, select: { workspaceId: true, brandProfileId: true } });
  const seen = new Set<string>();
  const targets = runs.filter((r) => { const k = `${r.workspaceId}:${r.brandProfileId ?? ""}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const fresh: typeof targets = [];
  for (const t of targets) {
    const last = await db.adsEvent.findFirst({ where: { name: MEMORY_EVENT, workspaceId: t.workspaceId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (!last || now.getTime() - last.createdAt.getTime() >= DAY) fresh.push(t);
  }
  const todo = fresh.slice(0, MAX_PER_TICK);
  let refreshed = 0;
  try {
    for (const t of todo) {
      if (env.CM_DRY_RUN === "1") { log("info", "customer memory dry run", { workspaceId: t.workspaceId }); continue; }
      if (await refreshCustomerMemory(db, t.workspaceId, t.brandProfileId ?? null, now)) refreshed++;
    }
    await recordSystemRun(db, "customer_memory", { ok: true, outputs: refreshed }, now);
  } catch (e) {
    await recordSystemRun(db, "customer_memory", { ok: false, error: errMsg(e) }, now);
    throw e;
  }
  return { enabled: true, candidates: fresh.length, refreshed };
}

export function startCustomerMemoryLoop(opts: { db: Db; env?: NodeJS.ProcessEnv }): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await customerMemoryTick(opts.db, new Date(), opts.env ?? process.env); }
    catch (e) { log("warn", "customer memory tick failed", { error: errMsg(e) }); }
    finally { busy = false; }
  };
  const first = setTimeout(() => void tick(), 300_000);
  const t = setInterval(() => void tick(), 60 * 60_000);
  return () => { clearTimeout(first); clearInterval(t); };
}
