import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdsNav } from "@/components/ads/ads-nav";
import { BrandProfileEditor } from "@/components/ads/brand-profile-editor";

export const metadata = { title: "Brand profile | Komendly Ads" };

export default async function AdsBrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getCurrentUser())) redirect(`/ads/login?next=${encodeURIComponent(`/ads/brands/${id}`)}`);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <BrandProfileEditor id={id} />
      </main>
    </div>
  );
}
