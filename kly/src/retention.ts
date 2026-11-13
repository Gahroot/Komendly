// Retention: leads with no engagement after 180 days lose their PII (email, page found on, reply snippets).
// Rows stay for stats; suppression rows are kept.
import type { Db } from "./db";

export const RETENTION_DAYS = 180;

export async function purgeStaleLeads(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const leads = await db.outboundLead.findMany({
    where: { purgedAt: null, createdAt: { lt: cutoff }, repliedAt: null, clickedAt: null, signedUpAt: null, paidAt: null, userId: null, status: { notIn: ["signed_up", "paid"] } },
    select: { id: true },
    take: 500,
  });
  if (leads.length === 0) return 0;
  const ids = leads.map((l) => l.id);
  await db.$transaction([
    db.outboundSend.updateMany({ where: { leadId: { in: ids } }, data: { replySnippet: null, toEmail: "" } }),
    db.outboundLead.updateMany({ where: { id: { in: ids } }, data: { email: "", emailFoundOn: "", phone: null, purgedAt: now } }),
  ]);
  return ids.length;
}
