// "First 10 Independent Paying Customers": the verified count, with an explicit exclusion list and per-customer evidence.
// Read-only. Evidence comes ONLY from Stripe-backed ledger events (AdsEvent purchased/renewed/paid_converted carrying a live Stripe id),
// never from estimates. Anything that cannot be proven independent is listed as excluded or unverified, never counted.
// Pure TS + a loose db surface (engine image copies src/lib/exec/). Spec: docs/exec/first-10-customers/prd.md.
import { isInternalAccount } from "../revenue/economics";
import { asObj, type ExecDb } from "./types";

export const FIRST10_TARGET = 10;
export const FIRST10_EXCLUSION_EVENT = "first10_exclusion"; // owner-written: { workspaceId?, email?, reason }
export type ExclusionReason = "internal_account" | "test_mode_payment" | "no_stripe_reference" | "zero_or_negative_amount" | "refunded" | "incentivised" | "duplicate_of_earlier_customer" | "owner_marked_not_independent";
export interface First10Customer { workspaceId: string; firstPaidAt: string; amountCents: number; what: string; stripeRef: string; eventId: string; emailDomain: string | null; recurring: boolean }
export interface First10Excluded { workspaceId: string; reason: ExclusionReason; detail: string; eventId: string | null }
export interface First10Progress {
  target: number; verified: number; remaining: number; reached: boolean;
  customers: First10Customer[]; excluded: First10Excluded[];
  revenueCents: number; /** Stripe-verified revenue minus generation cost per customer when known; null when cost is unknown (never guessed). */ contributionCents: number | null;
  bySource: Record<string, number>; note: string;
}

const PAY = ["purchased", "renewed", "paid_converted"];
const stripeRef = (p: Record<string, unknown>): string | null => {
  for (const k of ["checkoutSessionId", "subscriptionId", "paymentIntentId", "invoiceId", "stripePaymentId"]) { const v = p[k]; if (typeof v === "string" && /^(cs|sub|pi|in|ch)_/.test(v)) return v; }
  return null;
};
const normEmail = (e: string) => { const [l = "", d = ""] = e.trim().toLowerCase().split("@"); return `${l.split("+")[0]!.replace(/\./g, "")}@${d}`; };

/** Decide from already-loaded rows. Exported for tests (no DB needed). */
export function decideFirst10(i: {
  payments: Array<{ id: string; name: string; workspaceId: string | null; props: unknown; createdAt: Date | string }>;
  owners: Record<string, { email: string | null }>; refundedWorkspaces: ReadonlySet<string>; ownerExcluded: { workspaceIds: ReadonlySet<string>; emails: ReadonlySet<string> };
  sourceOf?: (workspaceId: string) => string; generationCents?: Record<string, number>;
}): First10Progress {
  const customers: First10Customer[] = [], excluded: First10Excluded[] = [];
  const seenWs = new Set<string>(), seenEmail = new Set<string>(), judged = new Set<string>();
  const rows = [...i.payments].filter((p) => p.workspaceId && PAY.includes(p.name)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  for (const r of rows) {
    const ws = r.workspaceId!; if (judged.has(ws)) continue;
    const p = asObj(r.props), email = i.owners[ws]?.email ?? null, amount = Number(p.amountCents ?? p.amount ?? 0), ref = stripeRef(p);
    const ex = (reason: ExclusionReason, detail: string) => { judged.add(ws); excluded.push({ workspaceId: ws, reason, detail, eventId: r.id }); };
    if (isInternalAccount(email)) { ex("internal_account", "owner/team/test address"); continue; }
    if (i.ownerExcluded.workspaceIds.has(ws) || (email && i.ownerExcluded.emails.has(email.toLowerCase()))) { ex("owner_marked_not_independent", "listed in first10_exclusion by the owner"); continue; }
    if (!ref) { ex("no_stripe_reference", "no Stripe checkout/subscription/payment id on the event: cannot verify"); continue; }
    if (/_test_/.test(ref)) { ex("test_mode_payment", ref); continue; }
    if (!Number.isFinite(amount) || amount <= 0) { ex("zero_or_negative_amount", `amount ${amount}`); continue; }
    if (i.refundedWorkspaces.has(ws)) { ex("refunded", "refund recorded"); continue; }
    if (p.incentivised === true || p.comped === true || Number(p.percentOff ?? 0) >= 100) { ex("incentivised", "comped or 100% discounted"); continue; }
    const key = email ? normEmail(email) : null;
    if (seenWs.has(ws) || (key && seenEmail.has(key))) { ex("duplicate_of_earlier_customer", "same workspace or same person (email alias) already counted"); continue; }
    seenWs.add(ws); if (key) seenEmail.add(key); judged.add(ws);
    customers.push({ workspaceId: ws, firstPaidAt: new Date(r.createdAt).toISOString(), amountCents: amount, what: String(p.key ?? p.kind ?? r.name), stripeRef: ref, eventId: r.id, emailDomain: email ? email.split("@")[1] ?? null : null, recurring: r.name !== "purchased" || p.kind === "plan" });
  }
  const bySource: Record<string, number> = {};
  for (const c of customers) { const s = i.sourceOf?.(c.workspaceId) ?? "unknown"; bySource[s] = (bySource[s] ?? 0) + 1; }
  const revenueCents = customers.reduce((a, c) => a + c.amountCents, 0);
  const gen = i.generationCents;
  const contributionCents = gen ? revenueCents - customers.reduce((a, c) => a + Math.round(gen[c.workspaceId] ?? 0), 0) : null;
  const verified = customers.length;
  return { target: FIRST10_TARGET, verified, remaining: Math.max(0, FIRST10_TARGET - verified), reached: verified >= FIRST10_TARGET, customers, excluded, revenueCents, contributionCents, bySource,
    note: verified === 0 ? "No verified independent payer yet." : `${verified} verified independent payer${verified === 1 ? "" : "s"}; a payer counts only with a live Stripe reference.` };
}

/** Load from the ledger and decide. Every read fails soft to empty (an unreadable ledger yields 0 verified, never a guess). */
export async function loadFirst10Progress(db: ExecDb): Promise<First10Progress> {
  const soft = async <T,>(f: () => Promise<T>, d: T): Promise<T> => { try { return await f(); } catch { return d; } };
  const payments = await soft<any[]>(() => db.adsEvent.findMany({ where: { name: { in: PAY }, workspaceId: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, workspaceId: true, props: true, createdAt: true }, take: 5000 }), []);
  const ids = [...new Set(payments.map((p) => p.workspaceId as string))];
  const [ws, refunds, excl, signups, runs] = await Promise.all([
    soft<any[]>(() => db.adsWorkspace.findMany({ where: { id: { in: ids } }, select: { id: true, ownerId: true } }), []),
    soft<any[]>(() => db.adsEvent.findMany({ where: { name: { in: ["refunded", "refund", "charge_refunded"] }, workspaceId: { in: ids } }, select: { workspaceId: true } }), []),
    soft<any[]>(() => db.adsEvent.findMany({ where: { name: FIRST10_EXCLUSION_EVENT }, select: { props: true } }), []),
    soft<any[]>(() => db.adsEvent.findMany({ where: { name: "signed_up", workspaceId: { in: ids } }, select: { workspaceId: true, props: true } }), []),
    soft<any[]>(() => db.adRun.findMany({ where: { workspaceId: { in: ids } }, select: { workspaceId: true, costMicros: true } }), []),
  ]);
  const users = await soft<any[]>(() => db.user.findMany({ where: { id: { in: [...new Set(ws.map((w) => w.ownerId as string))] } }, select: { id: true, email: true } }), []);
  const email = new Map<string, string>(users.map((u) => [u.id, u.email]));
  const owners: Record<string, { email: string | null }> = {}; for (const w of ws) owners[w.id] = { email: email.get(w.ownerId) ?? null };
  const touch = new Map<string, string>(); for (const s of signups) { const ft = asObj(asObj(s.props).firstTouch); touch.set(s.workspaceId, String(ft.utm_source ?? (asObj(s.props).klyLead ? "kly_email" : ft.referrer_host ?? "direct"))); }
  const gen: Record<string, number> = {}; for (const r of runs) gen[r.workspaceId] = (gen[r.workspaceId] ?? 0) + Number(r.costMicros ?? 0) / 10_000;
  const exWs = new Set<string>(), exEmail = new Set<string>();
  for (const e of excl) { const p = asObj(e.props); if (typeof p.workspaceId === "string") exWs.add(p.workspaceId); if (typeof p.email === "string") exEmail.add(p.email.toLowerCase()); }
  return decideFirst10({ payments, owners, refundedWorkspaces: new Set(refunds.map((r) => r.workspaceId as string)), ownerExcluded: { workspaceIds: exWs, emails: exEmail }, sourceOf: (w) => touch.get(w) ?? "unknown", generationCents: gen });
}

export const first10Line = (p: First10Progress): string => `First 10 independent paying customers: ${p.verified}/${p.target} verified${p.excluded.length ? ` (${p.excluded.length} excluded)` : ""}.`;
