import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { AgencyBoard } from "@/components/ads/agency/agency-board";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { agencyEnabled, isAgencyWorkspace, loadAgencyView } from "@/lib/customer-intel/agency-server";

export const metadata: Metadata = { title: "Your clients", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AgencyPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/ads/login?next=${encodeURIComponent("/ads/agency")}`);
  const ws = await getOrCreateWorkspace(user);
  if (!(await agencyEnabled()) || !isAgencyWorkspace(ws)) notFound();
  const view = await loadAgencyView(ws);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn extraLinks={[{ href: "/ads/agency", label: "Your clients" }]} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your clients</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Every client brand in one place: latest pack, approval, credits used and the one thing to do next. Add a client by making a pack for their website on <Link className="underline" href="/ads/start">the start page</Link>.</p>
        </div>
        {view.rows.length === 0 ? (
          <Card><CardContent className="py-8 text-sm text-muted-foreground">No clients yet. Make a pack for a client&apos;s website and they&apos;ll appear here.</CardContent></Card>
        ) : (
          <AgencyBoard rows={view.rows} due={view.due} credits={view.credits} dropCost={view.dropCost} unlimited={view.unlimited} pooled30d={view.pooled30d} />
        )}
      </main>
    </div>
  );
}
