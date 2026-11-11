import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { OzzyAuth } from "@/components/hub/ozzy-auth";
import { REFERRAL_COOKIE, REFERRED_TRIAL_STATIC, lookupReferralCode } from "@/lib/ads/referrals";

export const metadata = { title: "Sign up", robots: { index: false, follow: true } };

export default async function AdsSignupPage({ searchParams }: { searchParams: Promise<{ next?: string; ref?: string }> }) {
  // Cached landing pages (e.g. /free-ads) can't know the session, so they send everyone here; skip signup if signed in.
  const { next, ref } = await searchParams;
  if (next?.startsWith("/ads/start?") && (await getCurrentUser())) redirect(next);
  // Referred visitors (kmd_ref from /r/<code>, or ?ref=) see the 20-ad referral offer.
  const code = (await cookies()).get(REFERRAL_COOKIE)?.value ?? ref?.toLowerCase();
  const referrer = code ? await lookupReferralCode(code) : null;
  return (
    <div className="min-h-screen text-foreground">
      <SiteHeader cta={false} />
      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <OzzyAuth mode="signup" referrerName={referrer?.name} freeStatic={referrer ? REFERRED_TRIAL_STATIC : 10} />
      </Suspense>
    </div>
  );
}
