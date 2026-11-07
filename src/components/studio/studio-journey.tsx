"use client";

import { useEffect, useRef, useState } from "react";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import type { OzzyExpression, OzzyForm, OzzyMotion } from "@/components/ozzy/types";
import { cn } from "@/lib/utils";

const STEPS: { n: string; title: string; text: string; form: OzzyForm; expression: OzzyExpression; motion: OzzyMotion }[] = [
  { n: "01", title: "Paste your website", text: "Ozzy reads it like a strategist: who you sell to, your offer, the pains your customers describe and your brand kit", form: "explorer", expression: "focused", motion: "scan" },
  { n: "02", title: "Check his notes", text: "You get 30 seconds to see exactly what he found. Fix anything that's off, or send him back for another look", form: "classic", expression: "focused", motion: "nod" },
  { n: "03", title: "Get export-ready ads", text: "10 on-brand static ads and an animated ad, each on a different angle. Your first ad lands in under 3 minutes", form: "creator", expression: "focused", motion: "type" },
];
const DWELL_MS = 3800;

/** How it works: one Ozzy walks the trail, changing outfit at each stop. Auto-advances only while visible; click a step to jump. */
export function StudioJourney() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % STEPS.length), DWELL_MS);
    return () => window.clearTimeout(t);
  }, [active, visible, paused]);

  const step = STEPS[active];
  return (
    <section ref={ref} className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32" aria-labelledby="journey-title" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div className="max-w-2xl space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--studio-gold)]">How it works</p>
        <h2 id="journey-title" className="font-display text-4xl font-medium tracking-[-0.02em] sm:text-6xl">From a link to a launch in three moves</h2>
      </div>

      <div className="relative mt-14 md:mt-20">
        {/* The trail Ozzy walks along (desktop) */}
        <div className="relative hidden h-36 md:block" aria-hidden>
          <div className="absolute inset-x-[16.66%] bottom-3 border-t-2 border-dashed border-[oklch(0.88_0.08_70/28%)]" />
          <div className="absolute bottom-3 left-[16.66%] h-0.5 bg-[var(--studio-gold)] transition-[width] duration-700 ease-[var(--ease-expo)]" style={{ width: `${(active / (STEPS.length - 1)) * 66.66}%` }} />
          <div className="journey-walker absolute bottom-0 -translate-x-1/2 transition-[left] duration-700 ease-[var(--ease-expo)]" style={{ left: `${16.66 + active * 33.33}%` }}>
            <OzzyLazy size={128} perch="ground" speech={false} pose={{ form: step.form, expression: step.expression, motion: step.motion }} />
          </div>
        </div>

        <ol className="grid gap-4 md:grid-cols-3 md:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-current={i === active ? "step" : undefined}
                className={cn(
                  "group flex h-full w-full flex-col rounded-2xl border p-6 text-left transition-all duration-300 md:items-center md:text-center",
                  i === active ? "border-[oklch(0.84_0.14_78/55%)] bg-[oklch(0.22_0.075_295/0.75)] shadow-[0_0_50px_-18px_#ffcf4a66]" : "border-border bg-[oklch(0.2_0.07_295/0.35)] opacity-75 hover:opacity-100",
                )}
              >
                <div className="flex items-center gap-4 md:flex-col md:gap-3">
                  <span className={cn("flex size-11 shrink-0 items-center justify-center font-mono text-sm font-semibold pixel-frame transition-colors", i === active ? "bg-[var(--studio-gold)] text-[#2a0f10]" : "bg-[#1a0f30] text-[var(--studio-gold)]")}>{s.n}</span>
                  <h3 className="font-display text-2xl font-medium tracking-[-0.01em] sm:text-[1.7rem]">{s.title}</h3>
                </div>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-[17px]">{s.text}</p>
              </button>
            </li>
          ))}
        </ol>

        {/* Mobile: Ozzy sits beside the active step */}
        <div className="pointer-events-none absolute -top-[96px] right-2 md:hidden" aria-hidden>
          <OzzyLazy size={96} perch="ground" speech={false} pose={{ form: step.form, expression: step.expression, motion: step.motion }} />
        </div>
      </div>
    </section>
  );
}
