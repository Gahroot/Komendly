import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { AdsBrandList } from "@/components/ads/ads-brand-list";
import { AdsNav } from "@/components/ads/ads-nav";

export const metadata = { title: "Brand profiles | Komendly Ads" };

export default async function AdsBrandsPage() {
  if (!(await getCurrentUser())) redirect(`/ads/login?next=${encodeURIComponent("/ads/brands")}`);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Brand profiles</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            One profile per website: colours, fonts, audience, pains and the facts your ads may claim. New runs for a site reuse its profile, so corrections you make stick.
          </p>
        </div>
        <Card><CardContent><AdsBrandList /></CardContent></Card>
      </main>
    </div>
  );
}
