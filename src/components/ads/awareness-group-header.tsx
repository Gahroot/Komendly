import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Awareness } from "@/lib/ads/contracts";
import { AWARENESS_INFO } from "@/lib/ads/run-labels";

/** Small metadata line above each awareness group in the gallery. */
export function AwarenessGroupHeader({ level, count }: { level: Awareness; count: number }) {
  const info = AWARENESS_INFO[level];
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="size-1.5 rounded-full bg-primary" />
      <h3 className="text-sm font-semibold">{info.label}</h3>
      <span className="text-xs tabular-nums text-muted-foreground">{count} {count === 1 ? "ad" : "ads"}</span>
      <Tooltip>
        <TooltipTrigger className="text-muted-foreground hover:text-foreground" aria-label={`What is ${info.label}?`}><Info className="size-3.5" /></TooltipTrigger>
        <TooltipContent className="max-w-60">{info.explain}</TooltipContent>
      </Tooltip>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
