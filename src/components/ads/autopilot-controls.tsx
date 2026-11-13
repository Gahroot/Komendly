"use client";
// Inline controls for the Ozzy Autopilot card: ON/OFF switch + one-sentence focus (PATCH /api/ads/autopilot).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUTOPILOT_FOCUS_MAX } from "@/lib/ads/autopilot";

export function AutopilotControls({ enabled, focus }: { enabled: boolean; focus: string | null }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [text, setText] = useState(focus ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (body: { enabled?: boolean; focus?: string }) =>
    start(async () => {
      setError(null);
      setSaved(null);
      const res = await fetch("/api/ads/autopilot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { error?: string; enabled?: boolean } | null;
      if (!res?.ok) {
        setError(data?.error ?? "Couldn't save. Try again.");
        if ("enabled" in body) setOn(!body.enabled);
        return;
      }
      setSaved("enabled" in body ? (body.enabled ? "Autopilot is on" : "Autopilot is off") : "Saved for your next drop");
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Ozzy Autopilot"
          disabled={pending}
          onClick={() => {
            setOn(!on);
            save({ enabled: !on });
          }}
          className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${on ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`block size-5 rounded-full bg-background shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
        </button>
        <span className="text-sm font-medium">{on ? "ON" : "OFF"}</span>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          save({ focus: text });
        }}
      >
        <label htmlFor="autopilot-focus" className="sr-only">This week&apos;s focus</label>
        <Input id="autopilot-focus" value={text} maxLength={AUTOPILOT_FOCUS_MAX} onChange={(e) => setText(e.target.value)} placeholder="This week's focus, e.g. push the Black Friday sale" />
        <Button type="submit" variant="secondary" disabled={pending || text.trim() === (focus ?? "")}>Save focus</Button>
      </form>
      <p aria-live="polite" className="text-xs text-muted-foreground">{error ? <span className="text-destructive">{error}</span> : saved}</p>
    </div>
  );
}
