"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FirstVideoOfferCard } from "@/components/testimonials/first-video-offer-card";
import { track, trackOnce } from "@/lib/analytics/track";
import { Loader2 } from "lucide-react";
import { checkFirstVideoEligibility, FIRST_VIDEO_OFFER, formatUsd, GUARANTEE, perVideoUsd, VIDEO_PACK_OFFER, videosLabel } from "@/lib/first-video-offer";
import { plans } from "@/lib/pricing-plans";

export interface OfferUserLike {
  plan: string;
  subscriptionStatus: string;
  stripeSubscriptionId?: string | null;
  bonusMinutes: number;
}

/** Client-side guess at offer eligibility; the server enforces it (409 hides the card). */
export function offerLikelyEligible(u: OfferUserLike | null): boolean {
  if (!u) return false;
  return checkFirstVideoEligibility({
    plan: u.plan,
    subscriptionStatus: u.subscriptionStatus,
    stripeSubscriptionId: u.stripeSubscriptionId ?? null,
    purchaseCount: u.bonusMinutes > 0 ? 1 : 0,
  }).eligible;
}

/** Signed-in claim of the first-video starter pack (Stripe checkout via /api/stripe/credits). */
export async function claimFirstVideo(): Promise<{ ok: true } | { ok: false; error: string; unavailable: boolean }> {
  try {
    const res = await fetch("/api/stripe/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offer: FIRST_VIDEO_OFFER.key }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) return { ok: false, error: data.error || "Couldn't open checkout. Please try again.", unavailable: res.status === 409 };
    track("begin_checkout", { product: "testimonials", offer: FIRST_VIDEO_OFFER.key, value: FIRST_VIDEO_OFFER.priceCents / 100, currency: "USD" });
    window.location.href = data.url;
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach checkout. Check your connection and try again.", unavailable: false };
  }
}

async function postCheckout(url: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) return data.error || "Couldn't open checkout. Please try again.";
    window.location.href = data.url;
    return null;
  } catch {
    return "Couldn't reach checkout. Check your connection and try again.";
  }
}

const growth = plans[0];

/** Shown when the user has no minutes left: Launch Kit if eligible; else the entry plan, with a one-time pack as the downsell. */
export function OutOfMinutes({ user, placement, onBeforeCheckout }: { user: (OfferUserLike & { id?: string; email?: string }) | null; placement: string; onBeforeCheckout?: () => void }) {
  const [unavailable, setUnavailable] = useState(false);
  const eligible = !unavailable && offerLikelyEligible(user);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    if (eligible) trackOnce(`testi_offer_view_${placement}`, "offer_view", { product: "testimonials", placement });
  }, [eligible, placement]);

  async function claim() {
    setLoading("offer");
    setError(null);
    onBeforeCheckout?.();
    const r = await claimFirstVideo();
    if (!r.ok) {
      setError(r.error);
      if (r.unavailable) setUnavailable(true);
      setLoading(null);
    }
  }

  async function buy(key: string, url: string, body: unknown, value: number) {
    setLoading(key);
    setError(null);
    onBeforeCheckout?.();
    track("begin_checkout", { product: "testimonials", offer: key, value, currency: "USD" });
    const err = await postCheckout(url, body);
    if (err) {
      setError(err);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p role="alert" className="rounded-xl border border-[oklch(0.7_0.17_25/0.5)] bg-[oklch(0.7_0.17_25/0.12)] p-3 text-sm text-[oklch(0.86_0.1_25)]">{error}</p> : null}
      {eligible ? (
        <FirstVideoOfferCard onClaim={claim} loading={loading === "offer"} ctaLabel="Film this video" />
      ) : !declined && growth && user?.id && user.email ? (
        <div className="rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.6)] p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--studio-gold)]">Out of videos</p>
          <h3 className="font-display mt-1 text-2xl font-medium">Make every 5-star review a video</h3>
          <p className="mt-2 text-sm text-muted-foreground">{growth.name}: {videosLabel(growth.minutes)} a month for ${growth.monthlyPrice}. Cancel any time. Your review and presenter are saved.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" disabled={loading !== null} onClick={() => void buy(growth.key, "/api/stripe/checkout", { planKey: growth.key, userId: user.id, email: user.email, billingCycle: "monthly", launchCredit: true }, growth.monthlyPrice)} className="spellbar__cta inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-70">
              {loading === growth.key ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}Start {growth.name}
            </button>
            <Link href="/dashboard/billing" onClick={onBeforeCheckout} className="inline-flex h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Compare plans</Link>
            <button type="button" onClick={() => setDeclined(true)} className="inline-flex h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:ml-auto">Not ready for monthly?</button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.6)] p-6">
          <h3 className="font-display text-2xl font-medium">Just need a few more?</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {VIDEO_PACK_OFFER.name}: {videosLabel(VIDEO_PACK_OFFER.minutes)}, up to 60s each, for {formatUsd(VIDEO_PACK_OFFER.priceCents)} once ({perVideoUsd(VIDEO_PACK_OFFER.priceCents, VIDEO_PACK_OFFER.minutes)} a video). No subscription.
          </p>
          <button type="button" disabled={loading !== null} onClick={() => void buy(VIDEO_PACK_OFFER.key, "/api/stripe/credits", { offer: VIDEO_PACK_OFFER.key }, VIDEO_PACK_OFFER.priceCents / 100)} className="spellbar__cta mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-70">
            {loading === VIDEO_PACK_OFFER.key ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}Get the {VIDEO_PACK_OFFER.name}: {formatUsd(VIDEO_PACK_OFFER.priceCents)}
          </button>
          <p className="mt-3 text-xs text-muted-foreground">{GUARANTEE}</p>
        </div>
      )}
    </div>
  );
}

/** After a Launch Kit buyer's video is ready: continuity upsell to the entry plan (credit applies only if configured server-side). */
export function LaunchUpsell({ user, placement }: { user: (OfferUserLike & { id?: string; email?: string }) | null; placement: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscribed = user?.subscriptionStatus === "active" || user?.subscriptionStatus === "trialing";
  const show = !!user?.id && !!user.email && !subscribed && user.bonusMinutes > 0 && !!growth;
  useEffect(() => {
    if (show) trackOnce(`testi_upsell_view_${placement}`, "offer_view", { product: "testimonials", placement, offer: "launch_upsell" });
  }, [show, placement]);
  if (!show || !growth || !user?.id || !user.email) return null;
  const { id, email } = user;

  async function go() {
    if (!growth) return;
    setLoading(true);
    setError(null);
    track("begin_checkout", { product: "testimonials", plan: growth.key, billing: "monthly", value: growth.monthlyPrice, currency: "USD", placement });
    const err = await postCheckout("/api/stripe/checkout", { planKey: growth.key, userId: id, email, billingCycle: "monthly", launchCredit: true });
    if (err) {
      setError(err);
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby={`upsell-${placement}`} className="pixel-frame bg-[linear-gradient(160deg,#3a2266,#1c0f36_70%,#2a1020)] p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--studio-gold)]">Next step</p>
      <h2 id={`upsell-${placement}`} className="font-display mt-1 text-2xl font-medium">Make every 5-star review a video</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {growth.name} gives you {videosLabel(growth.minutes)} a month for ${growth.monthlyPrice} ({perVideoUsd(growth.monthlyPrice * 100, growth.minutes)} a video), so each new review can go out as a video. Your first month starts today; cancel any time.
      </p>
      {error ? <p role="alert" className="mt-3 text-sm text-[oklch(0.86_0.1_25)]">{error}</p> : null}
      <button type="button" onClick={() => void go()} disabled={loading} className="spellbar__cta mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-70">
        {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}Start {growth.name}
      </button>
    </section>
  );
}
