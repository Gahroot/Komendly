// ONE Monday email. When AdsFeatureFlag `sys_exec_brief` is ON the executive brief absorbs the revenue digest, the optimiser digest and
// the ops brief: each of those senders calls `digestAbsorbed(...)` first and skips its own send. Every digest that does send records a
// shared `digest_sent` AdsEvent keyed by ISO week so the owner (and the exec brief) can see what already went out.
// Pure TS + a minimal db surface (no Next/Prisma imports).
export const DIGEST_SENT_EVENT = "digest_sent";
export const EXEC_BRIEF_FLAG = "sys_exec_brief";
export type DigestChannel = "revenue_digest" | "optimizer_digest" | "ops_brief" | "exec_brief";

interface DedupeDb {
  adsFeatureFlag: { findUnique(a: { where: { key: string } }): Promise<{ enabled: boolean } | null> };
  adsEvent: { create(a: { data: { name: string; props: object } }): Promise<unknown>; findFirst(a: { where: object; select: { id: true } }): Promise<unknown> };
}

/** True when the exec brief owns the Monday email (the caller must NOT send its own digest). Fails open (false) on any error. */
export async function digestAbsorbed(db: Pick<DedupeDb, "adsFeatureFlag">, channel: Exclude<DigestChannel, "exec_brief">): Promise<boolean> {
  void channel;
  try { return Boolean((await db.adsFeatureFlag.findUnique({ where: { key: EXEC_BRIEF_FLAG } }))?.enabled); } catch { return false; }
}
export async function recordDigestSent(db: Pick<DedupeDb, "adsEvent">, channel: DigestChannel, week: string): Promise<void> {
  try { await db.adsEvent.create({ data: { name: DIGEST_SENT_EVENT, props: { week, channel } } }); } catch { /* bookkeeping never breaks a send */ }
}
export async function digestAlreadySent(db: Pick<DedupeDb, "adsEvent">, channel: DigestChannel, week: string): Promise<boolean> {
  try { return Boolean(await db.adsEvent.findFirst({ where: { name: DIGEST_SENT_EVENT, AND: [{ props: { path: ["week"], equals: week } }, { props: { path: ["channel"], equals: channel } }] }, select: { id: true } })); } catch { return false; }
}
