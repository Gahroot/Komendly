/**
 * Transitions Module
 * Video transition effects and FFmpeg filter generation
 */

import type { Transition, TransitionType } from "./types";
import { TRANSITION_PRESETS } from "./config";

// ============================================================================
// Transition Definitions
// ============================================================================

/** Transition metadata and behavior */
export interface TransitionDefinition {
  type: TransitionType;
  name: string;
  description: string;
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
  usesXfade: boolean;
  xfadeName?: string;
  category: "basic" | "directional" | "zoom" | "wipe" | "creative" | "shortform";
}

/** All available transitions with their definitions */
export const TRANSITION_DEFINITIONS: Record<TransitionType, TransitionDefinition> = {
  none: {
    type: "none",
    name: "None",
    description: "Direct cut, no transition effect",
    defaultDuration: 0,
    minDuration: 0,
    maxDuration: 0,
    usesXfade: false,
    category: "basic",
  },
  fade: {
    type: "fade",
    name: "Fade",
    description: "Fade to black between clips",
    defaultDuration: 0.5,
    minDuration: 0.1,
    maxDuration: 2,
    usesXfade: true,
    xfadeName: "fade",
    category: "basic",
  },
  crossfade: {
    type: "crossfade",
    name: "Crossfade",
    description: "Dissolve from one clip to another",
    defaultDuration: 0.5,
    minDuration: 0.1,
    maxDuration: 2,
    usesXfade: true,
    xfadeName: "dissolve",
    category: "basic",
  },
  slideLeft: {
    type: "slideLeft",
    name: "Slide Left",
    description: "New clip slides in from the right",
    defaultDuration: 0.4,
    minDuration: 0.1,
    maxDuration: 1.5,
    usesXfade: true,
    xfadeName: "slideleft",
    category: "directional",
  },
  slideRight: {
    type: "slideRight",
    name: "Slide Right",
    description: "New clip slides in from the left",
    defaultDuration: 0.4,
    minDuration: 0.1,
    maxDuration: 1.5,
    usesXfade: true,
    xfadeName: "slideright",
    category: "directional",
  },
  slideUp: {
    type: "slideUp",
    name: "Slide Up",
    description: "New clip slides in from the bottom",
    defaultDuration: 0.4,
    minDuration: 0.1,
    maxDuration: 1.5,
    usesXfade: true,
    xfadeName: "slideup",
    category: "directional",
  },
  slideDown: {
    type: "slideDown",
    name: "Slide Down",
    description: "New clip slides in from the top",
    defaultDuration: 0.4,
    minDuration: 0.1,
    maxDuration: 1.5,
    usesXfade: true,
    xfadeName: "slidedown",
    category: "directional",
  },
  zoomIn: {
    type: "zoomIn",
    name: "Zoom In",
    description: "Zoom into the next clip",
    defaultDuration: 0.4,
    minDuration: 0.1,
    maxDuration: 1.5,
    usesXfade: true,
    xfadeName: "smoothup",
    category: "zoom",
  },
  zoomOut: {
    type: "zoomOut",
    name: "Zoom Out",
    description: "Zoom out to reveal next clip",
    defaultDuration: 0.4,
    minDuration: 0.1,
    maxDuration: 1.5,
    usesXfade: true,
    xfadeName: "smoothdown",
    category: "zoom",
  },
  wipeLeft: {
    type: "wipeLeft",
    name: "Wipe Left",
    description: "Wipe transition moving left",
    defaultDuration: 0.5,
    minDuration: 0.1,
    maxDuration: 2,
    usesXfade: true,
    xfadeName: "wipeleft",
    category: "wipe",
  },
  wipeRight: {
    type: "wipeRight",
    name: "Wipe Right",
    description: "Wipe transition moving right",
    defaultDuration: 0.5,
    minDuration: 0.1,
    maxDuration: 2,
    usesXfade: true,
    xfadeName: "wiperight",
    category: "wipe",
  },
  wipeUp: {
    type: "wipeUp",
    name: "Wipe Up",
    description: "Wipe transition moving up",
    defaultDuration: 0.5,
    minDuration: 0.1,
    maxDuration: 2,
    usesXfade: true,
    xfadeName: "wipeup",
    category: "wipe",
  },
  wipeDown: {
    type: "wipeDown",
    name: "Wipe Down",
    description: "Wipe transition moving down",
    defaultDuration: 0.5,
    minDuration: 0.1,
    maxDuration: 2,
    usesXfade: true,
    xfadeName: "wipedown",
    category: "wipe",
  },
  blur: {
    type: "blur",
    name: "Blur",
    description: "Blur out then in",
    defaultDuration: 0.5,
    minDuration: 0.2,
    maxDuration: 1.5,
    usesXfade: true,
    xfadeName: "fadeblack",
    category: "creative",
  },
  pixelize: {
    type: "pixelize",
    name: "Pixelize",
    description: "Pixelation transition effect",
    defaultDuration: 0.4,
    minDuration: 0.2,
    maxDuration: 1.5,
    usesXfade: true,
    xfadeName: "pixelize",
    category: "creative",
  },
  rotate: {
    type: "rotate",
    name: "Rotate",
    description: "Rotate to next clip",
    defaultDuration: 0.5,
    minDuration: 0.2,
    maxDuration: 1.5,
    usesXfade: true,
    xfadeName: "horzopen",
    category: "creative",
  },
  flip: {
    type: "flip",
    name: "Flip",
    description: "Flip transition between clips",
    defaultDuration: 0.4,
    minDuration: 0.2,
    maxDuration: 1.5,
    usesXfade: true,
    xfadeName: "vertopen",
    category: "creative",
  },
  glitch: {
    type: "glitch",
    name: "Glitch",
    description: "Glitchy digital transition (TikTok style)",
    defaultDuration: 0.2,
    minDuration: 0.1,
    maxDuration: 0.5,
    usesXfade: true,
    xfadeName: "diagtl",
    category: "shortform",
  },
  flash: {
    type: "flash",
    name: "Flash",
    description: "Quick white flash between clips",
    defaultDuration: 0.15,
    minDuration: 0.05,
    maxDuration: 0.5,
    usesXfade: true,
    xfadeName: "fadewhite",
    category: "shortform",
  },
  shake: {
    type: "shake",
    name: "Shake",
    description: "Camera shake effect on cut",
    defaultDuration: 0.2,
    minDuration: 0.1,
    maxDuration: 0.5,
    usesXfade: true,
    xfadeName: "diagbr",
    category: "shortform",
  },
};

// ============================================================================
// Transition Utilities
// ============================================================================

/**
 * Create a transition with validated duration
 */
export function createTransition(
  type: TransitionType,
  duration?: number,
  easing?: Transition["easing"]
): Transition {
  const def = TRANSITION_DEFINITIONS[type];

  let finalDuration = duration ?? def.defaultDuration;
  finalDuration = Math.max(def.minDuration, Math.min(def.maxDuration, finalDuration));

  return {
    type,
    duration: finalDuration,
    easing: easing ?? "easeInOut",
  };
}

/**
 * Get recommended transitions for short-form content
 */
export function getShortFormTransitions(): Transition[] {
  return [
    TRANSITION_PRESETS.quickFade,
    TRANSITION_PRESETS.flash,
    TRANSITION_PRESETS.glitch,
    createTransition("slideUp", 0.3),
    createTransition("zoomIn", 0.3),
  ];
}

/**
 * Calculate total duration reduction from transitions
 */
export function calculateTransitionOverlap(transitions: Transition[]): number {
  return transitions.reduce((total, t) => total + t.duration, 0);
}
