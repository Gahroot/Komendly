"use client";

import { useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAdRun } from "@/hooks/useAdRun";
import { useAdsWorkspace } from "@/hooks/useAdsWorkspace";
import { useRunFunnelTracking } from "@/hooks/useRunFunnelTracking";
import { useOzzyRunSync } from "@/hooks/useOzzyRunSync";
import { RunCompanion } from "./run-companion";
import type { RunView } from "@/lib/ads/run-types";
import { AdGallery } from "./ad-gallery";
import { ExtractionReview } from "./extraction-review";
import { GenerateMoreForm } from "./generate-more-form";
import { RunProgress } from "./run-progress";
import { PricingSurvey } from "./pricing-survey";
import { TrialUpsell } from "./trial-upsell";

/** Live run: extracting → review (30 s window) → generating → gallery. */
export function RunScreen({ initial }: { initial: RunView }) {
  const { data, mutate } = useAdRun(initial.id, initial);
  const { data: ws } = useAdsWorkspace();
  const refresh = useCallback(() => void mutate(), [mutate]);
  const run = data ?? initial;
  useRunFunnelTracking(run);
  useOzzyRunSync(run);
  const domain = run.extraction?.domain ?? new URL(run.url).hostname;
  const done = ["completed", "partial"].includes(run.status);

  let body: React.ReactNode;
  if (run.status === "extracting") body = <RunProgress phase="extracting" domain={domain} />;
  else if (run.status === "awaiting_confirm" && run.extraction) {
    body = <ExtractionReview key={`${run.retriesLeft}`} run={run} extraction={run.extraction} onChanged={refresh} />;
  } else if (run.status === "awaiting_confirm") body = <RunProgress phase="extracting" domain={domain} />;
  else if (run.status === "queued" && run.ads.length === 0) body = <RunProgress phase="planning" domain={domain} />;
  else if ((run.status === "failed" || run.status === "canceled") && run.ads.length === 0) {
    body = (
      <Card className="mx-auto max-w-md bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle>We couldn&apos;t finish this run</CardTitle>
          <CardDescription>{run.error ?? "Something went wrong on our side. Any reserved credits were refunded."}</CardDescription>
        </CardHeader>
        <CardFooter><Button asChild><Link href="/ads/app">Back to home</Link></Button></CardFooter>
      </Card>
    );
  } else body = <AdGallery run={run} />;

  return (
    <TooltipProvider>
      <div className="space-y-8">
        <div className="flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <Link href="/ads/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="size-3.5" /> All runs
            </Link>
            <h1 className="truncate text-3xl font-semibold tracking-tight">{run.extraction?.brandName ?? domain}</h1>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="size-3.5" /><span className="truncate">{domain}</span>
              {run.isTrial && <span className="rounded-full border bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Free trial</span>}
            </p>
          </div>
          <div className="w-full sm:max-w-md"><RunCompanion run={run} domain={domain} /></div>
        </div>
        {body}
        {done && run.isTrial && !ws?.isPaid && <TrialUpsell />}
        {done && run.isTrial && ws && !ws.isPaid && <PricingSurvey />}
        {done && ws?.isPaid && <GenerateMoreForm url={run.url} brandProfileId={run.brandProfileId} />}
      </div>
    </TooltipProvider>
  );
}
