// Loads the weekly process-review inputs from AdsEvent (incident / owner_intervention) and runs the pure analysis.
import { analyseProcess, type Analysis, type IncidentRow, type InterventionRow } from "./process-improvement";

interface Db {
  adsEvent: { findMany(args: { where: object; orderBy: object; take: number; select: { props: true; createdAt: true } }): Promise<Array<{ props: unknown; createdAt: Date }>> };
}
const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function loadProcessAnalysis(db: Db, now = new Date(), windowDays = 28): Promise<Analysis> {
  const since = new Date(now.getTime() - 2 * windowDays * 86_400_000);
  const q = (name: string) => db.adsEvent.findMany({ where: { name, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: 5000, select: { props: true, createdAt: true } });
  const [inc, iv] = await Promise.all([q("incident"), q("owner_intervention")]);
  const incidents: IncidentRow[] = inc.flatMap((e) => {
    const p = (e.props ?? {}) as Record<string, unknown>;
    return str(p.key) ? [{ key: str(p.key), type: str(p.type) || "unknown", severity: (["P1", "P2", "P3"].includes(str(p.severity)) ? str(p.severity) : "P3") as IncidentRow["severity"], detectedAt: str(p.detectedAt) || e.createdAt.toISOString(), resolvedAt: str(p.resolvedAt) || null }] : [];
  });
  const interventions: InterventionRow[] = iv.map((e) => { const p = (e.props ?? {}) as Record<string, unknown>; return { kind: str(p.kind) || "unknown", note: str(p.note), at: e.createdAt.toISOString() }; });
  return analyseProcess({ now, windowDays, incidents, interventions });
}
