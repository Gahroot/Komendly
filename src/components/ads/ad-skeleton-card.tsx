import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ASPECT: Record<string, string> = { "4:5": "aspect-[4/5]", "1:1": "aspect-square", "9:16": "aspect-[9/16]" };

/** Placeholder tile at the ad's ratio while it is planned or rendering. */
export function AdSkeletonCard({ label, ratio = "4:5" }: { label: string; ratio?: string }) {
  return (
    <div className="space-y-2.5" aria-busy="true">
      <div className="relative">
        <Skeleton className={`${ASPECT[ratio] ?? "aspect-square"} w-full rounded-2xl border`} />
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full border bg-background/85 px-2 py-0.5 text-xs text-muted-foreground backdrop-blur">
          <Loader2 className="size-3 animate-spin" /> {label}
        </span>
      </div>
      <div className="space-y-1.5 px-1">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
