// Duplicate-prospect / communication guard. `canContact` is pure; `recordContact` writes one AdsEvent `ops_contact`.
// Not yet wired into kly/engine senders (kly image whitelists shared files): see docs/ops/operating-manual.md "Contact guard".
export type Channel = "cold_email" | "nurture" | "founder_ask" | "partner_outreach" | "auto_reply" | "lifecycle" | "other";
export const CONTACT_EVENT = "ops_contact";
export interface ContactRecord { target: string; channel: Channel; at: Date | string }

const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "comcast.net", "me.com", "live.com", "msn.com", "proton.me", "protonmail.com"]);
export const normalizeTarget = (v: string) => v.trim().toLowerCase();
export const domainOf = (email: string) => normalizeTarget(email).split("@")[1] ?? "";

/** Min days between contacts: same person any channel; same business domain (not free mail) by a DIFFERENT channel. Replies to the person are exempt. */
export const CONTACT_RULES = { personDays: 3, domainDays: 2 } as const;

export function canContact(target: string, channel: Channel, history: readonly ContactRecord[], now = new Date(), rules = CONTACT_RULES): { ok: boolean; reason?: string } {
  if (channel === "auto_reply") return { ok: true }; // answering someone who wrote to us is never a duplicate
  const t = normalizeTarget(target), dom = t.includes("@") ? domainOf(t) : t;
  for (const h of history) {
    const age = (now.getTime() - new Date(h.at).getTime()) / 86_400_000;
    if (age < 0) continue;
    const ht = normalizeTarget(h.target);
    if (ht === t && age < rules.personDays) return { ok: false, reason: `contacted ${age.toFixed(1)}d ago via ${h.channel}` };
    const hd = ht.includes("@") ? domainOf(ht) : ht;
    if (dom && hd === dom && ht !== t && !FREE_MAIL.has(dom) && h.channel !== channel && age < rules.domainDays) return { ok: false, reason: `same business (${dom}) contacted ${age.toFixed(1)}d ago via ${h.channel}` };
  }
  return { ok: true };
}

export interface ContactDb {
  adsEvent: {
    create(a: { data: { name: string; props: object } }): Promise<unknown>;
    findMany(a: { where: { name: string; createdAt: { gte: Date }; OR?: object[] }; select: { props: true; createdAt: true }; take?: number }): Promise<Array<{ props: unknown; createdAt: Date }>>;
  };
}

export async function recordContact(db: ContactDb, target: string, channel: Channel, source = "unknown"): Promise<void> {
  try { await db.adsEvent.create({ data: { name: CONTACT_EVENT, props: { target: normalizeTarget(target), channel, source } } }); } catch { /* ledger must never break a send */ }
}

/** Load recent contacts for a target (and its domain) from the ledger. Fails open (returns []). */
export async function loadContacts(db: ContactDb, target: string, now = new Date(), days = 7): Promise<ContactRecord[]> {
  try {
    const t = normalizeTarget(target), d = domainOf(t);
    const rows = await db.adsEvent.findMany({ where: { name: CONTACT_EVENT, createdAt: { gte: new Date(now.getTime() - days * 86_400_000) }, OR: [{ props: { path: ["target"], equals: t } }, ...(d ? [{ props: { path: ["target"], string_ends_with: `@${d}` } }] : [])] }, select: { props: true, createdAt: true }, take: 50 });
    return rows.map((r) => { const p = (r.props ?? {}) as { target?: string; channel?: Channel }; return { target: p.target ?? "", channel: p.channel ?? "other", at: r.createdAt }; }).filter((r) => r.target);
  } catch { return []; }
}
