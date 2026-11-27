import { notFound, redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { RunScreen } from "@/components/ads/run-screen";
import { loadRunView } from "@/lib/ads/run-view";
import { AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";
import { RunShareCard } from "@/components/hubs/run-share-card";
import { SwitchAccountCard } from "@/components/ads/switch-account-card";
import { getCurrentUser } from "@/lib/auth";
import { NextStepBanner } from "@/components/ads/next-step-banner";
import { nextStepFor } from "@/lib/customer-intel/state-server";
import { prisma } from "@/lib/prisma";
import { CheckoutReturnTracker } from "@/components/analytics/checkout-return-tracker";
import { loadCheckoutPixel } from "@/lib/ads/checkout-pixel";

export const metadata = { title: "Your ads", robots: { index: false, follow: false } };

export default async function AdRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ checkout?: string; session_id?: string }> }) {
  const { id } = await params;
  const { checkout, session_id } = await searchParams;
  let member;
  try {
    member = await requireWorkspaceMember({ runId: id });
  } catch (error) {
    if (error instanceof AdsHttpError && error.status === 401) redirect(`/ads/login?next=${encodeURIComponent(`/ads/runs/${id}`)}`);
    // Signed in, but the pack belongs to another account (e.g. made via ChatGPT/Shopify with a different login): offer a switch.
    const user = await getCurrentUser();
    const exists = user ? await prisma.adRun.findUnique({ where: { id }, select: { id: true } }) : null;
    if (!user || !exists) notFound();
    return (
      <div className="min-h-screen bg-background text-foreground">
        <AdsNav signedIn />
        <main className="mx-auto max-w-6xl px-4 py-16">
          <SwitchAccountCard email={user.email} next={`/ads/runs/${id}`} />
        </main>
      </div>
    );
  }
  const run = await loadRunView(id);
  if (!run) notFound();
  // Outcome verification reads `pack_opened` ("Opened" tier). Nothing wrote it before. One row per run, finished packs only,
  // members only (requireWorkspaceMember above). Direct insert: this is not a Meta funnel step, so no CAPI forward. Never blocks the page.
  if (["completed", "partial"].includes(run.status)) {
    try {
      const seen = await prisma.adsEvent.findFirst({ where: { name: "pack_opened", runId: id }, select: { id: true } });
      if (!seen) await prisma.adsEvent.create({ data: { name: "pack_opened", workspaceId: member.workspace.id, userId: member.user.id, runId: id, props: {} } });
    } catch { /* analytics must never break the page */ }
  }
  const next = await nextStepFor(member.workspace); // null unless sys_simplicity is on
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-6xl px-4 py-10">
        {next && <NextStepBanner action={next} />}
        {/* The $9 unlock returns here: browser Purchase with the same event_id as the webhook's CAPI event (dedup). */}
        {checkout === "success" && <CheckoutReturnTracker outcome="success" pixel={await loadCheckoutPixel(session_id, member.workspace.id)} />}
        <RunScreen initial={run} />
        <RunShareCard runId={id} />
      </main>
    </div>
  );
}
