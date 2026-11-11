"use client";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ADS_PLANS, ADS_TOPUPS, getPlan, LAUNCH_QUARTER, LAUNCH_QUARTER_GUARANTEE } from "@/lib/ads/billing-config";
import { LQ_STUDIO_LINE } from "@/lib/studio/bridge";
import { STUDIO_LAUNCH_OFFER } from "@/lib/hub/money-model";
import type { StudioAccountView } from "@/lib/studio/thread";
import { startCheckout } from "./api";

function useCountdown(endsAt: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return null;
  const left = Math.max(0, new Date(endsAt).getTime() - now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function CheckoutButton({ body, label, primary }: { body: Record<string, unknown>; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const err = await startCheckout(body);
        if (err) {
          toast.error(err);
          setBusy(false);
        }
      }}
      className={primary ? "spellbar__cta inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold" : "studio-chip h-10 w-full justify-center"}
    >
      {busy && <Loader2 className="size-4 animate-spin" />} {label}
    </button>
  );
}

/** The trial's Launch Quarter, shown in Studio INSTEAD of the Studio launch offer while its window is open (one offer at a time). */
export function LaunchQuarterStudioCard({ endsAt, placement }: { endsAt: string | null; placement: string }) {
  const left = useCountdown(endsAt);
  const plan = getPlan(LAUNCH_QUARTER.plan);
  const lines = [
    LQ_STUDIO_LINE,
    `${LAUNCH_QUARTER.creditsPerPeriod} credits every ${LAUNCH_QUARTER.intervalMonths} months (+${LAUNCH_QUARTER.firstPeriodBonus} bonus on your first payment), for ads and videos`,
    "Edit your own footage up to 90 seconds",
    LAUNCH_QUARTER_GUARANTEE,
  ];
  return (
    <section className="studio-rise pixel-frame relative overflow-hidden bg-[linear-gradient(160deg,oklch(0.3_0.12_295),oklch(0.22_0.09_300)_60%,oklch(0.3_0.1_40))] p-5" aria-label={LAUNCH_QUARTER.name}>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--studio-gold)]">{LAUNCH_QUARTER.name}{left ? <> · launch price ends in <span className="tabular-nums">{left}</span></> : null}</p>
      <h3 className="mt-2 font-display text-2xl text-[oklch(0.97_0.03_80)]">Your trial offer includes Ozzy Studio</h3>
      <p className="mt-1 text-sm text-[oklch(0.86_0.03_80)]">
        ${(LAUNCH_QUARTER.priceCents / 100).toFixed(0)} every 3 months · {plan?.name ?? "Starter"} features · cancel anytime
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-[oklch(0.93_0.03_80)]">
        {lines.map((s) => (
          <li key={s} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" aria-hidden />{s}</li>
        ))}
      </ul>
      <div className="mt-4 max-w-xs">
        <CheckoutButton primary label="Get the Launch Quarter" body={{ kind: "offer", key: LAUNCH_QUARTER.key, placement }} />
      </div>
    </section>
  );
}

/** Ozzy's 72h Studio launch offer (server-truth window from AdsWorkspace.studioOfferReadyAt). */
export function LaunchOfferCard({ account, placement }: { account: StudioAccountView; placement: string }) {
  const left = useCountdown(account.offer.endsAt);
  const growth = ADS_PLANS.find((p) => p.key === STUDIO_LAUNCH_OFFER.plan);
  if (account.launchQuarter?.open) return <LaunchQuarterStudioCard endsAt={account.launchQuarter.endsAt} placement={placement} />;
  if (!account.offer.open || !growth) return null;
  return (
    <section className="studio-rise pixel-frame relative overflow-hidden bg-[linear-gradient(160deg,oklch(0.3_0.12_295),oklch(0.22_0.09_300)_60%,oklch(0.3_0.1_40))] p-5" aria-label={STUDIO_LAUNCH_OFFER.name}>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--studio-gold)]">{STUDIO_LAUNCH_OFFER.name} · ends in <span className="tabular-nums">{left}</span></p>
      <h3 className="mt-2 font-display text-2xl text-[oklch(0.97_0.03_80)]">{STUDIO_LAUNCH_OFFER.headline}</h3>
      <p className="mt-1 text-sm text-[oklch(0.86_0.03_80)]">
        {growth.name} · ${(growth.priceCents / 100).toFixed(0)}/month · +{STUDIO_LAUNCH_OFFER.bonusCredits} bonus credits now
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-[oklch(0.93_0.03_80)]">
        {STUDIO_LAUNCH_OFFER.stack.map((s) => (
          <li key={s} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" aria-hidden />{s}</li>
        ))}
      </ul>
      <div className="mt-4 max-w-xs">
        <CheckoutButton primary label="Keep Ozzy on my team" body={{ kind: "plan", key: STUDIO_LAUNCH_OFFER.plan, offer: STUDIO_LAUNCH_OFFER.key, placement }} />
      </div>
    </section>
  );
}

/** 402 paywall: the launch offer if its window is open, else plans (Scale anchor, Growth recommended, Starter) + a top-up. */
export function PaywallCard({ account, neededCredits, onClose }: { account: StudioAccountView; neededCredits: number; onClose: () => void }) {
  if (account.offer.open || account.launchQuarter?.open) {
    return (
      <div className="space-y-2">
        <LaunchOfferCard account={account} placement="studio_paywall" />
        <button type="button" onClick={onClose} className="text-xs text-[oklch(0.8_0.03_290)] underline underline-offset-4">Not now</button>
      </div>
    );
  }
  const order = ["scale", "growth", "starter"] as const;
  const plans = order.map((k) => ADS_PLANS.find((p) => p.key === k)).filter((p): p is (typeof ADS_PLANS)[number] => Boolean(p));
  const topup = ADS_TOPUPS.find((t) => t.key === "topup_10");
  return (
    <section className="studio-rise rounded-2xl border border-white/12 bg-[oklch(0.18_0.07_295/0.92)] p-4 sm:p-5" aria-label="Get credits">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl text-[oklch(0.97_0.03_80)]">This one needs {neededCredits} credit{neededCredits === 1 ? "" : "s"}</h3>
          <p className="mt-1 text-sm text-[oklch(0.84_0.03_80)]">
            You have {account.balance} credit{account.balance === 1 ? "" : "s"}. A new video is 5 credits (8 over 30s); 3 revisions are included.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-[oklch(0.8_0.03_290)] underline underline-offset-4">Close</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {plans.map((p) => {
          const rec = p.key === "growth";
          return (
            <div key={p.key} className={`relative flex flex-col rounded-xl border p-3 ${rec ? "border-[var(--studio-gold)] bg-[oklch(0.25_0.09_295/0.9)]" : "border-white/10 bg-black/20"}`}>
              {rec && <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 rounded-full bg-[var(--studio-gold)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#2a0f10]"><Sparkles className="size-3" />Recommended</span>}
              <p className="text-sm font-semibold text-[oklch(0.97_0.03_80)]">{p.name}</p>
              <p className="font-display text-2xl text-[oklch(0.97_0.03_80)]">${(p.priceCents / 100).toFixed(0)}<span className="text-sm text-[oklch(0.8_0.03_290)]">/mo</span></p>
              <p className="mb-3 text-xs text-[oklch(0.84_0.03_80)]">{p.monthlyCredits} credits · about {Math.floor(p.monthlyCredits / 5)} videos · own footage up to 90s</p>
              <div className="mt-auto"><CheckoutButton primary={rec} label={`Choose ${p.name}`} body={{ kind: "plan", key: p.key, placement: "studio_paywall" }} /></div>
            </div>
          );
        })}
      </div>
      {topup && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-white/15 p-3 text-sm text-[oklch(0.88_0.03_80)]">
          <span>Just this once? {topup.name} for ${(topup.priceCents / 100).toFixed(0)}, never expire.</span>
          <div className="w-40"><CheckoutButton label="Top up" body={{ kind: "topup", key: topup.key, placement: "studio_paywall" }} /></div>
        </div>
      )}
    </section>
  );
}
