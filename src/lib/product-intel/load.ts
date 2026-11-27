// Shared read-only loaders (web admin page + engine jobs). Take a structural db so no Prisma import is needed here.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { isTestEmail } from "../ads/lifecycle/select";
import type { PerfRow } from "./effectiveness";
import { evaluateOutcome, type Outcome, type OutcomeInput } from "./outcomes";

type AnyDb = any;
const DAY = 86_400_000;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const EVENT_NAMES = ["launch_guide_opened", "pack_opened", "export_downloaded", "ad_downloaded", "purchased", "paid_converted", "meta_published", "meta_activated", "lead_contacted", "trade_tagged"];

export interface CustomerOutcome { workspaceId: string; workspaceName: string; email: string; plan: string; createdAt: Date; outcome: Outcome }

/** Evaluate every non-test workspace with a pack in the last `days` days. Facts only; see outcomes.ts. */
export async function loadOutcomes(db: AnyDb, now: Date, days = 60, limit = 400): Promise<CustomerOutcome[]> {
  const since = new Date(now.getTime() - days * DAY);
  const wss: any[] = await db.adsWorkspace.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 120 * DAY) } }, orderBy: { createdAt: "desc" }, take: 1500, select: { id: true, name: true, ownerId: true, adsPlan: true, createdAt: true, suspendedAt: true } });
  if (!wss.length) return [];
  const wids = wss.map((w) => w.id);
  type A = any[];
  const [users, runs, events, pubs, perf, leads] = (await Promise.all([
    db.user.findMany({ where: { id: { in: wss.map((w) => w.ownerId) } }, select: { id: true, email: true } }),
    db.adRun.findMany({ where: { workspaceId: { in: wids }, kind: { not: "gift" }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 5000, select: { id: true, workspaceId: true, status: true, isTrial: true, createdAt: true, completedAt: true, error: true } }),
    db.adsEvent.findMany({ where: { workspaceId: { in: wids }, name: { in: EVENT_NAMES }, createdAt: { gte: since } }, select: { workspaceId: true, name: true, props: true, createdAt: true } }),
    db.metaPublish.findMany({ where: { ad: { workspaceId: { in: wids } }, createdAt: { gte: since } }, select: { id: true, status: true, error: true, createdAt: true, ad: { select: { workspaceId: true } } } }),
    db.adPerformanceDay.findMany({ where: { workspaceId: { in: wids }, day: { gte: since.toISOString().slice(0, 10) } }, select: { workspaceId: true, day: true, impressions: true, clicks: true, leads: true, spendMinor: true, status: true } }),
    db.metaLead.findMany({ where: { workspaceId: { in: wids }, receivedAt: { gte: since } }, select: { workspaceId: true, receivedAt: true } }),
  ])) as unknown as [A, A, A, A, A, A];
  const ready: any[] = runs.length ? await db.ad.groupBy({ by: ["runId"], where: { runId: { in: runs.map((r: any) => r.id) }, status: "ready" }, _count: { _all: true } }) : [];
  const readyBy = new Map(ready.map((r) => [r.runId, r._count._all as number]));
  const userBy = new Map(users.map((u) => [u.id, u.email as string]));
  const by = <T extends { workspaceId: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) (m.get(r.workspaceId) ?? m.set(r.workspaceId, []).get(r.workspaceId)!).push(r); return m; };
  const runsBy = by(runs), evBy = by(events), perfBy = by(perf), leadBy = by(leads);
  const pubBy = by(pubs.map((p) => ({ ...p, workspaceId: p.ad.workspaceId as string })));
  const out: CustomerOutcome[] = [];
  for (const w of wss) {
    const email = userBy.get(w.ownerId);
    if (!email || isTestEmail(email) || w.suspendedAt) continue;
    const wr = runsBy.get(w.id) ?? [];
    if (!wr.length) continue;
    const input: OutcomeInput = {
      now,
      runs: wr.map((r) => ({ id: r.id, status: r.status, isTrial: r.isTrial, createdAt: r.createdAt, completedAt: r.completedAt, error: r.error, ready: readyBy.get(r.id) ?? 0 })),
      events: (evBy.get(w.id) ?? []).map((e) => ({ name: e.name, createdAt: e.createdAt, props: obj(e.props) })),
      publishes: (pubBy.get(w.id) ?? []).map((p) => ({ id: p.id, status: p.status, createdAt: p.createdAt, error: p.error })),
      perf: (perfBy.get(w.id) ?? []).map((p) => ({ day: p.day, impressions: p.impressions, clicks: p.clicks, leads: p.leads, spendMinor: p.spendMinor, status: p.status })),
      leads: (leadBy.get(w.id) ?? []).map((l) => ({ receivedAt: l.receivedAt })),
    };
    out.push({ workspaceId: w.id, workspaceName: w.name ?? w.id, email, plan: w.adsPlan, createdAt: w.createdAt, outcome: evaluateOutcome(input) });
    if (out.length >= limit) break;
  }
  return out;
}

/** One row per Komendly ad that has delivery data (AdPerformanceDay.adId set), summed over the window. */
export async function loadPerfRows(db: AnyDb, now: Date, days = 90): Promise<PerfRow[]> {
  const since = new Date(now.getTime() - days * DAY).toISOString().slice(0, 10);
  const days_: any[] = await db.adPerformanceDay.findMany({ where: { adId: { not: null }, day: { gte: since } }, select: { adId: true, workspaceId: true, impressions: true, clicks: true, leads: true, spendMinor: true } });
  if (!days_.length) return [];
  const adIds = [...new Set(days_.map((d) => d.adId as string))];
  const wids = [...new Set(days_.map((d) => d.workspaceId as string))];
  type A = any[];
  const [ads, pubs, tags, wss] = (await Promise.all([
    db.ad.findMany({ where: { id: { in: adIds } }, select: { id: true, workspaceId: true, angle: true, hook: true, headline: true, visualBrief: true, run: { select: { brandProfile: { select: { mainOffer: true } } } } } }),
    db.metaPublish.findMany({ where: { adId: { in: adIds } }, select: { adId: true, ratio: true } }),
    db.adsEvent.findMany({ where: { workspaceId: { in: wids }, name: "trade_tagged" }, orderBy: { createdAt: "asc" }, select: { workspaceId: true, props: true } }),
    db.adsWorkspace.findMany({ where: { id: { in: wids } }, select: { id: true, ownerId: true } }),
  ])) as unknown as [A, A, A, A];
  const users: any[] = await db.user.findMany({ where: { id: { in: wss.map((w) => w.ownerId) } }, select: { id: true, email: true } });
  const testOwner = new Set(users.filter((u) => isTestEmail(u.email)).map((u) => u.id));
  const testWs = new Set(wss.filter((w) => testOwner.has(w.ownerId)).map((w) => w.id));
  const tradeBy = new Map<string, string>();
  for (const t of tags) { const v = obj(t.props).trade; if (typeof v === "string") tradeBy.set(t.workspaceId, v); }
  const ratioBy = new Map(pubs.filter((p) => p.ratio).map((p) => [p.adId, p.ratio as string]));
  const adBy = new Map(ads.map((a) => [a.id, a]));
  const agg = new Map<string, PerfRow>();
  for (const d of days_) {
    const a = adBy.get(d.adId);
    if (!a || testWs.has(a.workspaceId)) continue;
    const vb = obj(a.visualBrief);
    const row = agg.get(a.id) ?? { adId: a.id, trade: tradeBy.get(a.workspaceId) ?? null, angle: a.angle, hook: a.hook, headline: a.headline, format: ratioBy.get(a.id) ?? null, offer: a.run?.brandProfile?.mainOffer ?? null, template: typeof vb.layout === "string" ? vb.layout : typeof obj(vb.concept).layout === "string" ? String(obj(vb.concept).layout) : null, impressions: 0, clicks: 0, leads: 0, spendMinor: 0 };
    row.impressions += d.impressions; row.clicks += d.clicks; row.leads += d.leads; row.spendMinor += d.spendMinor;
    agg.set(a.id, row);
  }
  return [...agg.values()];
}
