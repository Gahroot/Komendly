import { ShieldAlert } from "lucide-react";
import type { AdView } from "@/lib/ads/run-types";

/** Compact row for an ad that failed QC/generation. */
export function AdFailedCard({ ad }: { ad: AdView }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card/60 p-3 text-sm backdrop-blur">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="font-medium">{ad.status === "failed_qc" ? "Didn't pass quality check" : "Couldn't be generated"}, credit refunded</p>
        <p className="truncate text-xs text-muted-foreground">{ad.headline || `Ad ${ad.index + 1}`}</p>
      </div>
    </div>
  );
}
