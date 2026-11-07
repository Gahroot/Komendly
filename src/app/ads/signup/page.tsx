import { Suspense } from "react";
import { AdsAuthForm } from "@/components/ads/ads-auth-form";
import { AdsAuthShell } from "@/components/ads/ads-auth-shell";
import { AdsNav } from "@/components/ads/ads-nav";

export const metadata = { title: "Sign up | Komendly Ads" };

export default function AdsSignupPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn={false} />
      <AdsAuthShell>
        <Suspense>
          <AdsAuthForm mode="signup" />
        </Suspense>
      </AdsAuthShell>
    </div>
  );
}
