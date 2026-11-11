"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Paperclip } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/ozzy/use-reduced-motion";

// A static replay of one real Studio turn, built from the real StudioEvent types
// (user message -> status -> text_delta -> tool -> progress -> render). Example only: no live data.
const USER = "Make a 15-second hype ad for my coffee shop. Fast cuts, warm colours. Here's my site: brewandbean.co";
const REPLY = "G'day! Love it. I'll pull your colours and menu from the site, then cut five quick scenes with bold captions and a punchy beat.";
const TOOLS = ["Looking at your website", "Picking colours and fonts", "Building scene 1 of 5", "Building scene 5 of 5"] as const;

/** Beats of the loop (one tick = 450ms). */
const TOOLS_START = 5 + Math.ceil(REPLY.length / 6);
const RENDER = TOOLS_START + TOOLS.length * 3 + 6;
const BEATS = { user: 1, status: 3, replyStart: 5, toolsStart: TOOLS_START, render: RENDER, end: RENDER + 14 } as const;

export function ChatDemo() {
  const still = usePrefersReducedMotion();
  const [tick, setTick] = useState(BEATS.end - 1);

  useEffect(() => {
    if (still) return;
    const t = window.setInterval(() => setTick((n) => (n + 1) % BEATS.end), 450);
    return () => window.clearInterval(t);
  }, [still]);

  const t = still ? BEATS.end - 1 : tick;
  const replyChars = Math.min(REPLY.length, Math.max(0, (t - BEATS.replyStart) * 6));
  const toolsShown = Math.min(TOOLS.length, Math.max(0, Math.floor((t - BEATS.toolsStart) / 3) + 1));
  const rendering = t >= BEATS.toolsStart + TOOLS.length * 3 && t < BEATS.render;
  const pct = rendering ? Math.min(100, Math.round(((t - BEATS.toolsStart - TOOLS.length * 3) / 6) * 100)) : 0;

  return (
    <div className="pixel-frame bg-[oklch(0.16_0.05_290)] p-4 sm:p-5" aria-label="Example Ozzy Studio chat" role="img">
      <div className="flex h-[26rem] flex-col gap-3 overflow-hidden text-sm" aria-hidden>
        {t >= BEATS.user ? (
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[oklch(0.32_0.12_295)] px-4 py-2.5 text-foreground">
            {USER}
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="size-3" /> logo.png</p>
          </div>
        ) : null}
        {t >= BEATS.status ? (
          <div className="max-w-[90%] space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">
              Ozzy · {t >= BEATS.render ? "done" : rendering ? "rendering" : t >= BEATS.toolsStart ? "building" : "thinking"}
            </p>
            {replyChars > 0 ? (
              <p className="font-display text-base leading-snug text-foreground">
                {REPLY.slice(0, replyChars)}
                {replyChars < REPLY.length ? <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-[var(--studio-gold)]" /> : null}
              </p>
            ) : (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
            {t >= BEATS.toolsStart ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {TOOLS.slice(0, toolsShown).map((label, i) => (
                  <li key={label} className="flex items-center gap-2">
                    {i < toolsShown - 1 || rendering || t >= BEATS.render ? <Check className="size-3.5 text-[var(--studio-gold)]" /> : <Loader2 className="size-3.5 animate-spin" />}
                    {label}
                  </li>
                ))}
              </ul>
            ) : null}
            {rendering ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Rendering video · {pct}%</p>
                <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[oklch(0.3_0.05_290)]"><div className="h-full bg-[var(--studio-gold)]" style={{ width: `${pct}%` }} /></div>
              </div>
            ) : null}
            {t >= BEATS.render ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-[oklch(0.2_0.06_290)] p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/studio-examples/ad08.jpg" alt="" width={54} height={96} className="h-24 w-[54px] rounded-lg object-cover" />
                <div className="text-xs">
                  <p className="font-medium text-foreground">Your video · v1</p>
                  <p className="text-muted-foreground">15s · 9:16 · ready to download</p>
                  <p className="mt-1 text-[var(--studio-gold)]">Free video used</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
