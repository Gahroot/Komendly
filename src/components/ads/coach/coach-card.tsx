import Link from "next/link";
import { Stethoscope } from "lucide-react";

/** Entry card for Ozzy Ad Coach (/ads/app and /dashboard). Server-safe. */
export function CoachCard({ className = "" }: { className?: string }) {
  return (
    <Link href="/ads/coach" className={`group block rounded-2xl border border-border p-5 transition-colors hover:border-[var(--studio-gold,#f5c542)]/60 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-[#7b3cf0]/20 text-[#f5c542]"><Stethoscope aria-hidden className="size-5" /></span>
        <span className="text-base font-semibold">Ozzy Ad Coach</span>
        <span className="ml-auto rounded-full bg-[#f5c542] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#2a0f10]">New</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Drop a screenshot of Meta Ads Manager. Ozzy tells you which ads to keep, which to switch off, and makes more like the winner.</p>
      <p className="mt-3 text-sm font-semibold group-hover:underline">Get a check-up →</p>
    </Link>
  );
}
