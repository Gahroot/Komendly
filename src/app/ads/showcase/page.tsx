import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { ShowcaseSettings } from "@/components/hubs/showcase-settings";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Public showcase", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/ads/login?next=/ads/showcase");
  const ws = await getOrCreateWorkspace(user);
  const ads = await prisma.ad.findMany({ where: { workspaceId: ws.id, status: "ready", run: { kind: "standard" } }, orderBy: { createdAt: "desc" }, take: 24, select: { id: true, headline: true } });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <h1 className="font-display text-3xl font-medium">Public showcase</h1>
        <p className="text-sm text-muted-foreground">Optionally show some of your ads on a public page and on the Komendly showcase feed. It&apos;s off by default and you can unpublish at any time.</p>
        <ShowcaseSettings ads={ads} />
      </main>
    </div>
  );
}
