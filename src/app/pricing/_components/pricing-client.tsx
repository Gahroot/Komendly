"use client";
// Client parts of the public (CDN-cached) /pricing page: nothing here is rendered on the server per user.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LegacySwitchOffer } from "@/components/billing/legacy-switch-offer";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { FIRST_VIDEO_OFFER, isLegacyTestimonialSubscriber } from "@/lib/first-video-offer";
import { startFirstVideoCheckout } from "@/lib/testimonial-checkout";

/** Launch Kit: registration/login redirect (?userId&email, not signed in yet) claims directly; otherwise sign-up flow / billing. */
export function LaunchKitActions() {
  const params = useSearchParams();
  const userId = params.get("userId");
  const email = params.get("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("canceled") === "true" ? "Checkout was canceled. Nothing was charged." : null);

  async function claim() {
    if (!userId || !email) return;
    setBusy(true);
    setError(null);
    const r = await startFirstVideoCheckout(userId, email);
    if (!r.ok) {
      setError(r.error);
      setBusy(false);
    }
  }

  return (
    <>
      {userId && email ? (
        <button type="button" onClick={() => void claim()} disabled={busy} className="spellbar__cta inline-flex h-11 items-center justify-center rounded-xl px-6 font-semibold disabled:opacity-70">
          {busy ? "Opening checkout…" : `Claim the ${FIRST_VIDEO_OFFER.name}`}
        </button>
      ) : (
        <Link href="/register?flow=first_video" className="spellbar__cta inline-flex h-11 items-center justify-center rounded-xl px-6 font-semibold">Claim the {FIRST_VIDEO_OFFER.name}</Link>
      )}
      <Link href="/dashboard/billing" className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 font-semibold transition-colors hover:bg-accent">Already a customer? Buy a pack</Link>
      {error ? <p role="alert" className="w-full text-sm text-[oklch(0.86_0.1_25)]">{error}</p> : null}
      <TrackOnMount event="offer_view" params={{ product: "testimonials", placement: "pricing" }} onceKey="testi_offer_view_pricing" />
    </>
  );
}

interface Me { plan: string; subscriptionStatus: string; stripeSubscriptionId?: string | null; minutesLimit: number; bonusMinutes: number; cancelAtPeriodEnd?: boolean }

/** Grandfathered testimonial subscribers: their plan is unchanged (manage it in Billing) + the one-click switch offer. */
export function LegacyPlanNotice() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/auth/me", { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ user: Me }>) : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => undefined);
    return () => ac.abort();
  }, []);
  if (!me || !isLegacyTestimonialSubscriber({ ...me, stripeSubscriptionId: me.stripeSubscriptionId ?? null })) return null;
  return (
    <div className="space-y-4">
      <p className="glass rounded-2xl p-4 text-sm">
        You&apos;re on the grandfathered {me.plan} testimonials plan: same price, same videos.{" "}
        <Link href="/dashboard/billing" className="underline underline-offset-2">Manage it in Billing</Link>.
      </p>
      {!me.cancelAtPeriodEnd ? <LegacySwitchOffer legacyPlan={me.plan} videosPerMonth={Math.max(0, me.minutesLimit - me.bonusMinutes)} /> : null}
    </div>
  );
}
