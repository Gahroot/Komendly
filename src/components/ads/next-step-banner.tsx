import Link from "next/link";
import type { NextAction } from "@/lib/customer-intel/next-action";

/** One clear next step. Presentational; the caller decides whether to show it (flag sys_simplicity). */
export function NextStepBanner({ action }: { action: NextAction }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3" data-next-step={action.id}>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your next step</p>
        <p className="font-medium">{action.title}</p>
        <p className="text-sm text-muted-foreground">{action.body}</p>
      </div>
      <Link href={action.href} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{action.cta}</Link>
    </div>
  );
}
