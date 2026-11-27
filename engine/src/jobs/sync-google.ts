// sync_google job: refreshes serving / policy / metrics for GooglePublish rows, and emails the workspace owner once when
// Google approves or disapproves the ads. Enqueued by the status route (stale > 10 min, scoped to a run) and by the
// runner every 15 min (unscoped: rows due by cadence, hourly while live/under review, daily otherwise).
import { esc } from "../../../src/lib/ads/lifecycle/template";
import { googleAdsUrl } from "../../../src/lib/ads/google/core/ops";
import { syncCampaigns } from "../../../src/lib/ads/google/core/sync";
import type { GoogleAdsClient } from "../../../src/lib/ads/google/core/client";
import type { Db } from "../db";
import { createSmtpSender, smtpConfigured, type OutMail, type SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";
import { enqueue } from "../queue/queue";
import type { JobContext } from "./context";
import { workspaceGoogle } from "./google-auth";

const HOUR = 60 * 60_000;

/** Due when never synced, or older than 1h (enabled / under review / unknown) or 24h (paused + decided). */
export function isDue(r: { serving: string; policy: string; metricsAt: Date | null }, now: Date): boolean {
  if (!r.metricsAt) return true;
  const fast = r.serving === "enabled" || r.policy === "under_review" || r.policy === "unknown";
  return now.getTime() - r.metricsAt.getTime() >= (fast ? HOUR : 24 * HOUR);
}

export function policyMail(o: { to: string; policy: "approved" | "disapproved"; campaignName: string; issues: string[]; url: string }): OutMail {
  const subject = o.policy === "approved" ? "Google approved your ads" : "Google didn't approve some of your ads";
  const lines = o.policy === "approved"
    ? [`Google reviewed "${o.campaignName}" and approved the ads.`, "They stay paused until you start them in Komendly or in Google Ads. Spend goes on your own Google Ads billing."]
    : [`Google reviewed "${o.campaignName}" and didn't approve the ads.`, ...(o.issues.length ? [`What Google flagged: ${o.issues.join(" ")}`] : []), "You can change the text in Komendly and publish again, or appeal in Google Ads."];
  const text = [...lines, `Open it in Google Ads: ${o.url}`, "--", "Ozzy from Komendly"].join("\n\n");
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1530;"><div style="max-width:560px;margin:0 auto;">${lines
    .map((l) => `<p style="font-size:16px;line-height:1.6;margin:0 0 14px;">${esc(l)}</p>`).join("")}<p style="margin:20px 0;"><a href="${esc(o.url)}" style="display:inline-block;background:#ffcf3f;color:#1a1530;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px;">Open in Google Ads</a></p><p style="font-size:14px;color:#6b6580;margin:24px 0 0;">Ozzy from Komendly</p></div></body></html>`;
  return { to: o.to, subject, text, html, headers: { "X-Komendly-Notice": `google-${o.policy}` } };
}

function defaultSend(): SendMail {
  return smtpConfigured() ? createSmtpSender() : async (m) => log("info", "google policy email (SMTP not configured, logged)", { to: m.to, subject: m.subject });
}

export async function handleSyncGoogle(ctx: JobContext, deps: { client?: (workspaceId: string) => Promise<GoogleAdsClient>; send?: SendMail } = {}): Promise<unknown> {
  const { job, db } = ctx;
  const now = ctx.now();
  const ids = Array.isArray(job.payload.publishIds) ? job.payload.publishIds.filter((x): x is string => typeof x === "string") : null;
  const where = {
    status: "published", campaignResource: { not: null },
    ...(ids ? { id: { in: ids } } : {}), ...(job.workspaceId ? { workspaceId: job.workspaceId } : {}), ...(job.runId ? { runId: job.runId } : {}),
  };
  let rows = await db.googlePublish.findMany({ where, orderBy: { metricsAt: { sort: "asc", nulls: "first" } }, take: 300 });
  if (!job.workspaceId && !ids) rows = rows.filter((r) => r.serving !== "removed" && isDue(r, now));
  const send = deps.send ?? defaultSend();
  const byWs = new Map<string, typeof rows>();
  for (const r of rows) byWs.set(r.workspaceId, [...(byWs.get(r.workspaceId) ?? []), r]);
  let synced = 0;
  let failed = 0;
  for (const [workspaceId, list] of byWs) {
    try {
      const g = deps.client ? null : await workspaceGoogle(db, workspaceId);
      const client = deps.client ? await deps.client(workspaceId) : g!.client;
      const currency = g?.conn.currency || "USD";
      const byCustomer = new Map<string, typeof list>();
      for (const r of list) byCustomer.set(r.customerId, [...(byCustomer.get(r.customerId) ?? []), r]);
      for (const [customerId, rs] of byCustomer) {
        const since = rs.reduce((a, r) => (r.createdAt < a ? r.createdAt : a), rs[0]!.createdAt).toISOString().slice(0, 10);
        const res = await syncCampaigns(client, customerId, rs.map((r) => r.campaignResource!), currency, since, ctx.signal);
        for (const r of rs) {
          const s = res.get(r.campaignResource!);
          if (!s) continue;
          await db.googlePublish.update({ where: { id: r.id }, data: { serving: s.serving, policy: s.policy, policyIssues: s.policyIssues, metrics: s.metrics, metricsAt: now } });
          synced++;
          if ((s.policy === "approved" || s.policy === "disapproved") && r.policyNotified !== s.policy) {
            // Claim first so two syncs never both email.
            const claim = await db.googlePublish.updateMany({ where: { id: r.id, OR: [{ policyNotified: null }, { policyNotified: { not: s.policy } }] }, data: { policyNotified: s.policy } });
            if (claim.count) {
              const ws = await db.adsWorkspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
              const owner = ws ? await db.user.findUnique({ where: { id: ws.ownerId }, select: { email: true } }) : null;
              if (owner?.email) await send(policyMail({ to: owner.email, policy: s.policy, campaignName: r.campaignName ?? "your campaign", issues: s.policyIssues, url: googleAdsUrl(customerId, r.campaignId) })).catch((e) => log("warn", "google policy email failed", { error: errMsg(e) }));
            }
          }
        }
      }
    } catch (e) {
      failed += list.length;
      log("warn", "google sync failed", { workspaceId, error: errMsg(e) });
      // Mark as tried so a broken connection doesn't hot-loop; the status route still shows the old data.
      await db.googlePublish.updateMany({ where: { id: { in: list.map((r) => r.id) } }, data: { metricsAt: now } }).catch(() => undefined);
    }
  }
  return { synced, failed };
}

/** Runner tick: one unscoped sync job when any published row is due. */
export async function scheduleGoogleSync(db: Db, now = new Date()): Promise<void> {
  const rows = await db.googlePublish.findMany({ where: { status: "published", serving: { not: "removed" } }, select: { serving: true, policy: true, metricsAt: true }, orderBy: { metricsAt: { sort: "asc", nulls: "first" } }, take: 50 });
  if (!rows.some((r) => isDue(r, now))) return;
  const busy = await db.adJob.findFirst({ where: { type: "sync_google", runId: null, workspaceId: null, status: { in: ["queued", "running"] } }, select: { id: true } });
  if (busy) return;
  await enqueue(db, { type: "sync_google", priority: -5, maxAttempts: 1 });
}
