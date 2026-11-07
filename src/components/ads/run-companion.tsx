"use client";

import { Check } from "lucide-react";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { STAGE_RAIL, runStage } from "@/lib/ads/run-stage";
import type { RunView } from "@/lib/ads/run-types";
import { cn } from "@/lib/utils";

const STAGE_COPY: Record<string, (d: string, ready: number, total: number) => string> = {
  reading: (d) => `Ozzy is reading ${d}`,
  review: () => "Ozzy's notes are ready for you",
  building: (_d, ready, total) => (total ? `${ready} of ${total} ads ready` : "Ozzy is planning your ads"),
  done: () => "All your ads are ready",
  partial: (_d, ready, total) => `${ready} of ${total} ads made it`,
  failed: () => "This run didn't finish",
};

/** Ozzy perched beside a four-step rail. Every value comes from the run itself. */
export function RunCompanion({ run, domain }: { run: RunView; domain: string }) {
  const s = runStage(run);
  const pct = s.total ? Math.round((s.ready / s.total) * 100) : 0;
  return (
    <div className="relative flex items-end gap-4">
      <div className="shrink-0 sm:hidden"><OzzyLazy size={72} perch="ledge" speech={false} /></div>
      <div className="hidden shrink-0 sm:block"><OzzyLazy size={112} perch="ledge" interactive speech={false} label="Ozzy. Click to say hi." /></div>
      <div className="min-w-0 flex-1 space-y-3 pb-1">
        <p className="font-[family-name:var(--font-fraunces)] text-lg leading-tight" aria-live="polite">{STAGE_COPY[s.stage](domain, s.ready, s.total)}</p>
        <ol className="flex items-center gap-1.5" aria-label="Progress">
          {STAGE_RAIL.map((label, i) => {
            const done = i < s.rail || (i === 3 && (s.stage === "done" || s.stage === "partial"));
            const active = i === s.rail && !done;
            return (
              <li key={label} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={active ? "step" : undefined}>
                <span className={cn("relative h-1.5 overflow-hidden bg-white/10", done && "bg-[var(--studio-gold)]")}>
                  {active && i === 2 && s.total > 0 && <span className="absolute inset-y-0 left-0 bg-[var(--studio-gold)] transition-[width] duration-500" style={{ width: `${pct}%` }} />}
                  {active && !(i === 2 && s.total > 0) && <span className="studio-shimmer absolute inset-0" />}
                </span>
                <span className={cn("flex items-center gap-1 truncate text-[11px]", done || active ? "text-foreground" : "text-muted-foreground")}>
                  {done && <Check className="size-3 text-[var(--studio-gold)]" />}{label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
