import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Review", "Presenter", "Film"] as const;

/** Step indicator for the create flow (1-based `current`). */
export function CreateSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Steps">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                active && "border-transparent bg-[var(--studio-gold)] text-[#2a0f10]",
                done && "border-[var(--studio-gold)] text-[var(--studio-gold)]",
                !active && !done && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check aria-hidden className="size-3.5" /> : n}
            </span>
            <span className={cn(active ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
            {n < STEPS.length ? <span aria-hidden className="h-px flex-1 bg-border" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Kicker + Fraunces title used at the top of each create step. */
export function StepTitle({ kicker, title, children }: { kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--studio-gold)]">{kicker}</p>
      <h1 className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">{title}</h1>
      {children ? <p className="max-w-2xl text-muted-foreground">{children}</p> : null}
    </div>
  );
}
