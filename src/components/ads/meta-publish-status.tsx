"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MetaAdView } from "@/lib/ads/meta/status-types";

const LABEL: Record<string, string> = { pending: "Publishing", published: "Paused in Meta", failed: "Failed" };

export function MetaPublishStatus({ ads }: { ads: MetaAdView[] }) {
  const rows = ads.flatMap((a) => a.publishes.map((p) => ({ ad: a, p })));
  if (!rows.length) return null;
  return (
    <ul className="space-y-2 text-sm" aria-live="polite">
      {rows.map(({ ad, p }) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card/50 px-3 py-2">
          <span className="min-w-0 truncate">{ad.headline} <span className="text-muted-foreground">· {p.ratio}</span></span>
          <span className="flex items-center gap-2">
            <Badge variant={p.status === "failed" ? "destructive" : p.status === "published" ? "secondary" : "outline"}>{LABEL[p.status] ?? p.status}</Badge>
            {p.status === "published" && p.adsManagerUrl && (
              <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={p.adsManagerUrl} target="_blank" rel="noreferrer">
                Review <ExternalLink className="size-3.5" />
              </a>
            )}
          </span>
          {p.error && <p className="w-full text-xs text-destructive">{p.error}</p>}
        </li>
      ))}
    </ul>
  );
}
