// Small shared pieces for /ads/team. Client-safe (no hooks).
import type { Certainty, TeamRole } from "@/lib/ads/team/contracts";
import { cn } from "@/lib/utils";

/** Ozzy's existing forms per team role (one character, different hats: prd.md §4). */
export const ROLE_OZZY: Record<TeamRole, string> = {
  director: "/brand/ozzy-classic-happy.png",
  strategy: "/brand/ozzy-explorer-focused.png",
  creative: "/brand/ozzy-creator-focused.png",
  launch: "/brand/ozzy-adventurer-cool.png",
  analyst: "/brand/ozzy-developer-excited.png",
  leads: "/brand/ozzy-classic-love.png",
};

export function OzzyImg({ src, size = 64, className }: { src: string; size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="" aria-hidden className={cn("shrink-0 [image-rendering:pixelated]", className)} />;
}

const CERTAINTY: Record<Certainty, { label: string; cls: string }> = {
  measured: { label: "measured", cls: "border-[var(--studio-gold)]/50 text-[var(--studio-gold)]" },
  estimated: { label: "estimated", cls: "border-[var(--studio-cyan)]/50 text-[var(--studio-cyan)]" },
  unknown: { label: "no data yet", cls: "border-border text-muted-foreground" },
};

export function CertaintyTag({ c }: { c: Certainty }) {
  const x = CERTAINTY[c];
  return <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", x.cls)}>{x.label}</span>;
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
