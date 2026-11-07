import { CheckCircle2, CircleAlert, Clock, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/ads/run-types";

const STATUS: Record<RunStatus, { label: string; tone: "busy" | "wait" | "ok" | "warn" | "bad" }> = {
  extracting: { label: "Reading site", tone: "busy" },
  awaiting_confirm: { label: "Needs review", tone: "wait" },
  queued: { label: "Queued", tone: "busy" },
  generating: { label: "Generating", tone: "busy" },
  completed: { label: "Ready", tone: "ok" },
  partial: { label: "Partly ready", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
  canceled: { label: "Canceled", tone: "bad" },
};

const TONE_CLASS = {
  busy: "text-primary",
  wait: "text-[var(--warning)]",
  ok: "text-[var(--success)]",
  warn: "text-[var(--warning)]",
  bad: "text-destructive",
} as const;

/** Run status as icon + words (never colour alone). */
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { label, tone } = STATUS[status];
  const Icon = tone === "busy" ? Loader2 : tone === "wait" ? Clock : tone === "ok" ? CheckCircle2 : tone === "warn" ? CircleAlert : XCircle;
  return (
    <Badge variant="outline" className="gap-1 rounded-full">
      <Icon className={`size-3 ${TONE_CLASS[tone]} ${tone === "busy" ? "animate-spin" : ""}`} aria-hidden />
      {label}
    </Badge>
  );
}
