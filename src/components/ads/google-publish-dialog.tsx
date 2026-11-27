"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Lock, MoreHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { GoogleApiError, googleApi, plainServerError, type GeoPick, type GoogleAccount, type GoogleDraft, type GoogleKeyword, type GoogleSearchText } from "@/lib/ads/google/client-api";
import { runGoogleAction } from "./google-publish-status";
import { AccountPickerStep } from "./google-steps/account-picker";
import { AreaStep } from "./google-steps/area";
import { BudgetStep } from "./google-steps/budget";
import { ConfirmStep, type ConfirmPhase } from "./google-steps/confirm";
import { ConnectStep, type ConnectChoice, type SetupNote } from "./google-steps/connect";
import { ErrorNote, type NextAction } from "./google-steps/error-note";
import {
  DEFAULT_LIMITS, GOOGLE_STEP_LABELS, HELP_PATH, JOB_POLL_MS, RECHECK_MS, adAccounts, budgetBlocker, campaignsFor, connectErrorText, jobBusy,
  parseMoney, previewsByAd, publishBlockers, readReturnParams, textBlockers, visibleSteps, youtubeId, type GoogleStep,
} from "./google-steps/logic";
import { PickAdsStep } from "./google-steps/pick-ads";
import { ReadinessStep } from "./google-steps/readiness";
import { TextAdStep } from "./google-steps/text-ad";
import { useGoogleStatus } from "./google-steps/use-google-status";

type Err = { message: string; action?: NextAction };
const msg = (e: unknown, fallback: string) => (e instanceof GoogleApiError ? e.message : fallback);

/**
 * "Run these on Google" for a finished run: a guided flow from "no Google Ads account" to a paused campaign
 * the owner starts here. Self-contained; renders nothing when google_publish is off for the workspace.
 * Mount: <GooglePublishDialog runId={run.id} adIds={readyAdIds} />
 */
export function GooglePublishDialog({ runId, adIds }: { runId: string; adIds: string[] }) {
  const { status, hidden, error: loadError, refresh } = useGoogleStatus(runId);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<GoogleStep>("connect");
  const [connectChoice, setConnectChoice] = useState<ConnectChoice | null>(null);
  const [note, setNote] = useState<SetupNote | null>(null);
  const [error, setError] = useState<Err | null>(null);
  const [accounts, setAccounts] = useState<GoogleAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [draft, setDraft] = useState<GoogleDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [geo, setGeo] = useState<GeoPick[]>([]);
  const [budget, setBudget] = useState("");
  const [search, setSearch] = useState<GoogleSearchText>({ headlines: [], descriptions: [], path1: "", path2: "" });
  const [keywords, setKeywords] = useState<GoogleKeyword[]>([]);
  const [finalUrl, setFinalUrl] = useState("");
  const [phase, setPhase] = useState<ConfirmPhase>("review");
  const [publishing, setPublishing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const sawBusy = useRef(false);

  const conn = status?.connection ?? null;
  const ok = !!status?.available;
  const adList = useMemo(() => (accounts ? adAccounts(accounts) : null), [accounts]);
  const steps = visibleSteps(status, adList ? adList.length : null);
  const idx = Math.max(0, steps.indexOf(step));
  const busyJob = jobBusy(status);

  const signIn = useCallback(async () => {
    const { url } = await googleApi.connect(`${window.location.pathname}${window.location.search}`);
    window.location.assign(url);
  }, []);

  // Back from Google sign-in: ?google=connected|error&reason=... reopens the dialog at the right step.
  useEffect(() => {
    const r = readReturnParams(window.location.href);
    if (!r.result) return;
    window.history.replaceState(window.history.state, "", r.cleaned);
    setOpen(true);
    if (r.result === "error") {
      setConnectChoice("have");
      setError({ message: connectErrorText(r.reason), action: { label: "Try again", onClick: () => { signIn().catch((e) => setError({ message: msg(e, "We couldn't start Google sign-in.") })); } } });
    }
    void refresh();
  }, [refresh, signIn]);

  // Connecting or disconnecting moves between the first steps.
  const hasConn = !!conn;
  const mode = conn?.mode;
  useEffect(() => {
    if (!open || !ok) return;
    if (!hasConn) { setStep("connect"); return; }
    setStep((s) => (s === "connect" ? (mode === "oauth" ? "account" : "ready") : s));
  }, [open, ok, hasConn, mode]);

  const loadAccounts = useCallback(async () => {
    setAccountsError(null); setAccounts(null);
    try { setAccounts((await googleApi.accounts()).accounts); } catch (e) { setAccountsError(msg(e, "We couldn't load your Google Ads accounts.")); }
  }, []);
  useEffect(() => {
    if (open && step === "account" && mode === "oauth" && !accounts && !accountsError) void loadAccounts();
  }, [open, step, mode, accounts, accountsError, loadAccounts]);

  const selectAccount = useCallback(async (a: GoogleAccount) => {
    setSelecting(a.customerId); setError(null);
    try { await googleApi.select(a.customerId, a.loginCustomerId); await refresh(); return true; } catch (e) { setError({ message: msg(e, "We couldn't pick that account."), action: { label: "Try again", onClick: () => void selectAccount(a) } }); return false; } finally { setSelecting(null); }
  }, [refresh]);

  // Only one account to run ads on: pick it and skip the picker.
  useEffect(() => {
    if (step !== "account" || !adList || adList.length !== 1) return;
    const only = adList[0];
    if (conn?.customerId === only.customerId) { setStep("ready"); return; }
    void selectAccount(only).then((done) => { if (done) setStep("ready"); });
  }, [step, adList, conn?.customerId, selectAccount]);

  // Auto re-check every ~10s while waiting on Google (billing, invite, access), only while the tab is visible.
  const waiting = open && ((!hasConn && !!note) || (step === "ready" && !conn?.readiness.canPublish));
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, RECHECK_MS);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  // Draft is fetched once, when they reach the ads step.
  const loadDraft = useCallback(async () => {
    setDraftError(null);
    try {
      const d = await googleApi.draft(runId, adIds);
      setDraft(d);
      setSelected(previewsByAd(d.images).map((p) => p.adId));
      setGeo(d.geo.suggested ? [d.geo.suggested] : []);
      setBudget(String(Math.max(d.budget.suggestedDaily, d.budget.min)));
      setSearch(d.search);
      setKeywords(d.keywords);
      setFinalUrl(d.finalUrl);
    } catch (e) {
      setDraftError(msg(e, "We couldn't prepare your Google ad."));
    }
  }, [runId, adIds]);
  const draftNeeded = open && ["ads", "area", "budget", "text", "confirm"].includes(step) && phase === "review";
  useEffect(() => {
    if (draftNeeded && !draft && !draftError) void loadDraft();
  }, [draftNeeded, draft, draftError, loadDraft]);

  // While the campaign is being created, follow the job until Google answers.
  useEffect(() => {
    if (phase !== "sending") return;
    const t = setInterval(() => void refresh(), JOB_POLL_MS);
    return () => clearInterval(t);
  }, [phase, refresh]);
  useEffect(() => {
    if (phase !== "sending" || !status) return;
    if (busyJob) { sawBusy.current = true; return; }
    if (!sawBusy.current || !status.job) return;
    if (status.job.status === "succeeded" || status.publishes.length > 0) setPhase("done");
    else {
      setPhase("review");
      setError({ message: plainServerError(status.job.error, "Google didn't accept the campaign. Nothing was charged."), action: { label: "Get help", href: HELP_PATH } });
    }
  }, [phase, status, busyJob]);

  if (hidden) return null;

  const previews = draft ? previewsByAd(draft.images) : [];
  const currency = conn?.currency ?? draft?.budget.currency ?? "USD";
  const minBudget = draft?.budget.min ?? 1;
  const daily = parseMoney(budget);
  const campaigns = campaignsFor(selected, youtubeUrl);
  const limits = draft?.limits ?? DEFAULT_LIMITS;
  const tBlockers = textBlockers({ search, keywords, finalUrl, limits });
  const allBlockers = publishBlockers({
    customerId: conn?.customerId ?? "", adIds: selected, geo, dailyBudget: daily, minBudget, currency, search, keywords, finalUrl, youtubeUrl, limits,
  });
  const canNext: Record<GoogleStep, boolean> = {
    connect: hasConn,
    account: !!conn?.customerId && !selecting,
    ready: !!conn?.readiness.canPublish,
    ads: !!draft && (!youtubeUrl.trim() || !!youtubeId(youtubeUrl)),
    area: geo.length > 0,
    budget: budgetBlocker(daily, minBudget, currency) === null,
    text: tBlockers.length === 0,
    confirm: false,
  };
  const next = () => { setError(null); setStep(steps[Math.min(idx + 1, steps.length - 1)]); };
  const back = () => { setError(null); setStep(steps[Math.max(idx - 1, 0)]); };

  const openDialog = (o: boolean) => {
    setOpen(o);
    setConfirmDisconnect(false);
    if (!o) { setError(null); return; }
    void refresh();
    if (status?.publishes.length && status.connection) { setStep("confirm"); setPhase(busyJob ? "sending" : "done"); sawBusy.current = busyJob; }
  };

  const createAccount = async (input: { email: string; currency: string; timeZone: string }) => {
    const r = await googleApi.createAccount(input);
    setNote({ kind: "created", email: input.email, billingUrl: r.billingUrl, customerId: r.customerId });
    await refresh();
  };
  const linkAccount = async (customerId: string) => {
    const r = await googleApi.managerLink(customerId);
    setNote({ kind: "linked", customerId, acceptUrl: r.acceptUrl });
    await refresh();
  };
  const resendLink = async () => {
    if (!conn?.customerId) return;
    setResending(true); setError(null);
    try { await linkAccount(conn.customerId); } catch (e) { setError({ message: msg(e, "We couldn't send the access request."), action: { label: "Get help", href: HELP_PATH } }); } finally { setResending(false); }
  };
  const recheck = async () => {
    setChecking(true);
    try { await refresh(); } finally { setChecking(false); }
  };
  const disconnect = async () => {
    setError(null);
    try {
      await googleApi.disconnect();
      setConfirmDisconnect(false); setAccounts(null); setNote(null); setConnectChoice(null); setDraft(null); setPhase("review");
      await refresh();
    } catch (e) {
      setError({ message: msg(e, "We couldn't disconnect Google Ads."), action: { label: "Try again", onClick: () => void disconnect() } });
    }
  };

  const publish = async () => {
    if (!conn?.customerId || allBlockers.length) return;
    setPublishing(true); setError(null);
    sawBusy.current = false;
    try {
      const yt = youtubeUrl.trim();
      await googleApi.publish({
        runId, adIds: selected, customerId: conn.customerId, campaigns, dailyBudget: daily, geo, keywords, search: { ...search, headlines: search.headlines.map((h) => h.trim()), descriptions: search.descriptions.map((d) => d.trim()) },
        finalUrl: finalUrl.trim(), ...(yt ? { youtubeVideoUrl: yt } : {}),
      });
      setPhase("sending");
      await refresh();
    } catch (e) {
      if (e instanceof GoogleApiError && e.status === 409) { setPhase("sending"); await refresh(); }
      else setError({ message: msg(e, "We couldn't send your ads to Google."), action: { label: "Try again", onClick: () => void publish() } });
    } finally {
      setPublishing(false);
    }
  };

  const locked = status && !status.available;
  const draftStep = ["ads", "area", "budget", "text"].includes(step) || (step === "confirm" && phase === "review");

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!status && !loadError}>{locked ? <Lock /> : <Search />} Run these on Google</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2 pr-8">
            <div className="space-y-1.5">
              <DialogTitle>Run these on Google</DialogTitle>
              <DialogDescription>We set it up in your Google Ads account, paused. You start it when you&apos;re ready.</DialogDescription>
            </div>
            {ok && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="More options"><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild><Link href={HELP_PATH} target="_blank">Step-by-step guide</Link></DropdownMenuItem>
                  {hasConn && <DropdownMenuItem onSelect={() => setConfirmDisconnect(true)}>Disconnect Google Ads</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </DialogHeader>

        {confirmDisconnect && (
          <div className="space-y-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm" role="alertdialog" aria-label="Disconnect Google Ads">
            <p>Disconnect Google Ads from Komendly? Campaigns already in Google Ads stay there. Pause them in Google Ads if you want them to stop.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => void disconnect()}>Disconnect</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {ok && (
          <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Steps">
            {steps.map((s, i) => (
              <li key={s} aria-current={s === step ? "step" : undefined}
                className={s === step ? "font-semibold text-foreground" : i < idx ? "text-foreground/70" : "text-muted-foreground"}>
                {i + 1}. {GOOGLE_STEP_LABELS[s]}
              </li>
            ))}
          </ol>
        )}

        <div className="min-h-48">
          {!status ? (
            loadError ? <ErrorNote message={loadError} action={{ label: "Try again", onClick: () => void refresh() }} /> : <DialogSkeleton />
          ) : !ok ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Running your ads on Google is part of the paid plans.</p>
              <Button asChild><Link href="/ads/billing">See plans</Link></Button>
            </div>
          ) : step === "connect" ? (
            <ConnectStep initialChoice={connectChoice} note={hasConn ? null : note} onSignIn={signIn} onCreate={createAccount} onLink={linkAccount}
              canCreate={status.canCreateAccounts === true} oauthVerified={status.oauthVerified === true} />
          ) : !conn ? (
            <DialogSkeleton />
          ) : step === "account" ? (
            <AccountPickerStep accounts={adList} error={accountsError} selectedId={conn.customerId ?? null} selecting={selecting}
              onSelect={(a) => void selectAccount(a)} onRetry={() => void loadAccounts()} onCreateInstead={() => setConfirmDisconnect(true)} />
          ) : step === "ready" ? (
            <ReadinessStep connection={conn} note={note} onRecheck={() => void recheck()} checking={checking} onResendLink={() => void resendLink()} resending={resending} />
          ) : draftStep && !draft ? (
            draftError ? <ErrorNote message={draftError} action={{ label: "Try again", onClick: () => void loadDraft() }} /> : <DialogSkeleton />
          ) : step === "ads" ? (
            <PickAdsStep previews={previews} selected={selected} onChange={setSelected} youtubeUrl={youtubeUrl} onYoutubeUrl={setYoutubeUrl} />
          ) : step === "area" ? (
            <AreaStep geo={geo} onGeo={setGeo} base={draft?.businessLocation ? { kind: "radius", ...draft.businessLocation, miles: 10 } : draft?.geo.suggested?.kind === "radius" ? draft.geo.suggested : null} />
          ) : step === "budget" ? (
            <BudgetStep budget={budget} onBudget={setBudget} currency={currency} min={minBudget} campaigns={campaigns.length} />
          ) : step === "text" ? (
            <TextAdStep businessName={draft?.businessName ?? ""} search={search} onSearch={setSearch} keywords={keywords} onKeywords={setKeywords}
              finalUrl={finalUrl} onFinalUrl={setFinalUrl} limits={limits} blockers={tBlockers} />
          ) : (
            <ConfirmStep phase={phase} status={status} accountName={conn.accountName ?? "Your Google Ads account"} customerId={conn.customerId ?? ""}
              imageCount={selected.length} hasVideo={!!youtubeId(youtubeUrl)} keywordCount={keywords.length} geo={geo} dailyBudget={daily} currency={currency}
              campaigns={campaigns.length} blockers={allBlockers} onAction={(id, a) => runGoogleAction(runId, id, a)}
              onRetry={() => { setPhase("review"); setStep("text"); }} />
          )}
        </div>

        {error && <ErrorNote message={error.message} action={error.action} />}

        {ok && hasConn && step !== "connect" && (
          <DialogFooter className="gap-2 sm:justify-between">
            {step === "confirm" && phase !== "review" ? (
              <>
                <Button variant="ghost" onClick={() => { setPhase("review"); setStep("ads"); }} disabled={phase === "sending"}>Publish more ads</Button>
                <Button onClick={() => openDialog(false)}>Close</Button>
              </>
            ) : (
              <>
                {idx > 1 || (idx === 1 && steps[0] !== "connect") ? <Button variant="ghost" onClick={back}><ChevronLeft /> Back</Button> : <span />}
                {step === "confirm" ? (
                  <Button onClick={() => void publish()} disabled={publishing || busyJob || allBlockers.length > 0}>
                    {publishing && <Loader2 className="animate-spin" />} Create paused {campaigns.length === 1 ? "campaign" : "campaigns"}
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

function DialogSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-9 w-40" />
    </div>
  );
}
