// Loads one snapshot of people (owner + workspace + events + latest runs) for the revenue-lifecycle systems.
// Plain Prisma reads, bounded (120 days, 2000 workspaces).
import { isTestEmail } from "../../../src/lib/ads/lifecycle/select";
import { shareUrl } from "../../../src/lib/ads/referral-code";
import { RL_SENT_EVENT, SEND_EVENT_NAMES, type SendRecord } from "../../../src/lib/revenue-lifecycle/core";
import type { Db } from "../db";

export const PAID_STATUSES = ["active", "trialing", "past_due"];
const DAY = 86_400_000;
export interface Ev { id: string; name: string; props: Record<string, unknown>; createdAt: Date; userId: string | null; workspaceId: string | null }
export interface Person {
  user: { id: string; email: string; name: string | null; createdAt: Date };
  ws: { id: string; name: string; adsPlan: string; subscriptionStatus: string; canceledAt: Date | null; suspendedAt: Date | null; createdAt: Date };
  events: Ev[];
  runs: Array<{ id: string; status: string; isTrial: boolean; completedAt: Date | null; createdAt: Date; error: string | null; ready: number }>;
  brandDomains: number;
  brandName: string | null;
  referralUrl: string | null;
  metaConnected: boolean;
  test: boolean;
}

const NAMES = [...SEND_EVENT_NAMES, "signed_up", "trade_tagged", "email_unsubscribed", "email_replied", "purchased", "paid_converted", "export_downloaded", "ad_downloaded", "locked_asset_refused", "pricing_viewed", "begin_checkout", "launch_guide_opened", "activation_stuck", "rl_alert_sent", "churned"];
// Opt-outs never expire: an unsubscribe/reply older than the load window must still suppress.
const PERMANENT = ["email_unsubscribed", "email_replied", "purchased", "paid_converted"];
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export async function loadPeople(db: Db, now: Date, days = 120): Promise<Person[]> {
  const since = new Date(now.getTime() - days * DAY);
  const wss = await db.adsWorkspace.findMany({ where: { OR: [{ createdAt: { gte: since } }, { canceledAt: { gte: since } }] }, orderBy: { createdAt: "desc" }, take: 2000, select: { id: true, name: true, ownerId: true, adsPlan: true, subscriptionStatus: true, canceledAt: true, suspendedAt: true, createdAt: true } });
  if (!wss.length) return [];
  const wids = wss.map((w) => w.id);
  const uids = wss.map((w) => w.ownerId);
  const [users, events, runs, brands, codes, metas] = await Promise.all([
    db.user.findMany({ where: { id: { in: uids } }, select: { id: true, email: true, name: true, createdAt: true } }),
    db.adsEvent.findMany({ where: { OR: [{ workspaceId: { in: wids } }, { userId: { in: uids } }], name: { in: NAMES }, AND: [{ OR: [{ createdAt: { gte: new Date(since.getTime() - 10 * DAY) } }, { name: { in: PERMANENT } }] }] }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, props: true, createdAt: true, userId: true, workspaceId: true } }),
    db.adRun.findMany({ where: { workspaceId: { in: wids }, kind: { not: "gift" } }, orderBy: { createdAt: "desc" }, take: 6000, select: { id: true, workspaceId: true, status: true, isTrial: true, completedAt: true, createdAt: true, error: true } }),
    db.brandProfile.findMany({ where: { workspaceId: { in: wids } }, select: { workspaceId: true, domain: true, name: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    db.adsReferralCode.findMany({ where: { workspaceId: { in: wids } }, select: { workspaceId: true, code: true } }),
    db.metaConnection.findMany({ where: { workspaceId: { in: wids } }, select: { workspaceId: true } }),
  ]);
  const ready = await db.ad.groupBy({ by: ["runId"], where: { runId: { in: runs.map((r) => r.id) }, status: "ready" }, _count: { _all: true } });
  const readyBy = new Map(ready.map((r) => [r.runId, r._count._all]));
  const userBy = new Map(users.map((u) => [u.id, u]));
  const evByWs = new Map<string, Ev[]>();
  const evByUser = new Map<string, Ev[]>();
  for (const e of events) {
    const ev: Ev = { id: e.id, name: e.name, props: obj(e.props), createdAt: e.createdAt, userId: e.userId, workspaceId: e.workspaceId };
    if (e.workspaceId) (evByWs.get(e.workspaceId) ?? evByWs.set(e.workspaceId, []).get(e.workspaceId)!).push(ev);
    if (e.userId) (evByUser.get(e.userId) ?? evByUser.set(e.userId, []).get(e.userId)!).push(ev);
  }
  const out: Person[] = [];
  for (const w of wss) {
    const user = userBy.get(w.ownerId);
    if (!user?.email) continue;
    const merged = new Map<string, Ev>();
    for (const e of [...(evByWs.get(w.id) ?? []), ...(evByUser.get(w.ownerId) ?? [])]) merged.set(e.id, e);
    const bs = brands.filter((b) => b.workspaceId === w.id);
    const code = codes.find((c) => c.workspaceId === w.id)?.code;
    out.push({
      user, ws: w,
      events: [...merged.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      runs: runs.filter((r) => r.workspaceId === w.id).map((r) => ({ id: r.id, status: r.status, isTrial: r.isTrial, completedAt: r.completedAt, createdAt: r.createdAt, error: r.error, ready: readyBy.get(r.id) ?? 0 })),
      brandDomains: new Set(bs.map((b) => b.domain.toLowerCase().replace(/^www\./, ""))).size,
      brandName: bs[0]?.name ?? null,
      referralUrl: code ? shareUrl(code) : null,
      metaConnected: metas.some((m) => m.workspaceId === w.id),
      test: isTestEmail(user.email),
    });
  }
  return out;
}

export const has = (p: Person, name: string) => p.events.some((e) => e.name === name);
export const last = (p: Person, name: string) => [...p.events].reverse().find((e) => e.name === name)?.createdAt ?? null;
export const first = (p: Person, name: string) => p.events.find((e) => e.name === name)?.createdAt ?? null;
export const sendsOf = (p: Person): SendRecord[] => p.events.filter((e) => (SEND_EVENT_NAMES as readonly string[]).includes(e.name)).map((e) => ({ kind: typeof e.props.kind === "string" ? e.props.kind : e.name, at: e.createdAt }));
export const rlSent = (p: Person, system: string) => p.events.filter((e) => e.name === RL_SENT_EVENT && e.props.system === system);
export const isPaying = (p: Person) => PAID_STATUSES.includes(p.ws.subscriptionStatus);
export const unlockPaidAt = (p: Person) => p.events.find((e) => e.name === "purchased" && e.props.key === "unlock_pack")?.createdAt ?? null;
export const hasPurchase = (p: Person) => isPaying(p) || has(p, "purchased") || has(p, "paid_converted");
export function packFinishedAt(p: Person): Date | null {
  const t = p.runs.filter((r) => r.isTrial && r.completedAt && (r.status === "completed" || r.status === "partial")).map((r) => r.completedAt!.getTime());
  return t.length ? new Date(Math.min(...t)) : null;
}
