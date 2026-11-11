import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { OzzyAuth } from "@/components/hub/ozzy-auth";

/** The one Ozzy sign-in for every app. */
export default function LoginPage() {
  return (
    <div className="min-h-screen text-foreground">
      <SiteHeader cta={false} />
      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <OzzyAuth mode="login" />
      </Suspense>
    </div>
  );
}
