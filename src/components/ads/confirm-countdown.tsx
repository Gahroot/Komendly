"use client";

import { Pause } from "lucide-react";
import { CONFIRM_WINDOW_SECONDS } from "@/lib/ads/contracts";

const R = 22;
const C = 2 * Math.PI * R;

/** Ring countdown for the confirm window; pauses while the user edits. */
export function ConfirmCountdown({ seconds, paused }: { seconds: number | null; paused: boolean }) {
  const s = Math.min(CONFIRM_WINDOW_SECONDS, Math.max(0, seconds ?? CONFIRM_WINDOW_SECONDS));
  const pct = s / CONFIRM_WINDOW_SECONDS;
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="relative size-14 shrink-0">
        <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
          <circle cx="28" cy="28" r={R} fill="none" strokeWidth="4" className="stroke-muted" />
          <circle cx="28" cy="28" r={R} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} className={paused ? "stroke-muted-foreground" : "stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold tabular-nums">
          {paused ? <Pause className="size-4 text-muted-foreground" /> : `${s}s`}
        </span>
      </div>
      <div className="text-sm">
        <p className="font-medium">{paused ? "Paused while you edit" : `Starting in ${s} seconds`}</p>
        <p className="text-xs text-muted-foreground">{paused ? "We'll wait until you're done." : "Edit anything below to pause the timer."}</p>
      </div>
    </div>
  );
}
