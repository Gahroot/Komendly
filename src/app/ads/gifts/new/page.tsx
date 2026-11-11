import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { GiftList } from "@/components/growth/gift-list";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New gift pack", robots: { index: false, follow: false } };

/** Same gift UI; admins (?admin=1) send unlimited outreach packs (source admin_outreach, enforced server-side by User.isAdmin). */
export default async function NewGiftPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/ads/login?next=/ads/gifts/new");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">{user.isAdmin ? "Outreach gift pack" : "New gift pack"}</h1>
        <GiftList admin={user.isAdmin} />
      </main>
    </div>
  );
}
