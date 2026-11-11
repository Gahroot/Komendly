import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { GiftProgress } from "@/components/growth/gift-progress";
import { getCurrentUser } from "@/lib/auth";
import { giftView } from "@/lib/ads/gifts";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Gift pack", robots: { index: false, follow: false } };

export default async function GiftProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/ads/login?next=${encodeURIComponent(`/ads/gifts/${id}`)}`);
  const ws = await getOrCreateWorkspace(user);
  const gift = await prisma.adsGift.findFirst({ where: { id, senderWorkspaceId: ws.id } });
  if (!gift) notFound();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <GiftProgress initial={await giftView(gift)} />
      </main>
    </div>
  );
}
