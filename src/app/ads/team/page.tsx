import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { CheckoutReturnTracker } from "@/components/analytics/checkout-return-tracker";
import { CheckoutPending } from "@/components/ads/team/checkout-pending";
import { TeamApp } from "@/components/ads/team/team-app";
import { TeamOffer, type TeamOfferProps } from "@/components/ads/team/team-offer";
import { getCurrentUser } from "@/lib/auth";
import { LAUNCH_QUARTER, getPlan, offerCouponId, offerFirstPaymentCents, priceIdFor } from "@/lib/ads/billing-config";
import { formatCents } from "@/lib/ads/billing-format";
import { isPaidWorkspace } from "@/lib/ads/billing-gates";
import { isBillingConfigured } from "@/lib/ads/billing-stripe";
import { loadCheckoutPixel } from "@/lib/ads/checkout-pixel";
import { getLaunchOfferState } from "@/lib/ads/launch-offer";
import { loadTeamStatus, requireTeamAccess } from "@/lib/ads/team/server";

export const metadata: Metadata = { title: "Your marketing team", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/ads/login?next=${encodeURIComponent("/ads/team")}`);
  const { checkout, session_id } = await searchParams;
  const access = await requireTeamAccess();
  const ws = access.workspace;
  const status = await loadTeamStatus(access);

  let offer: TeamOfferProps | null = null;
  if (!status.hired) {
    const plan = getPlan("ad_department");
    const paid = isPaidWorkspace(ws);
    const configured = isBillingConfigured() && !!plan && !!priceIdFor(plan);
    const launch = !paid && configured && !!offerCouponId(LAUNCH_QUARTER) && (await getLaunchOfferState(ws.id)).open;
    offer = {
      priceLabel: formatCents(plan?.priceCents ?? 0),
      firstMonthLabel: launch ? formatCents(offerFirstPaymentCents(LAUNCH_QUARTER)) : null,
      checkout: !configured ? null : launch ? { kind: "offer", key: LAUNCH_QUARTER.key } : { kind: "plan", key: "ad_department" },
      switchInPortal: paid && !!ws.stripeCustomerId,
      blockedReason: ws.suspendedAt ? "This account is on hold. Write to nolan@komendly.com." : !status.isOwner ? "Ask the account owner to hire the team." : null,
    };
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {checkout === "success" && <CheckoutReturnTracker outcome="success" pixel={await loadCheckoutPixel(session_id, ws.id)} />}
        {status.hired ? <TeamApp initial={status} /> : checkout === "success" ? <CheckoutPending /> : offer && <TeamOffer {...offer} />}
      </main>
    </div>
  );
}
