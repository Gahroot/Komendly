// Prisma loaders for the proof machinery (web only). Pure rules live in ./proof.
import { prisma } from "@/lib/prisma";
import {
  buildCaseStudies, guaranteeBreach, journey, type CaseStudy, type Breach, type ConsentRow, type Journey, type Measured, type ReportSnapshot,
} from "./proof";

/** Journey for one workspace from stored data only. */
export async function loadJourney(workspaceId: string, now = new Date()): Promise<Journey> {
  const [hired, conn, mandate] = await Promise.all([
    prisma.adsEvent.findFirst({ where: { workspaceId, name: "team_hired" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.metaConnection.findUnique({ where: { workspaceId }, select: { createdAt: true } }),
    prisma.marketingMandate.findUnique({ where: { workspaceId }, select: { authorizedAt: true, launchedAt: true, state: true, stateReason: true } }),
  ]);
  return journey({
    paidAt: hired?.createdAt ?? null, metaAt: conn?.createdAt ?? null, budgetAt: mandate?.authorizedAt ?? null, liveAt: mandate?.launchedAt ?? null,
    blockedReason: mandate && !mandate.launchedAt && mandate.state === "blocked" ? mandate.stateReason : null, now,
  });
}

async function snapshots(): Promise<{ consents: ConsentRow[]; reports: ReportSnapshot[] }> {
  const [c, r] = await Promise.all([
    prisma.adsEvent.findMany({ where: { name: "proof_consent" }, select: { workspaceId: true, props: true, createdAt: true }, take: 2000 }),
    prisma.adsEvent.findMany({ where: { name: "proof_report_sent" }, select: { id: true, workspaceId: true, props: true, createdAt: true }, take: 4000 }),
  ]);
  const consents: ConsentRow[] = c.flatMap((e) => {
    const p = (e.props ?? {}) as { answer?: unknown; key?: unknown };
    return e.workspaceId && (p.answer === "yes" || p.answer === "no") && typeof p.key === "string" ? [{ workspaceId: e.workspaceId, answer: p.answer, key: p.key, at: e.createdAt }] : [];
  });
  const reports: ReportSnapshot[] = r.flatMap((e) => {
    const p = (e.props ?? {}) as { day?: unknown; businessName?: unknown; measured?: Measured };
    return e.workspaceId && p.measured && typeof p.businessName === "string" ? [{ id: e.id, workspaceId: e.workspaceId, day: Number(p.day) || 0, businessName: p.businessName, createdAt: e.createdAt, measured: p.measured }] : [];
  });
  return { consents, reports };
}

/** Public: consented, measured, not-too-early case studies only. */
export async function loadPublicCaseStudies(): Promise<CaseStudy[]> {
  const { consents, reports } = await snapshots();
  return buildCaseStudies(consents, reports);
}
/** Admin: every consented case study, including thin-evidence ones (flagged by measured.tooEarly). */
export async function loadConsentedForAdmin(): Promise<CaseStudy[]> {
  const { consents, reports } = await snapshots();
  return buildCaseStudies(consents, reports, { includeTooEarly: true });
}

export interface BreachRow { workspaceId: string; name: string; ownerEmail: string; breach: Breach; alerted: boolean; refunded: boolean }
/** Admin: paying team workspaces past 7 days with no live ads. Surfaces only. */
export async function loadGuaranteeBreaches(now = new Date()): Promise<BreachRow[]> {
  const wss = await prisma.adsWorkspace.findMany({ where: { adsPlan: { in: ["autopilot", "agency"] }, subscriptionStatus: { in: ["active", "trialing", "past_due"] } }, select: { id: true, name: true, ownerId: true }, take: 500 });
  if (!wss.length) return [];
  const ids = wss.map((w) => w.id);
  const [hired, conns, mandates, alerts, refunds, owners] = await Promise.all([
    prisma.adsEvent.findMany({ where: { workspaceId: { in: ids }, name: "team_hired" }, select: { workspaceId: true, createdAt: true } }),
    prisma.metaConnection.findMany({ where: { workspaceId: { in: ids } }, select: { workspaceId: true, createdAt: true } }),
    prisma.marketingMandate.findMany({ where: { workspaceId: { in: ids } }, select: { workspaceId: true, authorizedAt: true, launchedAt: true } }),
    prisma.adsEvent.findMany({ where: { workspaceId: { in: ids }, name: "guarantee_breach_alerted" }, select: { workspaceId: true } }),
    prisma.adsRefund.findMany({ where: { workspaceId: { in: ids } }, select: { workspaceId: true } }),
    prisma.user.findMany({ where: { id: { in: wss.map((w) => w.ownerId) } }, select: { id: true, email: true } }),
  ]);
  const rows: BreachRow[] = [];
  for (const w of wss) {
    const paidAt = hired.filter((h) => h.workspaceId === w.id).map((h) => h.createdAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const breach = guaranteeBreach({ paidAt, metaAt: conns.find((c) => c.workspaceId === w.id)?.createdAt ?? null, budgetAt: mandates.find((m) => m.workspaceId === w.id)?.authorizedAt ?? null, liveAt: mandates.find((m) => m.workspaceId === w.id)?.launchedAt ?? null, now });
    if (breach) rows.push({ workspaceId: w.id, name: w.name, ownerEmail: owners.find((o) => o.id === w.ownerId)?.email ?? "", breach, alerted: alerts.some((a) => a.workspaceId === w.id), refunded: refunds.some((r) => r.workspaceId === w.id) });
  }
  return rows.sort((a, b) => b.breach.daysLate - a.breach.daysLate);
}
