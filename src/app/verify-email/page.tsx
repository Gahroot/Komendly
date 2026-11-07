import { Suspense } from "react";
import { VerifyEmailConfirm } from "@/components/ads/verify-email-confirm";

export const metadata = { title: "Confirm your email | Komendly" };

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Suspense>
        <VerifyEmailConfirm />
      </Suspense>
    </main>
  );
}
