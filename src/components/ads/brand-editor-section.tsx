import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Collapsible glass section for the brand profile editor (native <details>, keyboard accessible). */
export function BrandEditorSection({ title, description, meta, defaultOpen = true, className, contentClassName, children }: {
  title: string;
  description: string;
  meta?: string;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className={cn("glass group/section self-start rounded-2xl", className)}>
      <summary className="flex cursor-pointer list-none items-start gap-3 rounded-2xl p-5 sm:p-6 [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {title}
            {meta && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{meta}</span>}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/section:rotate-180" aria-hidden />
      </summary>
      <div className={cn("px-5 pb-5 sm:px-6 sm:pb-6", contentClassName)}>{children}</div>
    </details>
  );
}
