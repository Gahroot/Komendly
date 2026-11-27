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

export const metadata = { title: "Your ads", robots: { index: false, follow: false } };

export default async function AdRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const next = await nextStepFor(member.workspace); // null unless sys_simplicity is on
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-6xl px-4 py-10">
        {next && <NextStepBanner action={next} />}
        <RunScreen initial={run} />
        <RunShareCard runId={id} />
      </main>
    </div>
  );
}
