"use client";
// Ozzy's live "working" glyph: a small starry orb whose animation follows the real phase of the turn
// (thinking-orbs, MIT: canvas, transparent background, light ink on our night sky). Reduced motion = paused.
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { usePrefersReducedMotion } from "@/components/ozzy/use-reduced-motion";
import type { StudioPhase } from "@/lib/studio/contracts";

/** Each phase gets its own animation, in the constellation spirit of the studio sky. */
export const PHASE_ORB: Record<StudioPhase, OrbState> = {
  thinking: "breathing",
  looking: "searching",
  building: "connecting",
  rendering: "working",
  reviewing: "shaping",
  done: "breathing",
  error: "breathing",
};

/** A web_fetch / "reading your website" step reads as searching; asking the user reads as listening. */
export function orbFor(phase: StudioPhase | null | undefined, label?: string | null): OrbState {
  if (label && /website|reading|research/i.test(label)) return "searching";
  if (label && /question|asking/i.test(label)) return "listening";
  if (label && /music|sound|beat/i.test(label)) return "listening";
  if (label && /caption|writing|script/i.test(label)) return "composing";
  if (label && /cut|footage|edit|trim|join/i.test(label)) return "weaving";
  return PHASE_ORB[phase ?? "thinking"] ?? "breathing";
}

export function PhaseOrb({ phase, label }: { phase: StudioPhase | null | undefined; label?: string | null }) {
  const reduced = usePrefersReducedMotion();
  return (
    // The 64px design (more stars) drawn at 28px, inked starlight-gold to match the sky; soft glow behind.
    <span aria-hidden className="studio-orb relative inline-grid size-7 shrink-0 place-items-center">
      <ThinkingOrb state={orbFor(phase, label)} size={64} theme="dark" paused={reduced} style={{ width: 28, height: 28 }} />
    </span>
  );
}
