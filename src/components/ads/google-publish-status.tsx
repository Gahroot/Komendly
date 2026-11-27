"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Pause, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GoogleApiError, googleApi, plainServerError, type GooglePublishView, type GoogleStatus } from "@/lib/ads/google/client-api";
import { ErrorNote } from "./google-steps/error-note";
import { HELP_PATH, KIND_LABEL, SERVING_LABEL, formatMoney, jobBusy, policyIssueText, policyText } from "./google-steps/logic";
import { refreshGoogleStatus, useGoogleStatus } from "./google-steps/use-google-status";

const START_HOLD_SECONDS = 3;
const nf = new Intl.NumberFormat();

/** Start or pause one campaign; resolves to a plain error or null. */
export async function runGoogleAction(runId: string, publishId: string, action: "enable" | "pause"): Promise<string | null> {
  try {
    await googleApi.activate(publishId, action);
    await refreshGoogleStatus(runId);
    return null;
  } catch (e) {
    return e instanceof GoogleApiError ? e.message : action === "enable" ? "We couldn't start your ads." : "We couldn't pause your ads.";
  }
}

export function GooglePublishStatus({
  status, onAction, spendNote, onRetry,
}: {
  status: GoogleStatus;
  onAction: (publishId: string, action: "enable" | "pause") => Promise<string | null>;
  /** e.g. "up to $20 a day for each campaign", when we know it. */
  spendNote?: string;
  onRetry?: () => void;
}) {
  const busy = jobBusy(status);
  const activating = busy && status.job?.type.includes("activate");
  return (
    <ul className="space-y-2 text-sm" aria-live="polite">
      {status.publishes.map((p) => (
        <CampaignRow key={p.id} p={p} busy={busy} activating={!!activating} onAction={onAction} spendNote={spendNote} onRetry={onRetry} />
      ))}
      {status.job?.status === "failed" && status.job.type.includes("activate") && (
        <li><ErrorNote message={plainServerError(status.job.error, "Google didn't accept the change. Please try again.")} action={{ label: "Open Google Ads", href: status.publishes[0]?.googleAdsUrl ?? "https://ads.google.com" }} /></li>
      )}
    </ul>
  );
}

function CampaignRow({ p, busy, activating, onAction, spendNote, onRetry }: {
  p: GooglePublishView; busy: boolean; activating: boolean; onAction: (id: string, a: "enable" | "pause") => Promise<string | null>; spendNote?: string; onRetry?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [hold, setHold] = useState(START_HOLD_SECONDS);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!confirming) return;
    setHold(START_HOLD_SECONDS);
    const t = setInterval(() => setHold((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [confirming]);

  const act = async (a: "enable" | "pause") => {
    setSending(true); setError(null);
    try {
      const err = await onAction(p.id, a);
      if (err) setError(err); else setConfirming(false);
    } finally { setSending(false); }
  };
  const pol = policyText(p.policy);
  const running = p.serving === "enabled";

  return (
    <li className="space-y-2 rounded-md border border-border bg-card/50 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-medium">{KIND_LABEL[p.kind]}</span>
          <span className="block truncate text-xs text-muted-foreground">{p.campaignName ?? "Your campaign"} · {p.adCount} {p.adCount === 1 ? "ad" : "ads"}</span>
        </span>
        {p.status === "published" && <Badge variant={running ? "default" : "secondary"}>{SERVING_LABEL[p.serving]}</Badge>}
        {p.status === "pending" && <Badge variant="outline"><Loader2 className="animate-spin" /> Being created</Badge>}
        {p.status === "failed" && <Badge variant="destructive">Not created</Badge>}
      </div>

      {p.status === "failed" && (
        <ErrorNote message={plainServerError(p.error, "Google didn't accept this campaign. Nothing was charged.")}
          action={onRetry ? { label: "Try again", onClick: onRetry } : { label: "Get help", href: HELP_PATH }} />
      )}

      {p.status === "published" && (
        <>
          <div>
            <p><span className="text-muted-foreground">Google approval:</span> <span className={p.policy === "disapproved" ? "font-medium text-destructive" : "font-medium"}>{pol.label}</span></p>
            <p className="text-xs text-muted-foreground">{pol.detail}</p>
            {p.policy !== "approved" && p.policyIssues.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{p.policyIssues.map((i) => <li key={i}>{policyIssueText(i)}</li>)}</ul>
            )}
          </div>
          {p.metrics && (
            <p className="text-xs text-muted-foreground">
              Shown {nf.format(p.metrics.impressions)} times · {nf.format(p.metrics.clicks)} clicks · {formatMoney(p.metrics.cost, p.metrics.currency)} spent
              {p.metrics.since && <> since {new Date(p.metrics.since).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</>}
            </p>
          )}

          {confirming ? (
            <div className="space-y-2 rounded-md bg-muted/50 px-3 py-2" role="alertdialog" aria-label="Confirm starting your ads">
              <p className="font-medium">This starts spending real money.</p>
              <p>Google shows your ads and charges your card{spendNote ? `, ${spendNote}` : " up to the daily budget you set"}, until you pause them.</p>
              {error && <p className="text-destructive" role="alert">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => act("enable")} disabled={sending || hold > 0}>
                  {sending ? <Loader2 className="animate-spin" /> : <Play />} {hold > 0 ? `Yes, start my ads (${hold})` : "Yes, start my ads"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={sending}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {activating ? (
                <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Updating in Google Ads…</span>
              ) : running ? (
                <Button size="sm" variant="outline" onClick={() => act("pause")} disabled={sending || busy}>{sending ? <Loader2 className="animate-spin" /> : <Pause />} Pause</Button>
              ) : p.serving === "paused" && p.policy === "disapproved" ? (
                <span className="text-muted-foreground">Fix the ads in Google Ads first. Then you can start them.</span>
              ) : p.serving === "paused" ? (
                <Button size="sm" onClick={() => setConfirming(true)} disabled={busy}><Play /> {p.metrics?.impressions ? "Resume" : "Start my ads"}</Button>
              ) : null}
              <Button asChild size="sm" variant="ghost">
                <a href={p.googleAdsUrl} target="_blank" rel="noreferrer">Open in Google Ads <ExternalLink /></a>
              </Button>
              {error && <p className="w-full text-destructive" role="alert">{error}</p>}
            </div>
          )}
        </>
      )}
    </li>
  );
}

/** Gallery card: what's on Google for this run, with start/pause. Renders nothing until something was published. */
export function GoogleRunPanel({ runId }: { runId: string }) {
  const { status, hidden } = useGoogleStatus(runId);
  if (hidden || !status?.available || status.publishes.length === 0) return null;
  return (
    <section className="glass space-y-3 rounded-2xl p-4" aria-labelledby="google-run-panel">
      <h3 id="google-run-panel" className="font-semibold">On Google Ads</h3>
      <GooglePublishStatus status={status} onAction={(id, a) => runGoogleAction(runId, id, a)} />
    </section>
  );
}
