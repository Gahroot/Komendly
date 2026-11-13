"use client";

import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdRuns } from "@/hooks/useAdRuns";
import { RunStatusBadge } from "./run-status-badge";

function domainOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function AdsRecentRuns() {
  const { data, error } = useAdRuns();
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold">Recent runs</CardTitle></CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">Couldn&apos;t load your runs. Refresh to try again.</p>
        ) : !data ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : data.runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><History className="size-5" aria-hidden /></div>
            <p className="font-medium">No runs yet</p>
            <p className="text-sm text-muted-foreground">Enter your website above to make your first ads.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.runs.map((run) => (
              <li key={run.id}>
                <Link href={`/ads/runs/${run.id}`} className="-mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{run.title ? `${run.title} · ${domainOf(run.url)}` : domainOf(run.url)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {dateFmt.format(new Date(run.createdAt))} · {run.readyCount}/{run.totalCount} ads{run.isTrial ? " · trial" : ""}
                    </p>
                  </div>
                  <RunStatusBadge status={run.status} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
