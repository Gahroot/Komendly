"use client";
/* eslint-disable @next/next/no-img-element -- token-checked streamed ad images */

import { useEffect, useState } from "react";
import type { GiftAdView } from "@/lib/ads/gifts";

type Live = { status: string; encore: string; expected: number; ads: GiftAdView[] };

const POLL_MS = 5000;
const MAX_POLL_MS = 8 * 60_000;
const TILTS = ["-1.5deg", "1deg", "-0.5deg"];

function isDrawing(l: Live, outbound: boolean): boolean {
  if (l.status !== "ready" && l.status !== "failed") return true;
  // Outbound: the encore starts a moment after the page opens (view beacon), then runs ~1-3 minutes.
  return outbound && (l.encore === "none" || l.encore === "drawing");
}

/** The gift's ad grid. While Ozzy is still drawing it polls the status endpoint and drops new ads in as they land. */
export function GiftSlots({ token, initial, outbound }: { token: string; initial: Live; outbound: boolean }) {
  const [live, setLive] = useState(initial);
  const drawing = isDrawing(live, outbound);
  useEffect(() => {
    if (!drawing) return;
    const started = Date.now();
    let stop = false;
    const t = setInterval(() => {
      if (stop || Date.now() - started > MAX_POLL_MS) return clearInterval(t);
      void fetch(`/api/ads/gift-public/${token}/status`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Live>) : null))
        .then((next) => {
          if (next && !stop) setLive(next);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [drawing, token]);
  const count = Math.max(live.expected, live.ads.length);
  const slots = Array.from({ length: count }, (_, i) => live.ads[i] ?? null);
  return (
    <>
      <div className={count === 1 ? "mx-auto mt-10 grid max-w-md gap-4" : "mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5"}>
        {slots.map((ad, i) => (
          // Mobile: the hook ad full width, the extras side by side under it (keeps the offer near the top).
          <div key={ad?.id ?? `slot-${i}`} className={`studio-frame studio-rise overflow-hidden rounded-2xl p-1.5 sm:p-2 ${count === 3 && i === 0 ? "col-span-2 sm:col-span-1" : ""}`} style={{ ["--tilt" as string]: TILTS[i % 3] }}>
            {ad ? (
              <img src={ad.imageUrl} alt={ad.headline} width={ad.width} height={ad.height} className="h-auto w-full rounded-xl" />
            ) : (
              <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-xl bg-white/[0.04] px-4 text-center text-sm text-muted-foreground">
                {drawing ? (
                  <>
                    <span className="inline-flex gap-1" aria-hidden>
                      {[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-pulse rounded-full bg-[var(--studio-gold)]" style={{ animationDelay: `${d * 180}ms` }} />)}
                    </span>
                    <span className="text-xs sm:text-sm">{outbound && i > 0 ? "Ozzy is drawing you another one…" : "Ozzy is still drawing…"}</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {live.ads.length > 0 && <p className="mt-3 text-center text-xs text-muted-foreground">{drawing && outbound ? "Ozzy is drawing two more for you right now. Stick around a minute." : "Long-press or right-click to save. They're yours to run."}</p>}
    </>
  );
}
