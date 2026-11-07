import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Awareness } from "@/lib/ads/contracts";
import { AWARENESS_INFO } from "@/lib/ads/run-labels";

export function AwarenessBadge({ level }: { level: Awareness }) {
  const info = AWARENESS_INFO[level];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="cursor-help gap-1.5 bg-background/60 font-medium text-muted-foreground"><span aria-hidden className="size-1.5 rounded-full bg-primary" />{info.label}</Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{info.explain}</TooltipContent>
    </Tooltip>
  );
}
