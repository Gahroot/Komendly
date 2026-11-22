"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { PublishGoal } from "@/lib/ads/meta/core/publish";
import { countryFromLocale, defaultPublishGoal, suggestedDailyBudget, toMinorUnits } from "@/lib/ads/meta/publish-options";
import type { MetaStatus } from "@/lib/ads/meta/status-types";
import { AccountCheckStep, currentReadiness } from "./meta-steps/account-check";
import { ConnectStep } from "./meta-steps/connect";
import { DoneStep } from "./meta-steps/done";
import { PickAdsStep } from "./meta-steps/pick-ads";
import { ReviewStep } from "./meta-steps/review";
import { TargetingStep } from "./meta-steps/targeting";
import { META_STEPS, STEP_LABELS, type MetaStep } from "./meta-steps/types";

/**
 * "Publish to Meta" for a completed run, as a short guided flow:
 * Connect -> Account check -> Pick ads -> Audience & budget -> Review -> Done.
 * Self-contained: fetches its own state; renders nothing when the meta_publish flag is off. Mount: <MetaPublishDialog runId={run.id} />
 */
export function MetaPublishDialog({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [step, setStep] = useState<MetaStep>("connect");
  const [selected, setSelected] = useState<string[]>([]);
  const [adAccountId, setAdAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [budgetTouched, setBudgetTouched] = useState(false);
  const [goal, setGoal] = useState<PublishGoal | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (withAccounts: boolean, signal?: AbortSignal) => {
    const res = await fetch(`/api/ads/meta/status?runId=${encodeURIComponent(runId)}${withAccounts ? "&accounts=1" : ""}`, { signal, cache: "no-store" });
    if (res.status === 404) { setHidden(true); return; }
    if (!res.ok) { setError("Couldn't load Meta publishing."); return; }
    const s = (await res.json()) as MetaStatus;
    // Polls without ?accounts=1 must not wipe the accounts list we already have.
    setStatus((prev) => (s.access === "ok" && !withAccounts && prev?.access === "ok" && s.connected ? { ...s, accounts: prev.accounts } : s));
    if (s.access === "ok") {
      if (s.selection) {
        setAdAccountId((v) => v || s.selection?.adAccountId || "");
        setPageId((v) => v || s.selection?.pageId || "");
      }
      setGoal((g) => g ?? defaultPublishGoal(s.goal));
    }
  }, [runId]);

  useEffect(() => {
    const ac = new AbortController();
    load(false, ac.signal).catch(() => undefined);
    setCountries((c) => (c.length ? c : [countryFromLocale(navigator.language)]));
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    load(true, ac.signal).catch(() => undefined);
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && (e.data as { type?: string })?.type === "komendly:meta") load(true).catch(() => undefined);
    };
    window.addEventListener("message", onMsg);
    return () => { ac.abort(); window.removeEventListener("message", onMsg); };
  }, [open, load]);

  const ok = status?.access === "ok" ? status : null;
  const connected = !!ok?.connected;

  // Opening, connecting or disconnecting moves between the connect and account steps.
  useEffect(() => {
    if (!open || !ok) return;
    if (!connected) setStep("connect");
    else setStep((s) => (s === "connect" ? "account" : s));
  }, [open, ok, connected]);

  const accounts = ok?.accounts && !("error" in ok.accounts) ? ok.accounts : null;
  const account = accounts?.adAccounts.find((a) => a.id === adAccountId) ?? null;
  const currency = account?.currency ?? "USD";

  useEffect(() => {
    if (budgetTouched || !account) return;
    const s = suggestedDailyBudget(account.currency);
    setBudget(s === null ? "" : String(s));
  }, [account, budgetTouched]);

  const pending = !!ok?.ads.some((a) => a.publishes.some((p) => p.status === "pending")) || !!ok?.campaigns.some((c) => c.activation === "activating");
  useEffect(() => {
    if (!open || !pending) return;
    const t = setInterval(() => { load(false).catch(() => undefined); }, 4000);
    return () => clearInterval(t);
  }, [open, pending, load]);

  // Funnel analytics: which step people reach, and which account problems stop them.
  const track = useCallback((event: { name: "meta_step_viewed"; step: string } | { name: "meta_readiness_issue"; code: string }) => {
    fetch("/api/ads/meta/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, ...event }), keepalive: true })
      .catch(() => undefined);
  }, [runId]);
  const hasOk = !!ok;
  useEffect(() => {
    if (open && hasOk) track({ name: "meta_step_viewed", step });
  }, [open, step, hasOk, track]);
  const reported = useRef(new Set<string>());
  const shownIssues = open && step === "account" && ok ? currentReadiness(ok, adAccountId)?.issues ?? [] : [];
  const issueKey = shownIssues.map((i) => i.code).join(",");
  useEffect(() => {
    for (const code of issueKey ? issueKey.split(",") : []) {
      const k = `${adAccountId}:${code}`;
      if (reported.current.has(k)) continue;
      reported.current.add(k);
      track({ name: "meta_readiness_issue", code });
    }
  }, [issueKey, adAccountId, track]);

  if (hidden) return null;

  const connect = () => window.open("/api/ads/meta/connect", "komendly-meta", "width=600,height=760");
  const disconnect = async () => {
    await fetch("/api/ads/meta/disconnect", { method: "POST" });
    setAdAccountId(""); setPageId("");
    await load(false);
  };
  const recheck = async () => {
    setChecking(true);
    try { await load(true); } finally { setChecking(false); }
  };

  const activate = async (campaignId: string): Promise<string | null> => {
    const res = await fetch("/api/ads/meta/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, campaignId }) });
    if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't turn the ads on.";
    await load(false);
    return null;
  };
  const currencyOf = (id: string | null) => accounts?.adAccounts.find((a) => a.id === id)?.currency ?? currency;

  const chosenAds = ok ? ok.ads.filter((a) => a.eligible && selected.includes(a.id)) : [];
  const budgetMajor = Number(budget);
  const canNext: Record<MetaStep, boolean> = {
    connect: connected,
    account: !!adAccountId && !!pageId && !!ok && currentReadiness(ok, adAccountId)?.ok === true,
    ads: chosenAds.length > 0,
    targeting: countries.length > 0 && budgetMajor > 0 && !!goal,
    review: !busy,
    done: false,
  };
  const idx = META_STEPS.indexOf(step);
  const next = () => setStep(META_STEPS[Math.min(idx + 1, META_STEPS.length - 1)]);
  const back = () => setStep(META_STEPS[Math.max(idx - 1, 1)]);

  const publish = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/ads/meta/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId, adIds: chosenAds.map((a) => a.id), adAccountId, pageId, countries,
          budget: toMinorUnits(budgetMajor, currency), goal: goal ?? undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(body.error ?? "Publishing failed.");
      else { setSelected([]); setStep("done"); await load(false); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!status}><Send /> Publish to Meta</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publish to Meta</DialogTitle>
          <DialogDescription>Everything is created paused. Nothing spends until you turn it on.</DialogDescription>
        </DialogHeader>

        {ok && (
          <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Steps">
            {META_STEPS.map((s, i) => (
              <li key={s} aria-current={s === step ? "step" : undefined}
                className={s === step ? "font-semibold text-foreground" : i < idx ? "text-foreground/70" : "text-muted-foreground"}>
                {i + 1}. {STEP_LABELS[s]}
              </li>
            ))}
          </ol>
        )}

        {!status ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : !ok ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Publishing straight to Facebook and Instagram is part of the paid plans.</p>
            <Button asChild><Link href="/ads/billing">See plans</Link></Button>
          </div>
        ) : step === "connect" ? (
          <ConnectStep onConnect={connect} />
        ) : step === "account" ? (
          <AccountCheckStep status={ok} adAccountId={adAccountId} pageId={pageId} onAdAccount={setAdAccountId} onPage={setPageId}
            onRecheck={recheck} checking={checking} onDisconnect={disconnect} />
        ) : step === "ads" ? (
          <PickAdsStep ads={ok.ads} selected={selected} onChange={setSelected} />
        ) : step === "targeting" ? (
          <TargetingStep countries={countries} onCountries={setCountries} budget={budget} onBudget={(b) => { setBudgetTouched(true); setBudget(b); }}
            currency={currency} goal={goal ?? "traffic"} onGoal={setGoal} />
        ) : step === "review" ? (
          <ReviewStep ads={chosenAds} ratios={ok.ratios} accountName={account?.name ?? adAccountId}
            pageName={accounts?.pages.find((p) => p.id === pageId)?.name ?? pageId}
            countries={countries} budget={budgetMajor} currency={currency} goal={goal ?? "traffic"} />
        ) : (
          <DoneStep ads={ok.ads} campaigns={ok.campaigns} canActivate={ok.canActivate} currencyOf={currencyOf} onActivate={activate} />
        )}

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {ok && step !== "connect" && (
          <DialogFooter className="gap-2 sm:justify-between">
            {step === "done" ? (
              <>
                <Button variant="ghost" onClick={() => setStep("ads")}>Publish more ads</Button>
                <Button onClick={() => setOpen(false)}>Close</Button>
              </>
            ) : (
              <>
                {idx > 1 ? <Button variant="ghost" onClick={back}><ChevronLeft /> Back</Button> : <span />}
                {step === "review" ? (
                  <Button onClick={publish} disabled={!canNext.review}>
                    {busy && <Loader2 className="animate-spin" />} Create {chosenAds.length} paused {chosenAds.length === 1 ? "ad" : "ads"}
                  </Button>
                ) : (
                  <Button onClick={next} disabled={!canNext[step]}>Next</Button>
                )}
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
