// Record every time the owner had to step in by hand. WHEN TO CALL: any time a human does something the system should have done
// (re-ran a failed job, edited a customer's pack, fixed a payment, unpaused a domain, answered a question the bot missed, flipped a
// flag to recover). Call it from the admin action or script that did it. Do NOT call it for planned work (reviews, approvals the
// design asks for). The weekly process review ranks these by recurrence so the repeated ones get a permanent fix.
export const OWNER_INTERVENTION_EVENT = "owner_intervention";

interface EventDb { adsEvent: { create(args: { data: { name: string; props: object } }): Promise<unknown> } }

/** kind: short snake_case label, e.g. "rerun_ad_job", "manual_refund", "unpause_domain". note: one line, no secrets, no customer emails. */
export async function recordOwnerIntervention(db: EventDb, kind: string, note: string): Promise<void> {
  const k = kind.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 60);
  if (!k) return;
  try {
    await db.adsEvent.create({ data: { name: OWNER_INTERVENTION_EVENT, props: { kind: k, note: note.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").slice(0, 300) } } });
  } catch {
    /* recording must never break the action being recorded */
  }
}
