"use client";

import Image from "next/image";
import { ChevronDown, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LAUNCH_GUIDE_STEPS } from "@/lib/ads/launch-guide";
import { track } from "@/lib/analytics/track";
import { useDownloadGate } from "./download-gate";

/** Results page: Ozzy walks them through putting the ads live on Meta (open by default). */
export function LaunchGuideCard({ runId, ready }: { runId: string; ready: number }) {
  const gate = useDownloadGate();
  return (
    <section id="launch-guide" className="studio-frame relative scroll-mt-24 overflow-hidden rounded-3xl p-5 sm:p-7" aria-labelledby="launch-guide-title">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[var(--studio-violet)]/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-[var(--studio-gold)]/10 blur-3xl" />
      <details open className="group relative" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && track("launch_guide_opened", { run_id: runId })}>
        <summary className="flex cursor-pointer list-none items-start gap-4 [&::-webkit-details-marker]:hidden">
          <Image src="/brand/ozzy-explorer-focused.png" alt="" width={80} height={80} unoptimized className="size-16 shrink-0 [image-rendering:pixelated] sm:size-20" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Next step, with Ozzy</p>
            <h2 id="launch-guide-title" className="font-display mt-1.5 text-balance text-2xl font-medium leading-tight tracking-[-0.02em] sm:text-[1.75rem]">Run these on Facebook and Instagram in about 10 minutes</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">Five steps. No ad agency needed.</p>
          </div>
          <ChevronDown className="mt-2 size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {LAUNCH_GUIDE_STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-[var(--border)] bg-white/[0.04] p-4">
              <span className="font-display flex size-8 items-center justify-center rounded-full bg-[var(--studio-gold)] text-sm font-semibold text-[var(--studio-ink)]">{i + 1}</span>
              <h3 className="mt-3 font-medium">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{s.text}</p>
            </li>
          ))}
        </ol>
        {ready > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <a href={`/api/ads/runs/${runId}/download`} onClick={(e) => {
                if (gate.locked) {
                  e.preventDefault();
                  return gate.open();
                }
                track("ad_downloaded", { run_id: runId, scope: "all", ready, placement: "launch_guide" });
              }}>
                <Download className="size-4" /> Download all + ad text
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="https://adsmanager.facebook.com/" target="_blank" rel="noreferrer">Open Meta Ads Manager <ExternalLink className="size-3.5" /></a>
            </Button>
          </div>
        )}
      </details>
    </section>
  );
}
