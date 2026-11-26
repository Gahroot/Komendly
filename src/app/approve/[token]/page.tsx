import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovePanel } from "@/components/hubs/approve-panel";
import { HubShell } from "@/components/hubs/hub-shell";
import { approvePack, hubsEnabled } from "@/lib/growth/creative-hubs-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review these ads", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const pack = (await hubsEnabled()) ? await approvePack(token) : null;
  if (!pack) notFound();
  return (
    <HubShell wide title={`Ads for ${pack.brand}`} lead="No login needed. Approve them or ask for changes and the owner is notified by email.">
      {pack.last && <p className="mb-4 text-sm text-muted-foreground">Latest response: {pack.last.action === "approve" ? "approved" : "changes requested"} on {pack.last.at.toISOString().slice(0, 10)}.</p>}
      <div className="grid gap-4 sm:grid-cols-3">{pack.ads.map((a) => <figure key={a.id}><Image src={`/api/hub/img/${encodeURIComponent(`a.${token}`)}/${a.assetId}`} alt={a.headline} width={a.width} height={a.height} unoptimized className="h-auto w-full rounded-xl" /><figcaption className="mt-1 text-sm">{a.headline}</figcaption></figure>)}</div>
      <div className="mt-8"><ApprovePanel token={token} /></div>
      <p className="mt-10 text-sm text-muted-foreground">Want ads like these for your own business? <Link className="underline" href="/free-ads?utm_source=approve&utm_medium=referral&utm_campaign=approve_link">Make your own free ads</Link>.</p>
    </HubShell>
  );
}
