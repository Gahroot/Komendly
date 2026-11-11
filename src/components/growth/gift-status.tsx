import { cn } from "@/lib/utils";
import type { GiftView } from "@/lib/ads/gift-client";

const LABEL: Record<GiftView["status"], string> = { pending: "Reading their site", generating: "Ozzy is drawing", ready: "Ready to send", failed: "Couldn't finish" };

export function GiftStatusBadge({ status, className = "" }: { status: GiftView["status"]; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
      status === "ready" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : status === "failed" ? "border-destructive/40 bg-destructive/10 text-red-200" : "border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/10 text-[var(--studio-gold)]",
      className,
    )}>
      {status !== "ready" && status !== "failed" && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {LABEL[status]}
    </span>
  );
}
