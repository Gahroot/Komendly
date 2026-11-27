// Refund RECOMMENDATION only. Nothing here refunds anything: the owner approves in /admin/ads/support (existing
// RefundDialog -> /api/admin/ads/refunds -> issueAdsRefund). Pure.
import { GUARANTEE_DAYS } from "../ads/billing-config";

export interface RefundFacts {
  /** First paid invoice (paid_converted) amount and time; null = never paid. */
  firstPaid: { amountCents: number; at: Date } | null;
  subscriptionLive: boolean;
  workspaceRefunds: number;
  /** Failed jobs for this customer in the last 14 days (our fault). */
  failedJobs: number;
  /** The customer already downloaded ads from the paid pack. */
  downloaded: boolean;
  now: Date;
}
export type RefundVerdict = "recommend_refund" | "recommend_decline" | "owner_decides";
export interface RefundRecommendation { verdict: RefundVerdict; reasons: string[]; amountCents: number; daysSincePayment: number | null }

export function recommendRefund(f: RefundFacts): RefundRecommendation {
  if (!f.firstPaid || f.firstPaid.amountCents <= 0) return { verdict: "recommend_decline", reasons: ["No payment on record."], amountCents: 0, daysSincePayment: null };
  const days = Math.floor((f.now.getTime() - f.firstPaid.at.getTime()) / 86_400_000);
  const amountCents = f.firstPaid.amountCents;
  const inWindow = days <= GUARANTEE_DAYS;
  const reasons: string[] = [`Paid ${days} day(s) ago; guarantee is ${GUARANTEE_DAYS} days.`];
  if (f.workspaceRefunds > 0) return { verdict: "owner_decides", reasons: [...reasons, "This workspace was already refunded once."], amountCents, daysSincePayment: days };
  if (inWindow && f.failedJobs > 0) return { verdict: "recommend_refund", reasons: [...reasons, `${f.failedJobs} failed job(s): our fault.`], amountCents, daysSincePayment: days };
  if (inWindow) return { verdict: "recommend_refund", reasons: [...reasons, "Inside the guarantee window."], amountCents, daysSincePayment: days };
  if (f.failedJobs > 0) return { verdict: "owner_decides", reasons: [...reasons, `Outside the window but ${f.failedJobs} failed job(s): our fault, owner decides.`], amountCents, daysSincePayment: days };
  return { verdict: "recommend_decline", reasons: [...reasons, "Outside the guarantee window and no failures on our side."], amountCents, daysSincePayment: days };
}
