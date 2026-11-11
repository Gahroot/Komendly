"use client";
// One-click "switch to an Ozzy plan" for grandfathered testimonial subscribers. Honest comparison: their old
// plan keeps its videos until it ends; the Ozzy plan adds credits for Ad Packs + Studio. Paying ends the old
// plan at its period end (ads billing webhook), so there is never a double charge for the same month.
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { ADS_PLANS, type AdsPlanKey } from "@/lib/ads/billing-config";
import { formatCents } from "@/lib/ads/billing-format";
import { planAppsSummary } from "@/lib/hub/money-model";

/** Closest Ozzy plan by price: legacy Starter ($197) -> Scale ($229); Pro / Enterprise -> Agency. */
export function legacySwitchTarget(legacyPlan: string): AdsPlanKey {
  return legacyPlan === "starter" ? "scale" : "agency";
}

export function LegacySwitchOffer({ legacyPlan, videosPerMonth }: { legacyPlan: string; videosPerMonth: number }) {
  const target = ADS_PLANS.find((p) => p.key === legacySwitchTarget(legacyPlan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!target) return null;

  async function go() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ads-billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "plan", key: target.key, switchFromLegacy: true, placement: "legacy_switch" }) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't open checkout.");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open checkout.");
      setBusy(false);
    }
  }

  const name = legacyPlan.charAt(0).toUpperCase() + legacyPlan.slice(1);
  return (
    <section aria-labelledby="legacy-switch-h" className="pixel-frame rounded-2xl border border-[var(--studio-gold)]/40 bg-[oklch(0.2_0.07_295/0.6)] p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">New: Ozzy plans</p>
      <h2 id="legacy-switch-h" className="font-display mt-2 text-2xl font-medium">Your {name} plan stays as it is. Want all three apps?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You&apos;re grandfathered: {videosPerMonth} testimonial video{videosPerMonth === 1 ? "" : "s"} a month at your current price, for as long as you keep it.
        {" "}Ozzy {target.name} is {formatCents(target.priceCents)}/month and includes:
      </p>
      <ul className="mt-3 space-y-1 text-sm">{planAppsSummary(target.key).map((l) => <li key={l}>· {l}</li>)}</ul>
      <p className="mt-3 text-xs text-muted-foreground">If you switch, your current plan ends at the end of the month you&apos;ve paid for, so you&apos;re never charged twice. Unused testimonial videos from your old plan stay usable until then.</p>
      <button type="button" onClick={() => void go()} disabled={busy} className="spellbar__cta mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-6 font-semibold disabled:opacity-70">
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ArrowRight aria-hidden className="size-4" />}Switch to Ozzy {target.name}
      </button>
      {error ? <p role="alert" className="mt-3 text-sm text-[oklch(0.86_0.1_25)]">{error}</p> : null}
    </section>
  );
}
