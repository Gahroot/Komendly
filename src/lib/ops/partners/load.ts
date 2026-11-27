// Partner ops loader (read-only): statements + health from the live tables (AdsPartner, AdsReferral(+Code), AdsEvent
// purchases, AdsRefund, AdsCommission, admin_partner_paid events). Web, engine and kly clients. No money moves here.
import { isInternalAccount, dedupeRevenueEvents, type EconomicsDb } from "../../revenue/economics";
import { type PaymentFact, type ReferralFact } from "./commission";
import { buildStatement, type Statement } from "./statement";
import { classifyPartner, topPerformers, type Health, type HealthInput } from "./health";

export const PARTNER_PAID_EVENTS = { activation: "partner_activation_sent", thanks: "partner_thanks_sent" } as const;
const monthOf = (d: Date) => d.toISOString().slice(0, 7);
export const prevMonth = (m: string) => { const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)); return monthOf(new Date(Date.UTC(y, mo - 2, 1))); };
export const lastFullMonth = (now: Date) => monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));

export type PartnerRow = { statement: Statement; health: Health; input: HealthInput; link: string | null; email: string | null; pendingCents: number };
export type PartnerOps = { month: string; rows: PartnerRow[]; pendingPayoutCents: number };

/** Allocate each refund to the latest earlier payment of that workspace with room left. */
export function allocateRefunds(pays: { id: string; workspaceId: string; paidAt: Date; amountCents: number }[], refunds: { workspaceId: string; amountCents: number; createdAt: Date }[]): PaymentFact[] {
  const out: PaymentFact[] = pays.map((p) => ({ ...p, refundedCents: 0, refundedAt: null }));
  for (const r of [...refunds].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    let left = Math.abs(r.amountCents);
    const cands = out.filter((p) => p.workspaceId === r.workspaceId && p.paidAt <= r.createdAt).sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
    for (const p of cands) {
      if (left <= 0) break;
      const take = Math.min(left, p.amountCents - p.refundedCents);
      if (take > 0) { p.refundedCents += take; p.refundedAt = r.createdAt; left -= take; }
    }
  }
  return out;
}

export async function loadPartnerOps(db: EconomicsDb, now: Date = new Date(), month: string = lastFullMonth(now), env: Record<string, string | undefined> = process.env): Promise<PartnerOps> {
  const partners = await db.adsPartner.findMany({ where: { status: { in: ["approved", "paused"] } } });
  if (!partners.length) return { month, rows: [], pendingPayoutCents: 0 };
  const wsIds: string[] = partners.map((p: any) => p.workspaceId);
  const [users, codes, referrals, events, snaps] = await Promise.all([
    db.user.findMany({ where: { id: { in: partners.map((p: any) => p.userId) } }, select: { id: true, name: true, email: true } }),
    db.adsReferralCode.findMany({ where: { workspaceId: { in: wsIds } }, select: { code: true, workspaceId: true, kind: true } }),
    db.adsReferral.findMany({ where: { referrerWorkspaceId: { in: wsIds } } }),
    db.adsEvent.findMany({ where: { name: { in: [PARTNER_PAID_EVENTS.activation, PARTNER_PAID_EVENTS.thanks, "admin_partner_paid"] }, workspaceId: { in: wsIds } }, orderBy: { createdAt: "desc" }, select: { name: true, workspaceId: true, createdAt: true, props: true } }),
    db.adsEvent.findMany({ where: { name: "partner_statement", props: { path: ["month"], equals: prevMonth(month) } }, select: { props: true } }),
  ]);
  const codeKind = new Map<string, string>(codes.map((c: any) => [c.code, c.kind]));
  const partnerRefs = referrals.filter((r: any) => r.source === "partner" || codeKind.get(r.code) === "partner");
  const refWs: string[] = partnerRefs.map((r: any) => r.referredWorkspaceId);
  const refUsers = await db.user.findMany({ where: { id: { in: partnerRefs.map((r: any) => r.referredUserId) } }, select: { id: true, email: true } });
  const emailOfUser = new Map<string, string>(refUsers.map((u: any) => [u.id, u.email]));
  const [payEv, refundRows, commissions] = await Promise.all([
    db.adsEvent.findMany({ where: { name: { in: ["purchased", "renewed", "paid_converted"] }, workspaceId: { in: refWs } }, orderBy: { createdAt: "asc" }, select: { id: true, workspaceId: true, name: true, props: true, createdAt: true } }),
    db.adsRefund.findMany({ where: { workspaceId: { in: refWs } }, select: { workspaceId: true, amountCents: true, createdAt: true } }),
    db.adsCommission.findMany({ where: { partnerId: { in: partners.map((p: any) => p.id) } }, select: { partnerId: true, commissionCents: true, status: true, createdAt: true } }),
  ]);
  const payments = allocateRefunds(dedupeRevenueEvents(payEv).map((p: any) => ({ id: p.id, workspaceId: p.workspaceId, paidAt: p.createdAt, amountCents: typeof p.props?.amountCents === "number" ? p.props.amountCents : 0 })), refundRows);
  const userById = new Map<string, any>(users.map((u: any) => [u.id, u]));
  const base = (env.LIFECYCLE_APP_URL || env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
  const prev = new Map<string, any>(snaps.map((s: any) => [s.props?.partnerId, s.props]));

  const rows: PartnerRow[] = partners.map((p: any) => {
    const u = userById.get(p.userId);
    const mine = partnerRefs.filter((r: any) => r.referrerWorkspaceId === p.workspaceId);
    const refFacts: ReferralFact[] = mine.map((r: any) => ({ referredWorkspaceId: r.referredWorkspaceId, referredUserId: r.referredUserId, referredEmail: emailOfUser.get(r.referredUserId) ?? null, createdAt: r.createdAt, internal: isInternalAccount(emailOfUser.get(r.referredUserId)) }));
    const mineWs = new Set(refFacts.map((r) => r.referredWorkspaceId));
    const ev = events.filter((e: any) => e.workspaceId === p.workspaceId);
    const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
    const paidEv = ev.find((e: any) => e.name === "admin_partner_paid" && e.createdAt >= monthEnd);
    const prevS = prev.get(p.id);
    const recorded = commissions.filter((c: any) => c.partnerId === p.id && c.status !== "void" && monthOf(c.createdAt) === month).reduce((t: number, c: any) => t + c.commissionCents, 0);
    const statement = buildStatement({
      partner: { id: p.id, userId: p.userId, workspaceId: p.workspaceId, email: u?.email ?? null, status: p.status, name: p.company || u?.name || undefined },
      month, referrals: refFacts, payments: payments.filter((x) => mineWs.has(x.workspaceId)),
      carryoverCents: prevS && prevS.status === "below_minimum" ? prevS.payableCents : 0,
      paid: paidEv ? { reference: String(paidEv.props?.payoutRef ?? "recorded"), amountCents: 0 } : null,
      recordedCommissionCents: recorded, liveCommissionPct: p.commissionPct, now,
    });
    const allEarned = buildStatement({ ...{ partner: { id: p.id, userId: p.userId, workspaceId: p.workspaceId, email: u?.email ?? null, status: p.status }, month: monthOf(now), referrals: refFacts, payments: payments.filter((x) => mineWs.has(x.workspaceId)), now } });
    const lastRef = mine.map((r: any) => r.createdAt as Date).sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] ?? null;
    const input: HealthInput = {
      id: p.id, name: p.company || u?.name || "there", status: p.status, approvedAt: p.approvedAt, referralsTotal: mine.length, lastReferralAt: lastRef,
      payingCustomers: new Set(payments.filter((x) => mineWs.has(x.workspaceId) && x.amountCents > 0).map((x) => x.workspaceId)).size,
      commissionCents: statement.commissionCents + allEarned.commissionCents,
      activationSentAt: ev.find((e: any) => e.name === PARTNER_PAID_EVENTS.activation)?.createdAt ?? null,
      thanksSentAt: ev.find((e: any) => e.name === PARTNER_PAID_EVENTS.thanks)?.createdAt ?? null,
    };
    const code = codes.find((c: any) => c.workspaceId === p.workspaceId && c.kind === "partner") ?? codes.find((c: any) => c.workspaceId === p.workspaceId);
    return { statement, health: "healthy" as Health, input, link: code ? `${base}/r/${encodeURIComponent(code.code)}` : null, email: u?.email ?? null, pendingCents: statement.status === "pending_owner_approval" ? statement.payableCents : 0 };
  });
  const top = topPerformers(rows.map((r) => r.input));
  for (const r of rows) r.health = classifyPartner(r.input, now, top);
  return { month, rows, pendingPayoutCents: rows.reduce((t, r) => t + r.pendingCents, 0) };
}
