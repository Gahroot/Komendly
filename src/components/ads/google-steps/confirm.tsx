"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import type { GeoPick, GoogleStatus } from "@/lib/ads/google/client-api";
import { GooglePublishStatus } from "../google-publish-status";
import { ErrorNote } from "./error-note";
import { formatCustomerId, formatMoney, monthlyEstimate } from "./logic";

export type ConfirmPhase = "review" | "sending" | "done";

export function ConfirmStep({
  phase, status, accountName, customerId, imageCount, hasVideo, keywordCount, geo, dailyBudget, currency, campaigns, blockers, onAction, onRetry, hideLastFailure,
}: {
  hideLastFailure?: boolean;
  phase: ConfirmPhase;
  status: GoogleStatus;
  accountName: string;
  customerId: string;
  imageCount: number;
  hasVideo: boolean;
  keywordCount: number;
  geo: GeoPick[];
  dailyBudget: number;
  currency: string;
  campaigns: number;
  blockers: string[];
  onAction: (publishId: string, action: "enable" | "pause") => Promise<string | null>;
  onRetry: () => void;
}) {
  const spendNote = dailyBudget > 0 ? `up to ${formatMoney(dailyBudget, currency)} a day for each campaign` : undefined;

  if (phase === "sending") {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center text-sm" aria-live="polite">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="font-medium">Creating your paused campaign in Google Ads…</p>
        <p className="text-muted-foreground">This usually takes about a minute. You can close this window. We keep going.</p>
      </div>
    );
  }

  if (phase === "done") {
    const anyOk = status.publishes.some((p) => p.status === "published");
    return (
      <div className="space-y-4 text-sm">
        {anyOk && (
          <div className="space-y-1 rounded-md bg-muted/50 px-3 py-2">
            <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4 text-primary" /> Your campaign is in Google Ads, paused.</p>
            <p>Nothing is spent yet. Google checks new ads first, which usually takes up to 1 business day. Press <span className="font-medium">Start my ads</span> when you&apos;re ready. You can pause any time, here or in Google Ads.</p>
          </div>
        )}
        <GooglePublishStatus status={status} onAction={onAction} spendNote={spendNote} onRetry={onRetry} />
      </div>
    );
  }

  const where = geo.map((g) => (g.kind === "location" ? g.name : `within ${g.miles} miles of ${g.label}`)).join(", ");
  return (
    <div className="space-y-4 text-sm">
      {!hideLastFailure && status.job?.status === "failed" && status.job.type.includes("publish") && (
        <ErrorNote message="Last time Google didn't accept the campaign. Nothing was charged. Check the details and try again." />
      )}
      <dl className="grid gap-x-4 gap-y-2 rounded-md border border-border bg-card/50 px-3 py-3 sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Google Ads account</dt>
        <dd>{accountName} · {formatCustomerId(customerId)}</dd>
        <dt className="text-muted-foreground">What we create</dt>
        <dd>
          A search ad with {keywordCount} search {keywordCount === 1 ? "phrase" : "phrases"}
          {campaigns > 1 && <>, plus image ads ({imageCount} {imageCount === 1 ? "image" : "images"}{hasVideo ? " and your video" : ""})</>}
        </dd>
        <dt className="text-muted-foreground">Where</dt>
        <dd>{where}</dd>
        <dt className="text-muted-foreground">Budget</dt>
        <dd>
          {formatMoney(dailyBudget, currency)} a day{campaigns > 1 ? " for each campaign" : ""}, about {formatMoney(monthlyEstimate(dailyBudget, campaigns), currency)} a month at most
        </dd>
      </dl>
      <p>Everything is created <span className="font-medium">paused</span>. Nothing is spent until you press Start my ads. Google charges your card, not Komendly.</p>
      {blockers.length > 0 && <ErrorNote message={blockers[0]} />}
    </div>
  );
}
