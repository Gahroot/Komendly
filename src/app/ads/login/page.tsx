import { Suspense } from "react";
import { AdsAuthForm } from "@/components/ads/ads-auth-form";
import { AdsAuthShell } from "@/components/ads/ads-auth-shell";
import { AdsNav } from "@/components/ads/ads-nav";

export const metadata = { title: "Sign in | Komendly Ads" };

export default function AdsLoginPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn={false} />
      <AdsAuthShell>
        <Suspense>
          <AdsAuthForm mode="login" />
        </Suspense>
      </AdsAuthShell>
    </div>
  );
}
