// Server-side readers for the revenue admin page (built by rev-core). Structural db type: works with the web Prisma client.
import { parseFinding, SUCCESS_FINDING_EVENT, topFindings, type FindingRow } from "./success";

export interface FindingsDb { adsEvent: { findMany(args: { where: { name: string; createdAt: { gte: Date } }; orderBy: { createdAt: "desc" }; take: number; select: { props: true } }): Promise<Array<{ props: unknown }>> } }

/** Top recurring customer problems from the daily agent (last `days` days, latest finding per cause). */
export async function loadSuccessFindings(db: FindingsDb, opts: { days?: number; top?: number; now?: Date } = {}): Promise<FindingRow[]> {
  const now = opts.now ?? new Date();
  const rows = await db.adsEvent.findMany({ where: { name: SUCCESS_FINDING_EVENT, createdAt: { gte: new Date(now.getTime() - (opts.days ?? 7) * 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 200, select: { props: true } });
  return topFindings(rows.map((r) => parseFinding(r.props)).filter((r): r is FindingRow => r !== null), opts.top ?? 8);
}
