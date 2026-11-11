import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { GiftList } from "@/components/growth/gift-list";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Gift packs", robots: { index: false, follow: false } };

export default async function GiftsPage() {
  if (!(await getCurrentUser())) redirect("/ads/login?next=/ads/gifts");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex items-center gap-4">
          <Image src="/brand/ozzy-joyful-happy.png" alt="" width={72} height={72} unoptimized className="size-14 [image-rendering:pixelated] sm:size-16" />
          <div>
            <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">Gift packs</h1>
            <p className="text-sm text-muted-foreground">3 free ads for a business you know, made by Ozzy, sent from you.</p>
          </div>
        </div>
        <GiftList />
      </main>
    </div>
  );
}
