// Outbound loop in the engine: claims admin/CLI lead-finding requests (OutboundRun), starts hook ads, syncs them,
// sends (only with OUTBOUND_ENABLED=1 + flag "outbound"), and polls mailboxes over IMAP every ~5 minutes.
import type { Db } from "../db";
import { errMsg, log } from "../log";
import type { AIProvider } from "../providers/types";
import { findLeads } from "./finder";
import { startHookAds, syncConversions, syncLeadAds } from "./hook";
import { pollMailbox, type AlertFn } from "./imap";
import { outboundEnv, senderTick, syncMailboxes } from "./sender";

export const IMAP_EVERY_MS = 5 * 60_000;
export const TICK_MS = 60_000;

/** Claim and process one pending OutboundRun (find leads). */
export async function processRunRequest(db: Db): Promise<string | null> {
  const run = await db.outboundRun.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" } });
  if (!run) return null;
  const claimed = await db.outboundRun.updateMany({ where: { id: run.id, status: "pending" }, data: { status: "running" } });
  if (claimed.count !== 1) return null;
  try {
    const r = await findLeads({ db }, { runId: run.id, niche: run.niche, cities: run.cities, count: run.count });
    await db.outboundRun.update({ where: { id: run.id }, data: { status: "done", found: r.created.length, result: { skipped: r.skipped } } });
    return run.id;
  } catch (e) {
    await db.outboundRun.update({ where: { id: run.id }, data: { status: "failed", result: { error: errMsg(e) } } });
    throw e;
  }
}

export function startOutboundLoop(deps: { db: Db; provider: AIProvider | null; alert: AlertFn; env?: NodeJS.ProcessEnv }): () => void {
  const env = deps.env ?? process.env;
  let stopped = false;
  let busy = false;
  let lastImap = 0;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const cfg = outboundEnv(env);
      await processRunRequest(deps.db).catch((e: unknown) => log("warn", "outbound run failed", { error: errMsg(e) }));
      await startHookAds(deps.db, { senderName: cfg.senderName, limit: 3, env }).catch((e: unknown) => log("warn", "outbound hook ads failed", { error: errMsg(e) }));
      await syncLeadAds(deps.db);
      await syncConversions(deps.db);
      const sent = await senderTick({ db: deps.db, provider: deps.provider, env });
      if (sent.some((s) => s.result.startsWith("sent") || s.result.startsWith("auto-paused"))) log("info", "outbound sender", { sent });
      if (cfg.mailboxes.length && Date.now() - lastImap >= IMAP_EVERY_MS) {
        lastImap = Date.now();
        await syncMailboxes(deps.db, cfg.mailboxes);
        for (const m of cfg.mailboxes) {
          const r = await pollMailbox(deps.db, m, deps.alert).catch((e: unknown) => (log("warn", "outbound imap failed", { mailbox: m.address, error: errMsg(e) }), null));
          if (r?.seen) log("info", "outbound imap", { mailbox: m.address, ...r });
        }
      }
    } catch (e) {
      log("warn", "outbound tick failed", { error: errMsg(e) });
    } finally {
      busy = false;
    }
  };
  const t = setInterval(() => void tick(), TICK_MS);
  void tick();
  return () => {
    stopped = true;
    clearInterval(t);
  };
}
