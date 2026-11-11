"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Clock, CreditCard, ExternalLink, Loader2, Minus, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { LegacySwitchOffer } from "@/components/billing/legacy-switch-offer";
import { FirstVideoOfferCard } from "@/components/testimonials/first-video-offer-card";
import { claimFirstVideo, offerLikelyEligible } from "@/components/testimonials/create/offer-gate";
import { FIRST_VIDEO_OFFER, formatUsd, isLegacyTestimonialSubscriber, VIDEO_PACK_OFFER, videosLabel } from "@/lib/first-video-offer";
import { OzzyPerch } from "@/components/testimonials/ozzy-perch";
import { trackOnce } from "@/lib/analytics/track";
import { CREDIT_PRICE_PER_MINUTE_USD } from "@/lib/pricing-plans";
import { cn } from "@/lib/utils";

interface BillingUser {
  id: string;
  email: string;
  plan: string;
  subscriptionStatus: string;
  stripeSubscriptionId?: string | null;
  minutesUsed: number;
  minutesLimit: number;
  bonusMinutes: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const PACKS = [1, 3, 5, 10] as const;
const panel = "rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.6)] p-6";

function BillingContent() {
  const params = useSearchParams();
  const [user, setUser] = useState<BillingUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [minutesToBuy, setMinutesToBuy] = useState<number>(3);
  const [busy, setBusy] = useState<string | null>(null);
  const [offerHidden, setOfferHidden] = useState(false);
  const [error, setError] = useState<string | null>(params.get("canceled") === "true" ? "Checkout was canceled. Nothing was charged." : null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? (r.json() as Promise<{ user: BillingUser }>) : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setError("Couldn't load your account."))
      .finally(() => setLoading(false));
  }, []);

  const subscribed = user?.subscriptionStatus === "active" || user?.subscriptionStatus === "trialing";
  const showOffer = !offerHidden && offerLikelyEligible(user);
  useEffect(() => {
    if (showOffer) trackOnce("testi_offer_view_billing", "offer_view", { product: "testimonials", placement: "billing" });
  }, [showOffer]);

  async function post(key: string, url: string, body: unknown): Promise<void> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Something went wrong");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  async function claim() {
    setBusy("offer");
    setError(null);
    const r = await claimFirstVideo();
    if (!r.ok) {
      setError(r.error);
      if (r.unavailable) setOfferHidden(true);
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status">
        <Loader2 aria-hidden className="size-8 animate-spin text-[var(--studio-gold)]" />
        <span className="sr-only">Loading billing…</span>
      </div>
    );
  }

  const remaining = user ? Math.max(0, user.minutesLimit - user.minutesUsed) : 0;
  const used = user?.minutesLimit ? Math.min(100, (user.minutesUsed / user.minutesLimit) * 100) : 0;
  const periodEnd = user?.currentPeriodEnd ? new Date(user.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;
  const planName = !user ? "None" : subscribed ? user.plan[0]?.toUpperCase() + user.plan.slice(1) : user.bonusMinutes > 0 ? `${FIRST_VIDEO_OFFER.name} (one-time)` : "No plan yet";

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Account" title="Billing" description="Your videos, your plan, and top-ups." />

      {error ? <p role="alert" className="rounded-xl border border-[oklch(0.7_0.17_25/0.5)] bg-[oklch(0.7_0.17_25/0.12)] p-3 text-sm text-[oklch(0.86_0.1_25)]">{error}</p> : null}

      {showOffer ? (
        <section aria-label="First video offer" className="relative max-w-3xl pt-16">
          <OzzyPerch mood={{ form: "joyful", expression: "happy", motion: "wave" }} size={80} className="absolute right-6 top-0 z-10" />
          <FirstVideoOfferCard onClaim={claim} loading={busy === "offer"} />
        </section>
      ) : null}

      {user && isLegacyTestimonialSubscriber({ ...user, stripeSubscriptionId: user.stripeSubscriptionId ?? null }) && !user.cancelAtPeriodEnd ? (
        <LegacySwitchOffer legacyPlan={user.plan} videosPerMonth={Math.max(0, user.minutesLimit - user.bonusMinutes)} />
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <section className={panel} aria-labelledby="plan-h">
          <h2 id="plan-h" className="font-display flex items-center gap-2 text-xl font-medium"><CreditCard aria-hidden className="size-5 text-[var(--studio-gold)]" />Plan</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Plan</dt><dd className="font-medium">{planName}</dd></div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd className={cn("flex items-center gap-1 font-medium", subscribed ? "text-[var(--success)]" : "text-muted-foreground")}>
                {subscribed ? <Check aria-hidden className="size-4" /> : null}
                {subscribed ? "Active" : "No subscription"}
              </dd>
            </div>
            {periodEnd ? <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{user?.cancelAtPeriodEnd ? "Ends on" : "Renews on"}</dt><dd>{periodEnd}</dd></div> : null}
          </dl>
          {user?.cancelAtPeriodEnd ? <p className="mt-4 rounded-xl border border-[oklch(0.8_0.14_80/0.4)] bg-[oklch(0.8_0.14_80/0.1)] p-3 text-sm">Your plan ends on {periodEnd}. You can resubscribe any time.</p> : null}
          {subscribed || user?.stripeSubscriptionId ? (
            <button type="button" onClick={() => void post("portal", "/api/stripe/portal", {})} disabled={busy === "portal"} className="spell-chip mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium">
              {busy === "portal" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ExternalLink aria-hidden className="size-4" />}
              Manage subscription
            </button>
          ) : null}
        </section>

        <section className={panel} aria-labelledby="usage-h">
          <h2 id="usage-h" className="font-display flex items-center gap-2 text-xl font-medium"><Clock aria-hidden className="size-5 text-[var(--studio-gold)]" />Videos</h2>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-5xl font-medium tabular-nums">{remaining}</span>
            <span className="text-muted-foreground">video{remaining === 1 ? "" : "s"} left · up to 60s each</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[oklch(1_0_0/0.08)]" role="img" aria-label={`${user?.minutesUsed ?? 0} of ${user?.minutesLimit ?? 0} minutes used`}>
            <div className="h-full bg-[var(--studio-gold)]" style={{ width: `${used}%` }} />
          </div>
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">{user?.minutesUsed ?? 0} of {user?.minutesLimit ?? 0} used · {user?.bonusMinutes ?? 0} extra from packs (never expire)</p>
        </section>
      </div>

      {subscribed ? (
        <section className={panel} aria-labelledby="topup-h">
          <h2 id="topup-h" className="font-display flex items-center gap-2 text-xl font-medium"><Plus aria-hidden className="size-5 text-[var(--studio-gold)]" />Top up videos</h2>
          <p className="mt-1 text-sm text-muted-foreground">${CREDIT_PRICE_PER_MINUTE_USD} per video (up to 60s). Extra videos never expire.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Minutes to buy">
            {PACKS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutesToBuy === m} onClick={() => setMinutesToBuy(m)} className="spell-chip h-11 rounded-xl px-4 text-sm tabular-nums">
                {m} video{m === 1 ? "" : "s"} · ${m * CREDIT_PRICE_PER_MINUTE_USD}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <button type="button" aria-label="One fewer minute" onClick={() => setMinutesToBuy((n) => Math.max(1, n - 1))} className="spell-chip flex size-11 items-center justify-center rounded-xl"><Minus aria-hidden className="size-4" /></button>
              <span className="w-12 text-center tabular-nums" aria-live="polite">{minutesToBuy}</span>
              <button type="button" aria-label="One more minute" onClick={() => setMinutesToBuy((n) => Math.min(100, n + 1))} className="spell-chip flex size-11 items-center justify-center rounded-xl"><Plus aria-hidden className="size-4" /></button>
            </div>
          </div>
          <button type="button" onClick={() => void post("credits", "/api/stripe/credits", { minutes: minutesToBuy })} disabled={busy === "credits"} className="spellbar__cta mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 font-semibold disabled:opacity-70">
            {busy === "credits" ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
            Buy {minutesToBuy} video{minutesToBuy === 1 ? "" : "s"} · ${minutesToBuy * CREDIT_PRICE_PER_MINUTE_USD}
          </button>
        </section>
      ) : (
        <section aria-labelledby="plans-h" className="space-y-6">
          <div className={`${panel} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <h2 id="plans-h" className="font-display text-2xl font-medium">Testimonials every month: Ozzy Scale and Agency</h2>
              <p className="mt-1 text-sm text-muted-foreground">Scale includes 1 testimonial video a month, Agency 3, plus Ozzy credits for Ad Packs and Ozzy Studio. Plan testimonials don&apos;t roll over.</p>
            </div>
            <Link href="/ads/billing" className="spellbar__cta inline-flex h-11 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-semibold">See Ozzy plans</Link>
          </div>
          {!showOffer ? (
            <div className={`${panel} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
              <div>
                <h3 className="font-display text-xl font-medium">Not ready for monthly?</h3>
                <p className="mt-1 text-sm text-muted-foreground">{VIDEO_PACK_OFFER.name}: {videosLabel(VIDEO_PACK_OFFER.minutes)}, up to 60s each, {formatUsd(VIDEO_PACK_OFFER.priceCents)} once.</p>
              </div>
              <button type="button" onClick={() => void post("pack", "/api/stripe/credits", { offer: VIDEO_PACK_OFFER.key })} disabled={busy === "pack"} className="spell-chip inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium">
                {busy === "pack" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}Get the pack
              </button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <BillingContent />
    </Suspense>
  );
}
