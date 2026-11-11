"use client";

import { Check, Loader2, ShieldCheck } from "lucide-react";
import { FIRST_VIDEO_OFFER, formatUsd, GUARANTEE, perVideoUsd, UGC_CREATOR_RATE_USD, VIDEO_MAX_SECONDS, videosLabel } from "@/lib/first-video-offer";
import { cn } from "@/lib/utils";

/** The one-time Launch Kit (attraction offer): the primary first-visit purchase. All numbers come from config. */
export function FirstVideoOfferCard({
  onClaim,
  loading = false,
  ctaLabel = `Get my ${FIRST_VIDEO_OFFER.name}`,
  className,
}: {
  onClaim: () => void;
  loading?: boolean;
  ctaLabel?: string;
  className?: string;
}) {
  const videos = FIRST_VIDEO_OFFER.minutes;
  return (
    <div className={cn("pixel-frame relative bg-[linear-gradient(160deg,#3a2266,#1c0f36_70%,#2a1020)] p-6 shadow-[0_0_70px_-24px_#ffcf4a99] sm:p-7", className)}>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--studio-gold)]">New here · one time, no subscription</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-display text-3xl font-medium">{FIRST_VIDEO_OFFER.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{videosLabel(videos)} from your real reviews, up to {VIDEO_MAX_SECONDS}s each.</p>
        </div>
        <div className="text-right">
          <p className="flex items-baseline justify-end gap-1">
            <span className="font-display text-5xl font-medium tabular-nums">{formatUsd(FIRST_VIDEO_OFFER.priceCents)}</span>
            <span className="text-sm text-muted-foreground">once</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {perVideoUsd(FIRST_VIDEO_OFFER.priceCents, videos)} a video · creators typically charge ${UGC_CREATOR_RATE_USD.low}–{UGC_CREATOR_RATE_USD.high}
          </p>
        </div>
      </div>
      <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
        {[`${videosLabel(videos)}, each read by a realistic AI presenter`, ...FIRST_VIDEO_OFFER.bonuses].map((t) => (
          <li key={t} className="flex items-start gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" />{t}</li>
        ))}
      </ul>
      <button type="button" onClick={onClaim} disabled={loading} className="spellbar__cta mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-6 py-2 text-base font-semibold disabled:opacity-70 sm:w-auto">
        {loading ? (<><Loader2 aria-hidden className="mr-2 size-5 animate-spin" />Opening secure checkout…</>) : `${ctaLabel}: ${formatUsd(FIRST_VIDEO_OFFER.priceCents)}`}
      </button>
      <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck aria-hidden className="mt-px size-4 shrink-0 text-[var(--studio-gold)]" />{GUARANTEE} Secure payment by Stripe.</p>
    </div>
  );
}
