// Conversion + revenue sync. Leads the web app linked at signup (cookie kmd_kly -> userId/workspaceId/signedUpAt)
// get paid status, paidAt and lifetime revenueCents from AdsEvent paid_converted/renewed (props.amountCents) plus the
// workspace plan. Fallback (kept from the engine): a contacted lead whose domain now has its own Komendly brand.
import type { Db } from "./db";
import { bumpDaily } from "./settings";

export const PAID_EVENTS = ["paid_converted", "renewed"] as const;
const PAID_SUBS = new Set(["active", "trialing", "past_due"]);

export interface WorkspaceState {
  adsPlan: string;
  subscriptionStatus: string;
  suspendedAt: Date | null;
}

export function isPaidWorkspace(w: WorkspaceState | null): boolean {
  return Boolean(w && w.adsPlan !== "trial" && PAID_SUBS.has(w.subscriptionStatus) && !w.suspendedAt);
}

/** From the workspace's paid events: total revenue and the first paid time. */
export function revenueFromEvents(events: ReadonlyArray<{ name: string; props: unknown; createdAt: Date }>): { revenueCents: number; firstPaidAt: Date | null } {
  let revenueCents = 0;
  let firstPaidAt: Date | null = null;
  for (const e of events) {
    if (!(PAID_EVENTS as readonly string[]).includes(e.name)) continue;
    const amt = Number((e.props as { amountCents?: unknown } | null)?.amountCents);
    if (Number.isFinite(amt) && amt > 0) revenueCents += Math.round(amt);
    if (!firstPaidAt || e.createdAt < firstPaidAt) firstPaidAt = e.createdAt;
  }
  return { revenueCents, firstPaidAt };
}

export interface LeadConv {
  status: string;
  signedUpAt: Date | null;
  paidAt: Date | null;
  revenueCents: number;
}

/** The lead update for a linked workspace (null = nothing changed). */
export function conversionUpdate(l: LeadConv, ev: ReturnType<typeof revenueFromEvents>, w: WorkspaceState | null, now: Date): { status?: string; paidAt?: Date; revenueCents?: number; signedUpAt?: Date } | null {
  const paid = ev.firstPaidAt !== null || isPaidWorkspace(w);
  const u: { status?: string; paidAt?: Date; revenueCents?: number; signedUpAt?: Date } = {};
  if (!l.signedUpAt) u.signedUpAt = now;
  const status = paid ? "paid" : "signed_up";
  if (l.status !== status && !(l.status === "paid" && status === "signed_up")) u.status = status;
  if (paid && !l.paidAt) u.paidAt = ev.firstPaidAt ?? now;
  if (ev.revenueCents > l.revenueCents) u.revenueCents = ev.revenueCents;
  return Object.keys(u).length ? u : null;
}

export async function syncConversions(db: Db, now: Date = new Date()): Promise<number> {
  let n = 0;
  const linked = await db.outboundLead.findMany({ where: { workspaceId: { not: null } }, select: { id: true, workspaceId: true, status: true, signedUpAt: true, paidAt: true, revenueCents: true } });
  for (const l of linked) {
    if (!l.workspaceId) continue;
    const [events, w] = await Promise.all([
      db.adsEvent.findMany({ where: { workspaceId: l.workspaceId, name: { in: [...PAID_EVENTS] } }, select: { name: true, props: true, createdAt: true } }),
      db.adsWorkspace.findUnique({ where: { id: l.workspaceId }, select: { adsPlan: true, subscriptionStatus: true, suspendedAt: true } }),
    ]);
    const u = conversionUpdate(l, revenueFromEvents(events), w, now);
    if (!u) continue;
    await db.outboundLead.update({ where: { id: l.id }, data: u });
    if (u.revenueCents !== undefined) await bumpDaily(db, now, { revenueCents: u.revenueCents - l.revenueCents });
    n++;
  }
  // Domain-match fallback for contacted leads the cookie didn't link.
  const leads = await db.outboundLead.findMany({ where: { workspaceId: null, status: { in: ["sent", "opened", "clicked", "replied", "signed_up"] } }, select: { id: true, domain: true, status: true, signedUpAt: true, paidAt: true } });
  for (const l of leads) {
    const brand = await db.brandProfile.findFirst({
      where: { domain: { in: [l.domain, `www.${l.domain}`] }, runs: { some: { kind: { notIn: ["gift", "nurture"] } } } },
      select: { workspace: { select: { adsPlan: true, subscriptionStatus: true, suspendedAt: true } } },
    });
    if (!brand) continue;
    const paid = isPaidWorkspace(brand.workspace);
    const status = paid ? "paid" : "signed_up";
    if (status === l.status) continue;
    await db.outboundLead.update({ where: { id: l.id }, data: { status, ...(l.signedUpAt ? {} : { signedUpAt: now }), ...(paid && !l.paidAt ? { paidAt: now } : {}) } });
    n++;
  }
  return n;
}
