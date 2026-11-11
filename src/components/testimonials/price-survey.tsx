"use client";

import { useEffect, useId, useState } from "react";
import { Loader2, X } from "lucide-react";
import { parseSurveyAnswers, PRICE_SURVEY_QUESTIONS, PRICE_SURVEY_STORAGE_KEY, PRICE_SURVEY_SUBJECT, type PriceSurveyAnswers, type PriceSurveyPlacement } from "@/lib/price-survey";

function alreadyShown(): boolean {
  try {
    return window.localStorage.getItem(PRICE_SURVEY_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}

function markShown(v: string): void {
  try {
    window.localStorage.setItem(PRICE_SURVEY_STORAGE_KEY, v);
  } catch {
    // ignore
  }
}

/**
 * 4-question Van Westendorp survey, shown once per browser (server dedupes too).
 * trigger "visitor": after 20 s or exit intent; "now": as soon as it mounts (e.g. first video ready).
 */
export function PriceSurvey({ placement, trigger }: { placement: PriceSurveyPlacement; trigger: "visitor" | "now" }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<keyof PriceSurveyAnswers, string>>({ tooExpensive: "", expensive: "", bargain: "", tooCheap: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (alreadyShown()) return;
    const show = () => {
      if (alreadyShown()) return;
      markShown("shown");
      setOpen(true);
    };
    if (trigger === "now") {
      const t = setTimeout(show, 1500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(show, 20_000);
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget) show();
    };
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (fine) document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      clearTimeout(t);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [trigger]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseSurveyAnswers(values);
    if (!parsed.ok) {
      setError(parsed.error.startsWith("Invalid") ? "Please answer all four with a dollar amount." : parsed.error);
      return;
    }
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/testimonials/price-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: parsed.value, placement }),
      });
      if (!res.ok) throw new Error();
      markShown("answered");
      setState("done");
    } catch {
      setError("Couldn't send that. Try again?");
      setState("idle");
    }
  }

  return (
    <div role="dialog" aria-labelledby={`${ids}-t`} className="fixed inset-x-3 bottom-3 z-50 max-h-[85dvh] overflow-y-auto rounded-2xl border border-border bg-[linear-gradient(180deg,oklch(0.24_0.08_295/.98),oklch(0.17_0.07_292/.98))] p-5 shadow-[0_30px_80px_-20px_#000e] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[400px]">
      <button type="button" onClick={() => setOpen(false)} aria-label="Close survey" className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
        <X aria-hidden className="size-4" />
      </button>
      {state === "done" ? (
        <div className="pr-8" role="status">
          <h2 id={`${ids}-t`} className="font-display text-xl font-medium">Thank you!</h2>
          <p className="mt-1 text-sm text-muted-foreground">That helps us price this fairly.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--studio-gold)]">4 quick questions</p>
          <h2 id={`${ids}-t`} className="font-display mt-1 pr-8 text-xl font-medium">What would you pay for {PRICE_SURVEY_SUBJECT}?</h2>
          <div className="mt-4 space-y-3">
            {PRICE_SURVEY_QUESTIONS.map((q) => (
              <label key={q.key} className="block text-sm">
                <span className="block text-foreground/90">{q.label}</span>
                <span className="mt-1 flex items-center gap-2">
                  <span aria-hidden className="text-muted-foreground">$</span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={values[q.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value.replace(/[^0-9]/g, "") }))}
                    className="h-10 w-full rounded-lg border border-border bg-[oklch(0.12_0.05_290/0.6)] px-3 tabular-nums focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">/month</span>
                </span>
              </label>
            ))}
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-[oklch(0.86_0.1_25)]">{error}</p> : null}
          <button type="submit" disabled={state === "sending"} className="spellbar__cta mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold disabled:opacity-70">
            {state === "sending" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}Send answers
          </button>
        </form>
      )}
    </div>
  );
}
