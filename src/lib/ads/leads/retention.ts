// Lead retention (prd.md R6, §8): MetaLead rows are hard-deleted 180 days after receipt; rows the owner deleted
// (deletedAt set) lose their PII right away. Pure TS with a structural db type (no Prisma import), so the engine can
// call it with its own client: engine/src/jobs/lead-retention.ts.
/** MarketingAction.dedupeKey of a lead's Lead Desk line. */
export const leadActionKey = (leadgenId: string) => `lead:${leadgenId}`;

export const LEAD_RETENTION_DAYS = 180;
export const PURGED_LEAD_SUMMARY = "New lead (details removed)";

/** Rows received before this instant are deleted. */
export function leadRetentionCutoff(now: Date, days = LEAD_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export function isLeadExpired(receivedAt: Date, now: Date, days = LEAD_RETENTION_DAYS): boolean {
  return receivedAt.getTime() < leadRetentionCutoff(now, days).getTime();
}

type Where = Record<string, unknown>;
export interface LeadRetentionDb {
  metaLead: {
    findMany(args: { where: Where; select: { id: true; leadgenId: true }; take: number }): Promise<Array<{ id: string; leadgenId: string }>>;
    deleteMany(args: { where: Where }): Promise<{ count: number }>;
    updateMany(args: { where: Where; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  marketingAction: { updateMany(args: { where: Where; data: Record<string, unknown> }): Promise<{ count: number }> };
}

const PII_LEFT = [{ name: { not: null } }, { email: { not: null } }, { phone: { not: null } }, { zip: { not: null } }];

/**
 * Hard-delete MetaLead rows older than 180 days and clear the PII (name/email/phone/zip/answers) of soft-deleted rows.
 * The Lead Desk activity line ("New lead: Jane from 94110") of each affected lead is scrubbed too. Idempotent.
 */
export async function purgeOldLeads(now: Date, db: LeadRetentionDb, o: { batch?: number; maxRounds?: number } = {}): Promise<{ deleted: number; scrubbed: number }> {
  const batch = o.batch ?? 500;
  const cutoff = leadRetentionCutoff(now);
  const scrubActions = (leadgenIds: string[]) =>
    leadgenIds.length ? db.marketingAction.updateMany({ where: { dedupeKey: { in: leadgenIds.map(leadActionKey) } }, data: { summary: PURGED_LEAD_SUMMARY } }) : Promise.resolve({ count: 0 });
  let deleted = 0;
  let scrubbed = 0;
  for (let round = 0; round < (o.maxRounds ?? 20); round++) {
    const rows = await db.metaLead.findMany({ where: { receivedAt: { lt: cutoff } }, select: { id: true, leadgenId: true }, take: batch });
    if (!rows.length) break;
    deleted += (await db.metaLead.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })).count;
    await scrubActions(rows.map((r) => r.leadgenId));
    if (rows.length < batch) break;
  }
  for (let round = 0; round < (o.maxRounds ?? 20); round++) {
    const rows = await db.metaLead.findMany({ where: { deletedAt: { not: null }, OR: PII_LEFT }, select: { id: true, leadgenId: true }, take: batch });
    if (!rows.length) break;
    scrubbed += (await db.metaLead.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { name: null, email: null, phone: null, zip: null, answers: [] } })).count;
    await scrubActions(rows.map((r) => r.leadgenId));
    if (rows.length < batch) break;
  }
  return { deleted, scrubbed };
}
