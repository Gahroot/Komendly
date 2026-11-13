"use client";
// Client buttons for the Ad Department bonus pages (re-run check-up, make an ad from a hook, print the plan).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

async function post(body: Record<string, unknown>): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/ads/bonuses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: typeof json.error === "string" ? json.error : "Something went wrong. Try again in a minute." };
    return { ok: true, json };
  } catch {
    return { ok: false, error: "Couldn't reach Komendly. Check your connection and try again." };
  }
}

export function RerunCheckupButton({ disabledUntil }: { disabledUntil: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (disabledUntil) return <p className="text-sm text-muted-foreground">You can ask Ozzy for a fresh check-up on {disabledUntil}.</p>;
  return (
    <div className="space-y-1 print:hidden">
      <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await post({ action: "rerun_checkup" });
        setBusy(false);
        setMsg(r.ok ? "Ozzy is checking your site again. This takes a few minutes." : r.error);
        if (r.ok) router.refresh();
      }}>{busy ? "Asking Ozzy…" : "Check my site again"}</Button>
      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
    </div>
  );
}

export function MakeAdButton({ hook }: { hook: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={async () => {
        setBusy(true);
        setErr(null);
        const r = await post({ action: "hook_run", hook });
        if (r.ok && typeof r.json.runId === "string") router.push(`/ads/runs/${r.json.runId}`);
        else {
          setBusy(false);
          setErr(r.ok ? "Something went wrong. Try again in a minute." : r.error);
        }
      }}>{busy ? "Starting…" : "Make an ad from this hook"}</Button>
      {err ? <span className="text-xs text-destructive">{err}</span> : null}
    </span>
  );
}

export function PrintButton() {
  return <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>Print or save as PDF</Button>;
}
