// Revenue intelligence loop (growth system revenue_intel). Hourly tick, single replica; writes at most one
// `revenue_snapshot` AdsEvent per UTC day (props = snapshot) so history exists. Off until AdsFeatureFlag sys_revenue_intel.
// Read-only on business data; the only write is the snapshot event + heartbeat.
import { buildRevenueSnapshot, SNAPSHOT_EVENT } from "../../../src/lib/revenue/snapshot";
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import { errMsg, log } from "../log";

export async function revenueSnapshotTick(db: Db, now = new Date()): Promise<{ enabled: boolean; wrote: boolean }> {
  if (!(await systemEnabled(db, "revenue_intel"))) return { enabled: false, wrote: false };
  const day = now.toISOString().slice(0, 10);
  try {
    const exists = await db.adsEvent.findFirst({ where: { name: SNAPSHOT_EVENT, props: { path: ["day"], equals: day } }, select: { id: true } });
    if (exists) { await recordSystemRun(db, "revenue_intel", { ok: true, outputs: 0 }, now); return { enabled: true, wrote: false }; }
    const snap = await buildRevenueSnapshot(db, now);
    await db.adsEvent.create({ data: { name: SNAPSHOT_EVENT, props: JSON.parse(JSON.stringify(snap)) } });
    await recordSystemRun(db, "revenue_intel", { ok: true, outputs: 1 }, now);
    return { enabled: true, wrote: true };
  } catch (e) {
    await recordSystemRun(db, "revenue_intel", { ok: false, error: errMsg(e) }, now);
    throw e;
  }
}

export function startRevenueSnapshotLoop(db: Db, everyMs = 60 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    revenueSnapshotTick(db)
      .then((r) => r.wrote && log("info", "revenue snapshot written"))
      .catch((e) => log("warn", "revenue snapshot failed", { error: errMsg(e) }))
      .finally(() => { running = false; });
  };
  const first = setTimeout(tick, 180_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}
