import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdsNav } from "@/components/ads/ads-nav";
import { CoachApp } from "@/components/ads/coach/coach-app";

export const metadata = { title: "Ozzy Ad Coach", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdsCoachPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/ads/login?next=${encodeURIComponent("/ads/coach")}`);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <CoachApp />
      </main>
    </div>
  );
}
