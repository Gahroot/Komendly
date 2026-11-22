// Growth Autopilot founding spots (founder decision 2026-11-22): the first AUTOPILOT_FOUNDING_SPOTS businesses only.
// A spot is taken by a workspace on the autopilot plan with a live subscription (active, trialing or past_due).
// Checked at checkout (src/app/api/ads-billing/checkout/route.ts) and by the offer UIs (waitlist line when 0).
// Two checkouts started in the same instant can both pass at 1 spot left; that is accepted (Stripe can't hold a seat).
import { AUTOPILOT_FOUNDING_SPOTS } from "./billing-config";

export interface FoundingSpotsDb {
  adsWorkspace: { count(args: { where: { adsPlan: string; subscriptionStatus: { in: string[] } } }): Promise<number> };
}

/** Pure: spots left given how many are taken (never below 0). */
export function spotsLeftFrom(taken: number, total: number = AUTOPILOT_FOUNDING_SPOTS): number {
  return Math.max(0, total - taken);
}

/** Founding spots still open for Growth Autopilot. */
export async function foundingSpotsLeft(db: FoundingSpotsDb): Promise<number> {
  const taken = await db.adsWorkspace.count({ where: { adsPlan: "autopilot", subscriptionStatus: { in: ["active", "trialing", "past_due"] } } });
  return spotsLeftFrom(taken);
}
