import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextStepBanner } from "@/components/ads/next-step-banner";
import { nextStepFor } from "@/lib/customer-intel/state-server";
import { AdsNav } from "@/components/ads/ads-nav";
import { CheckoutReturnTracker } from "@/components/analytics/checkout-return-tracker";
import { CheckoutPending } from "@/components/ads/team/checkout-pending";
import { LiveTracker } from "@/components/ads/team/live-tracker";
import { TeamApp } from "@/components/ads/team/team-app";
import { TeamOffer, type TeamOfferProps } from "@/components/ads/team/team-offer";
import { getCurrentUser } from "@/lib/auth";
import { AUTOPILOT_REGULAR_PRICE_CENTS, getPlan, priceIdFor } from "@/lib/ads/billing-config";
import { formatCents } from "@/lib/ads/billing-format";
import { isPaidWorkspace } from "@/lib/ads/billing-gates";
import { isBillingConfigured } from "@/lib/ads/billing-stripe";
import { loadCheckoutPixel } from "@/lib/ads/checkout-pixel";
import { foundingSpotsLeft } from "@/lib/ads/founding-spots";
import { prisma } from "@/lib/prisma";
import { getAutopilotLaunchState } from "@/lib/ads/autopilot-launch";
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
  const nextStep = await nextStepFor(ws); // null unless sys_simplicity is on

  let offer: TeamOfferProps | null = null;
  if (!status.hired) {
    // Pre-hire: sell Growth Autopilot (the team). Ad Department (DIY) members switch in the billing portal.
    const plan = getPlan("autopilot");
    const paid = isPaidWorkspace(ws);
    const configured = isBillingConfigured() && !!plan && !!priceIdFor(plan);
    const spotsLeft = await foundingSpotsLeft(prisma);
    const launch = configured && spotsLeft > 0 ? (await getAutopilotLaunchState(ws.id)).open : false;
    offer = {
      launch,
      priceLabel: formatCents(plan?.priceCents ?? 0),
      regularPriceLabel: formatCents(AUTOPILOT_REGULAR_PRICE_CENTS),
      spotsFull: spotsLeft <= 0,
      checkout: !configured ? null : { kind: "plan", key: "autopilot" },
      switchInPortal: paid && !!ws.stripeCustomerId,
      blockedReason: ws.suspendedAt ? "This account is on hold. Write to nolan@komendly.com." : !status.isOwner ? "Ask the account owner to hire the team." : null,
    };
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {checkout === "success" && <CheckoutReturnTracker outcome="success" pixel={await loadCheckoutPixel(session_id, ws.id)} />}
        {nextStep && <NextStepBanner action={nextStep} />}
        {status.hired && <LiveTracker workspaceId={ws.id} />}
        {status.hired ? <TeamApp initial={status} /> : checkout === "success" ? <CheckoutPending /> : offer && <TeamOffer {...offer} />}
      </main>
    </div>
  );
}
