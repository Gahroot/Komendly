import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { OzzyAuth } from "@/components/hub/ozzy-auth";

export const metadata = { title: "Sign in", robots: { index: false, follow: true } };

/** Same Ozzy front door as /login (kept for old links and ?next=/ads/... flows). */
export default function AdsLoginPage() {
  return (
    <div className="min-h-screen text-foreground">
      <SiteHeader cta={false} />
      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <OzzyAuth mode="login" />
      </Suspense>
    </div>
  );
}
