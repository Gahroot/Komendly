// 30-day guarantee, self-serve: pure eligibility rules (client-safe). Server side: ./self-refund.ts.
import { GUARANTEE_DAYS } from "./billing-config";

export const SELF_REFUND_REASONS = [
  { key: "no_results", label: "The ads didn't bring results" },
  { key: "not_my_style", label: "The ads didn't feel like my brand" },
  { key: "no_time", label: "I didn't have time to use it" },
  { key: "too_expensive", label: "It costs too much for me right now" },
  { key: "other", label: "Something else" },
] as const;
export type SelfRefundReason = (typeof SELF_REFUND_REASONS)[number]["key"];

export type SelfRefundBlock = "no_payment" | "expired" | "no_subscription" | "already_refunded" | "used_before";

export interface SelfRefundFacts {
  /** First paid invoice of the workspace's first subscription (paid_converted), if any. */
  firstPaid: { invoiceId: string; amountCents: number; at: Date } | null;
  subscriptionLive: boolean;
  /** Any AdsRefund on this workspace (admin, Stripe dashboard or self-serve). */
  workspaceRefunds: number;
  /** A self_refund already recorded for this user, email or card. */
  priorSelfRefund: boolean;
  now: Date;
}

export type SelfRefundEligibility = { ok: true; invoiceId: string; amountCents: number; endsAt: Date } | { ok: false; reason: SelfRefundBlock };

export function selfRefundEligibility(f: SelfRefundFacts): SelfRefundEligibility {
  if (!f.firstPaid || f.firstPaid.amountCents <= 0) return { ok: false, reason: "no_payment" };
  const endsAt = new Date(f.firstPaid.at.getTime() + GUARANTEE_DAYS * 86_400_000);
  if (f.now >= endsAt) return { ok: false, reason: "expired" };
  if (f.workspaceRefunds > 0) return { ok: false, reason: "already_refunded" };
  if (f.priorSelfRefund) return { ok: false, reason: "used_before" };
  if (!f.subscriptionLive) return { ok: false, reason: "no_subscription" };
  return { ok: true, invoiceId: f.firstPaid.invoiceId, amountCents: f.firstPaid.amountCents, endsAt };
}

export const SELF_REFUND_MESSAGES: Record<SelfRefundBlock, string> = {
  no_payment: "There's no payment to refund yet.",
  expired: "The 30-day refund window has closed.",
  no_subscription: "Your plan is already canceled, so there's nothing to refund here.",
  already_refunded: "This payment was already refunded.",
  used_before: "The one-click refund can be used once per customer, and it's been used.",
};
