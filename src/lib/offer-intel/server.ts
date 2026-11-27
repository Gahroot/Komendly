// Web-side helpers (Prisma/Next allowed here; the engine does not import this file).
import { cookies } from "next/headers";
import { assignVariant, concludeExperiment, defineExperiment, loadRunningExperiments, recordConversion, recordExposure, type ExperimentDb, type ExperimentDef } from "../revenue/experiments";
import { systemEnabled, type SystemDb } from "../growth/systems";
import { prisma } from "../prisma";
import { payloadProblems, MAX_RUNNING_PER_SURFACE, sanitizePayload } from "./surfaces";
import "./variants";

import { VISITOR_COOKIE } from "./cookie";
export { VISITOR_COOKIE };
type Db = ExperimentDb & SystemDb;
const db = () => prisma as unknown as Db;

export interface ServedVariant { variantId: string; payload: Record<string, string> | null }

/** Variant for a subject, or null (flag off, unknown key, unusable payload => caller renders the control). */
export async function serveVariant(key: string, subjectId: string | null | undefined): Promise<ServedVariant | null> {
  if (!subjectId) return null;
  try {
    if (!(await systemEnabled(db(), "offer_intel"))) return null;
    const defs = await loadRunningExperiments(db());
    const def = defs.find((d) => d.key === key);
    const a = def ? assignVariant(key, subjectId, defs) : null;
    if (!def || !a) return null;
    const payload = a.payload ? sanitizePayload(def.surface, a.payload) : null;
    if (a.payload && !payload) return null; // unusable copy: show the control and do not count an exposure
    return { variantId: a.variantId, payload };
  } catch {
    return null;
  }
}

/** Subject for SSR/API code: the kmd_vid cookie set by middleware. */
export async function visitorId(): Promise<string | null> {
  return (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
}

export async function serveVariantForVisitor(key: string): Promise<ServedVariant | null> {
  return serveVariant(key, await visitorId());
}

export async function exposeVariant(key: string, subject: string, workspaceId?: string | null): Promise<boolean> {
  const v = await serveVariant(key, subject);
  if (!v) return false;
  return recordExposure(db(), key, v.variantId, subject, workspaceId ? { workspaceId } : {});
}

/** Count `event` as a conversion for every running experiment whose metric is that event. Never throws. */
export async function recordOfferConversions(event: string, subject: string | null | undefined, props: Record<string, unknown> = {}): Promise<void> {
  if (!subject) return;
  try {
    if (!(await systemEnabled(db(), "offer_intel"))) return;
    for (const d of await loadRunningExperiments(db())) if (d.metric === event) await recordConversion(db(), d.key, subject, { event, ...props });
  } catch { /* conversion logging must never break checkout/signup */ }
}

export interface OfferProposalRow { id: string; createdAt: string; status: string; key: string; surface: string; hypothesis: string; lever: string | null; reasons: string[]; variants: ExperimentDef["variants"]; summary: string }

/** Proposals for the revenue admin page: needs_owner first, then recent auto-approved/rejected. */
export async function loadOfferProposals(client: { adsEvent: { findMany(a: unknown): Promise<unknown[]> } } = prisma as never, take = 40): Promise<OfferProposalRow[]> {
  const rows = (await client.adsEvent.findMany({ where: { name: "offer_proposal" }, orderBy: { createdAt: "desc" }, take, select: { id: true, props: true, createdAt: true } })) as { id: string; props: Record<string, unknown>; createdAt: Date }[];
  const out = rows.map((r) => {
    const p = r.props ?? {};
    const def = (p.def ?? {}) as Partial<ExperimentDef>;
    return { id: r.id, createdAt: r.createdAt.toISOString(), status: String(p.status ?? "proposed"), key: String(def.key ?? ""), surface: String(def.surface ?? ""), hypothesis: String(def.hypothesis ?? ""), lever: typeof p.lever === "string" ? p.lever : null, reasons: Array.isArray(p.reasons) ? p.reasons.map(String) : [], variants: def.variants ?? [], summary: String(p.summary ?? def.hypothesis ?? "") };
  });
  const rank = (s: string) => (s === "needs_owner" ? 0 : s === "proposed" ? 1 : 2);
  return out.sort((a, b) => rank(a.status) - rank(b.status));
}

/** Owner approves a needs_owner proposal: hard checks still apply (surface slots, lint, per-surface cap). */
export async function approveOfferProposal(id: string): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.adsEvent.findUnique({ where: { id }, select: { id: true, name: true, props: true } });
  const props = (row?.props ?? {}) as { status?: string; def?: ExperimentDef };
  if (!row || row.name !== "offer_proposal" || !props.def) return { ok: false, error: "not found" };
  if (props.status === "approved") return { ok: true };
  const running = await loadRunningExperiments(db());
  if (running.filter((d) => d.surface === props.def!.surface).length >= MAX_RUNNING_PER_SURFACE) return { ok: false, error: "surface already has 2 running experiments" };
  for (const v of props.def.variants.slice(1)) { const p = payloadProblems(props.def.surface, v.payload); if (p.length) return { ok: false, error: p.join("; ") }; }
  await defineExperiment(db(), props.def);
  await prisma.adsEvent.update({ where: { id }, data: { props: { ...props, status: "approved", approvedBy: "owner" } as never } });
  return { ok: true };
}
export async function rejectOfferProposal(id: string): Promise<void> {
  const row = await prisma.adsEvent.findUnique({ where: { id }, select: { props: true } });
  if (row) await prisma.adsEvent.update({ where: { id }, data: { props: { ...(row.props as object), status: "rejected" } as never } });
}
export { concludeExperiment };
