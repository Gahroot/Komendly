/**
 * Video Editor Configuration
 * Presets, defaults, and configuration helpers
 */

import type {
  AspectRatio,
  Resolution,
  ResolutionDimensions,
  Transition,
  TransitionType,
  OutputConfig,
  VideoFormat,
} from "./types";

// ============================================================================
// Resolution Mappings
// ============================================================================

/** Resolution dimensions for each preset */
export const RESOLUTION_MAP: Record<Resolution, ResolutionDimensions> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "4k": { width: 3840, height: 2160 },
};

/** Get dimensions for aspect ratio and resolution */
export function getDimensions(
  aspectRatio: AspectRatio,
  resolution: Resolution
): ResolutionDimensions {
  const base = RESOLUTION_MAP[resolution];

  switch (aspectRatio) {
    case "9:16": // Vertical (TikTok, Reels, Shorts)
      return { width: base.height, height: base.width };
    case "16:9": // Horizontal (YouTube)
      return { width: base.width, height: base.height };
    case "1:1": // Square (Instagram)
      return { width: base.height, height: base.height };
    case "4:5": // Portrait (Instagram Feed)
      return { width: Math.round(base.height * (4 / 5)), height: base.height };
    default:
      return base;
  }
}

// ============================================================================
// Platform Presets
// ============================================================================

/** Platform-specific presets */
export const PLATFORM_PRESETS = {
  tiktok: {
    aspectRatio: "9:16" as AspectRatio,
    resolution: "1080p" as Resolution,
    fps: 30,
    maxDuration: 180,
    videoBitrate: "8M",
    audioBitrate: "192k",
  },
  reels: {
    aspectRatio: "9:16" as AspectRatio,
    resolution: "1080p" as Resolution,
    fps: 30,
    maxDuration: 90,
    videoBitrate: "8M",
    audioBitrate: "192k",
  },
  shorts: {
    aspectRatio: "9:16" as AspectRatio,
    resolution: "1080p" as Resolution,
    fps: 30,
    maxDuration: 60,
    videoBitrate: "8M",
    audioBitrate: "192k",
  },
  youtube: {
    aspectRatio: "16:9" as AspectRatio,
    resolution: "1080p" as Resolution,
    fps: 30,
    maxDuration: null,
    videoBitrate: "10M",
    audioBitrate: "256k",
  },
} as const;

export type Platform = keyof typeof PLATFORM_PRESETS;

/** Get output config for a platform */
export function getOutputConfigForPlatform(
  platform: Platform,
  outputPath: string
): OutputConfig {
  const preset = PLATFORM_PRESETS[platform];
  return {
    path: outputPath,
    format: "mp4",
    aspectRatio: preset.aspectRatio,
    resolution: preset.resolution,
    fps: preset.fps,
    videoBitrate: preset.videoBitrate,
    audioBitrate: preset.audioBitrate,
    quality: "high",
  };
}

// ============================================================================
// Transition Presets
// ============================================================================

/** Quick transition presets */
export const TRANSITION_PRESETS = {
  none: { type: "none", duration: 0 } as Transition,
  quickFade: { type: "fade", duration: 0.3, easing: "easeInOut" } as Transition,
  crossfade: { type: "crossfade", duration: 0.5, easing: "easeInOut" } as Transition,
  slideLeft: { type: "slideLeft", duration: 0.4, easing: "easeOut" } as Transition,
  glitch: { type: "glitch", duration: 0.2, easing: "linear" } as Transition,
  flash: { type: "flash", duration: 0.15, easing: "linear" } as Transition,
  zoomIn: { type: "zoomIn", duration: 0.4, easing: "easeOut" } as Transition,
} as const;

export type TransitionPreset = keyof typeof TRANSITION_PRESETS;

/** All available transition types */
export const AVAILABLE_TRANSITIONS: TransitionType[] = [
  "none",
  "fade",
  "crossfade",
  "slideLeft",
  "slideRight",
  "slideUp",
  "slideDown",
  "zoomIn",
  "zoomOut",
  "wipeLeft",
  "wipeRight",
  "wipeUp",
  "wipeDown",
  "blur",
  "pixelize",
  "rotate",
  "flip",
  "glitch",
  "flash",
  "shake",
];

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULTS = {
  format: "mp4" as VideoFormat,
  aspectRatio: "9:16" as AspectRatio,
  resolution: "1080p" as Resolution,
  fps: 30,
  transition: TRANSITION_PRESETS.quickFade,
  volume: 1.0,
  musicVolume: 0.3,
  audioFadeDuration: 1.0,
} as const;

// ============================================================================
// Validation Helpers
// ============================================================================

/** Validate aspect ratio */
export function isValidAspectRatio(value: string): value is AspectRatio {
  return ["9:16", "16:9", "1:1", "4:5"].includes(value);
}

/** Validate resolution */
export function isValidResolution(value: string): value is Resolution {
  return ["720p", "1080p", "4k"].includes(value);
}

/** Validate transition type */
export function isValidTransitionType(value: string): value is TransitionType {
  return AVAILABLE_TRANSITIONS.includes(value as TransitionType);
}

/** Get file extension for format */
export function getFileExtension(format: VideoFormat): string {
  return `.${format}`;
}
