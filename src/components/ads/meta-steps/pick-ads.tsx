"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MetaAdView } from "@/lib/ads/meta/status-types";

export function PickAdsStep({ ads, selected, onChange }: { ads: MetaAdView[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const ready = ads.filter((a) => a.eligible).map((a) => a.id);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const allOn = ready.length > 0 && ready.every((id) => selected.includes(id));
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground">Pick the ads to publish. 3 to 5 is a good start.</p>
        <Button variant="outline" size="sm" disabled={!ready.length} onClick={() => onChange(allOn ? [] : ready)}>
          {allOn ? "Clear" : `Select all ready (${ready.length})`}
        </Button>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ads.map((a) => {
          const on = selected.includes(a.id);
          const published = a.publishes.some((p) => p.status === "published");
          return (
            <li key={a.id}>
              <label className={`group relative block overflow-hidden rounded-md border-2 ${on ? "border-primary" : "border-border"} ${a.eligible ? "cursor-pointer" : "cursor-not-allowed opacity-50 grayscale"}`}>
                <input type="checkbox" className="peer sr-only" disabled={!a.eligible} checked={on} onChange={() => toggle(a.id)} aria-label={a.headline} />
                {a.thumb ? (
                  a.thumbIsVideo
                    ? <video src={a.thumb} muted playsInline preload="metadata" className="aspect-[4/5] w-full bg-muted object-cover" aria-hidden />
                    : <img src={a.thumb} alt="" loading="lazy" className="aspect-[4/5] w-full bg-muted object-cover" />
                ) : <div className="aspect-[4/5] w-full bg-muted" />}
                <span className={`absolute right-2 top-2 flex size-6 items-center justify-center rounded-full border-2 border-background shadow peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${on ? "bg-primary text-primary-foreground" : "bg-background/80"}`}>
                  {on && <Check className="size-4" />}
                </span>
                <span className="block space-y-0.5 p-2">
                  <span className="block truncate font-medium">{a.headline}</span>
                  <span className="block text-xs text-muted-foreground">
                    {a.kind === "motion" ? "Video" : "Image"}{!a.eligible ? " · not ready" : published ? " · already on Meta" : ""}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
