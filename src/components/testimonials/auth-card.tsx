"use client";

import { AlertCircle } from "lucide-react";
import { OzzyPerch, type OzzyMood } from "./ozzy-perch";

/** Studio auth card: night glass with stepped corners; Ozzy perches on the top edge, clear of the fields. */
export function AuthCard({ title, description, mood, error, children, aside }: { title: string; description: React.ReactNode; mood: OzzyMood; error?: string | null; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-24">
      <div className="relative">
        <OzzyPerch mood={mood} size={84} className="absolute -top-[78px] left-4 z-10" />
        <div className="pixel-frame studio-rise bg-[linear-gradient(180deg,oklch(0.24_0.08_295/.94),oklch(0.17_0.07_292/.94))] p-6 sm:p-8">
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">{title}</h1>
          <div className="mt-2 text-sm text-muted-foreground">{description}</div>
          {error ? (
            <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-[oklch(0.7_0.17_25/0.5)] bg-[oklch(0.7_0.17_25/0.12)] p-3 text-sm text-[oklch(0.86_0.1_25)]">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
      {aside ? <div className="mt-6">{aside}</div> : null}
    </div>
  );
}

export function AuthField({ id, label, hint, ...input }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <input
        id={id}
        {...input}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-12 w-full rounded-xl border border-input bg-[oklch(0.12_0.05_290/0.7)] px-3 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-60"
      />
      {hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
