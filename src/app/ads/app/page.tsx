import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdsAccountCard } from "@/components/ads/ads-account-card";
import { AdsBrandList } from "@/components/ads/ads-brand-list";
import { AdsNav } from "@/components/ads/ads-nav";
import { AdsRecentRuns } from "@/components/ads/ads-recent-runs";
import { AdsUrlForm } from "@/components/ads/ads-url-form";
import { StudioOzzySlot } from "@/components/studio/studio-ozzy-slot";
import { DeviceCookie } from "@/components/ads/device-cookie";

export const metadata = { title: "Home | Komendly Ads" };

export default async function AdsAppPage() {
  if (!(await getCurrentUser())) redirect(`/ads/login?next=${encodeURIComponent("/ads/app")}`);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DeviceCookie />
      <AdsNav signedIn />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your ads</h1>
          <p className="text-sm text-muted-foreground">Start a new run or pick up where you left off.</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card className="relative overflow-visible">
              <div className="pointer-events-none absolute -top-[76px] right-4 hidden sm:block [&>*]:pointer-events-auto"><StudioOzzySlot greet size={96} /></div>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Make new ads</CardTitle>
                <CardDescription>Paste a website. Ozzy reads it, shows you what he found, then designs your ads.</CardDescription>
              </CardHeader>
              <CardContent><AdsUrlForm signedIn /></CardContent>
            </Card>
            <AdsRecentRuns />
          </div>
          <div className="space-y-6">
            <AdsAccountCard />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base font-semibold">
                  Brand profiles
                  <Button asChild variant="ghost" size="sm"><Link href="/ads/brands">View all</Link></Button>
                </CardTitle>
              </CardHeader>
              <CardContent><AdsBrandList limit={3} /></CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
