import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdsNav } from "@/components/ads/ads-nav";
import { StartRunRunner } from "@/components/ads/start-run-runner";

export const metadata = { title: "Starting your ads", robots: { index: false, follow: false } };

export default async function AdsStartPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getCurrentUser())) {
    const qs = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(`/ads/login?next=${encodeURIComponent(`/ads/start?${qs.toString()}`)}`);
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="flex justify-center px-4 py-16 sm:py-24">
        <Suspense>
          <StartRunRunner />
        </Suspense>
      </main>
    </div>
  );
}
