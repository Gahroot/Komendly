// Partner program: terms, application validation, referral source and the partner's link/code.
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ADS_PLANS } from "./billing-config";
import { MIN_PAYOUT_CENTS, REFUND_WINDOW_DAYS } from "./commissions";

export const PARTNER_TERMS = {
  commissionPct: 30,
  commissionMonths: 12,
  demoGiftsPerMonth: 3,
  minPayoutCents: MIN_PAYOUT_CENTS,
  refundWindowDays: REFUND_WINDOW_DAYS,
  attributionDays: 60,
} as const;

export const PARTNER_ROLES = ["web designer", "freelancer", "agency", "other"] as const;
export const PAYOUT_METHODS = ["paypal", "wise", "bank", "other"] as const;

export const PartnerApplication = z.object({
  company: z.string().trim().max(120).optional().default(""),
  website: z.string().trim().max(300).optional().default(""),
  role: z.enum(PARTNER_ROLES),
  clientCount: z.coerce.number().int().min(0).max(100_000),
  pitch: z.string().trim().min(10, "Tell us in a sentence or two how you'll share it.").max(2000),
  payoutEmail: z.string().trim().email("Enter the email for your payouts.").max(200),
  payoutMethod: z.enum(PAYOUT_METHODS),
});
export type PartnerApplicationInput = z.infer<typeof PartnerApplication>;

/** Website as typed ("acme.studio") -> https URL, or "" when blank/invalid. */
export function normalizeWebsite(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.includes(".") ? u.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

/** AdsReferral.source for a sign-up through `/r/<code>`: partner codes of approved partners count as 'partner'. */
export function sourceForCode(code: { kind: string } | null, partnerStatus: string | null): "partner" | "link" {
  return code?.kind === "partner" && partnerStatus === "approved" ? "partner" : "link";
}

/** For the referral builder (/r/[code] sign-up): `source: await referralSourceForCode(db, code)`. Never throws. */
export async function referralSourceForCode(db: Pick<PrismaClient, "adsReferralCode" | "adsPartner">, code: string): Promise<"partner" | "link"> {
  try {
    const row = await db.adsReferralCode.findUnique({ where: { code }, select: { kind: true, workspaceId: true } });
    if (row?.kind !== "partner") return "link";
    const partner = await db.adsPartner.findUnique({ where: { workspaceId: row.workspaceId }, select: { status: true } });
    return sourceForCode(row, partner?.status ?? null);
  } catch {
    return "link";
  }
}

/** Example earnings shown on /partners: n clients on a plan, per month. */
export function exampleMonthlyEarningsCents(clients: number, priceCents: number, pct: number = PARTNER_TERMS.commissionPct): number {
  return Math.round((clients * priceCents * pct) / 100);
}

export function exampleEarnings(): { clients: number; plan: string; priceCents: number; monthlyCents: number; yearCents: number }[] {
  const rows: { clients: number; key: string }[] = [{ clients: 10, key: "starter" }, { clients: 5, key: "growth" }, { clients: 20, key: "starter" }];
  return rows.flatMap(({ clients, key }) => {
    const plan = ADS_PLANS.find((p) => p.key === key);
    if (!plan) return [];
    const monthlyCents = exampleMonthlyEarningsCents(clients, plan.priceCents);
    return [{ clients, plan: plan.name, priceCents: plan.priceCents, monthlyCents, yearCents: monthlyCents * PARTNER_TERMS.commissionMonths }];
  });
}

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function demoGiftsLeft(perMonth: number, usedThisMonth: number): number {
  return Math.max(0, perMonth - usedThisMonth);
}

export function partnerLink(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/$/, "")}/r/${encodeURIComponent(code)}`;
}
