"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pricingSurveySchema, type PricingSurveyAnswers } from "@/lib/ads/pricing-survey-schema";

const STORAGE_KEY = "ads-pricing-survey";
type Key = keyof PricingSurveyAnswers;

const QUESTIONS: readonly { key: Key; label: string }[] = [
  { key: "tooCheap", label: "So cheap you'd doubt the quality" },
  { key: "cheap", label: "A bargain, great value" },
  { key: "expensive", label: "Getting expensive, but you'd still consider it" },
  { key: "tooExpensive", label: "Too expensive to consider" },
];

export function PricingSurvey() {
  const [state, setState] = useState<"hidden" | "open" | "thanks">("hidden");
  const [values, setValues] = useState<Record<Key, string>>({ tooCheap: "", cheap: "", expensive: "", tooExpensive: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setState(window.localStorage.getItem(STORAGE_KEY) ? "hidden" : "open"), 0);
    return () => clearTimeout(t);
  }, []);

  function close(mark: string) {
    window.localStorage.setItem(STORAGE_KEY, mark);
    setState("hidden");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (QUESTIONS.some((q) => values[q.key].trim() === "")) return setError("Please answer all four questions.");
    const parsed = pricingSurveySchema.safeParse({
      tooCheap: Number(values.tooCheap), cheap: Number(values.cheap), expensive: Number(values.expensive), tooExpensive: Number(values.tooExpensive),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Please check your answers.");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/ads/pricing-survey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (!res.ok) throw new Error("failed");
      window.localStorage.setItem(STORAGE_KEY, "submitted");
      setState("thanks");
    } catch {
      setError("Couldn't send your answers. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "hidden") return null;
  return (
    <Card>
      <CardHeader className="relative pr-12">
        <CardTitle>{state === "thanks" ? "Thank you!" : "Help us set fair prices"}</CardTitle>
        <CardDescription>
          {state === "thanks"
            ? "Your answers help us price plans fairly."
            : "Think of a monthly plan with ad generation like this that feels unlimited. At what monthly price (USD) would it be…"}
        </CardDescription>
        <Button type="button" variant="ghost" size="icon" aria-label="Dismiss survey" className="absolute right-4 top-0" onClick={() => close(state === "thanks" ? "submitted" : "dismissed")}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      {state === "open" && (
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              {QUESTIONS.map((q) => (
                <div key={q.key} className="space-y-1.5">
                  <Label htmlFor={`vw-${q.key}`}>{q.label}</Label>
                  <Input
                    id={`vw-${q.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="1"
                    placeholder="$ per month"
                    value={values[q.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send answers"}</Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
