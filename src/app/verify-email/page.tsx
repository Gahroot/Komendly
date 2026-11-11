import { Suspense } from "react";
import { AdsNav } from "@/components/ads/ads-nav";
import { VerifyEmailConfirm } from "@/components/ads/verify-email-confirm";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Confirm your email", robots: { index: false } };

export default async function VerifyEmailPage() {
  const signedIn = Boolean(await getCurrentUser());
  return (
    <div className="min-h-screen">
      <AdsNav signedIn={signedIn} />
      <main className="flex justify-center px-4 py-16 sm:py-24">
        <Suspense>
          <VerifyEmailConfirm signedIn={signedIn} />
        </Suspense>
      </main>
    </div>
  );
}
