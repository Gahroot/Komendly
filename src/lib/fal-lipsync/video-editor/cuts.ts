/**
 * Cuts Module
 * Video trimming, cutting, and segment extraction utilities
 */

import type { VideoClip, CutSegment, CutConfig } from "./types";

// ============================================================================
// Video Clip Creation
// ============================================================================

/**
 * Create a video clip configuration
 */
export function createVideoClip(options: {
  id?: string;
  source: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
}): VideoClip {
  return {
    id: options.id || `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    source: options.source,
    startTime: options.startTime,
    endTime: options.endTime,
    duration: options.duration,
    volume: options.volume ?? 1.0,
    muted: options.muted ?? false,
  };
}

/**
 * Create a trimmed clip from a source video
 */
export function trimClip(
  source: string,
  startTime: number,
  endTime: number,
  options?: {
    id?: string;
    volume?: number;
    muted?: boolean;
  }
): VideoClip {
  return createVideoClip({
    id: options?.id,
    source,
    startTime,
    endTime,
    duration: endTime - startTime,
    volume: options?.volume,
    muted: options?.muted,
  });
}

/**
 * Create multiple clips from a single source with multiple trim points
 */
export function splitIntoClips(
  source: string,
  timestamps: Array<{ start: number; end: number }>,
  options?: {
    volume?: number;
    muted?: boolean;
  }
): VideoClip[] {
  return timestamps.map((ts, index) =>
    trimClip(source, ts.start, ts.end, {
      id: `clip-${index + 1}`,
      volume: options?.volume,
      muted: options?.muted,
    })
  );
}

// ============================================================================
// Cut Operations
// ============================================================================

/**
 * Define segments to keep from a video
 */
export function createKeepSegments(
  source: string,
  keepRanges: Array<{ start: number; end: number }>
): CutConfig {
  const segments: CutSegment[] = keepRanges.map((range) => ({
    startTime: range.start,
    endTime: range.end,
    action: "keep",
  }));

  return {
    source: createVideoClip({ source }),
    segments,
  };
}

/**
 * Convert cut config to array of video clips
 */
export function cutConfigToClips(config: CutConfig): VideoClip[] {
  const keepSegments = config.segments.filter((s) => s.action === "keep");

  return keepSegments.map((segment, index) =>
    createVideoClip({
      id: `${config.source.id}-segment-${index + 1}`,
      source: config.source.source,
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration: segment.endTime - segment.startTime,
      volume: config.source.volume,
      muted: config.source.muted,
    })
  );
}

// ============================================================================
// Clip Validation
// ============================================================================

/**
 * Calculate effective duration of a clip
 */
export function getClipDuration(clip: VideoClip): number {
  if (clip.duration !== undefined) {
    return clip.duration;
  }

  if (clip.startTime !== undefined && clip.endTime !== undefined) {
    return clip.endTime - clip.startTime;
  }

  return 0;
}

/**
 * Validate clip timing
 */
export function validateClip(clip: VideoClip): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (clip.startTime !== undefined && clip.startTime < 0) {
    errors.push("Start time cannot be negative");
  }

  if (clip.endTime !== undefined && clip.startTime !== undefined) {
    if (clip.endTime <= clip.startTime) {
      errors.push("End time must be greater than start time");
    }
  }

  if (clip.duration !== undefined && clip.duration <= 0) {
    errors.push("Duration must be positive");
  }

  if (clip.volume !== undefined && (clip.volume < 0 || clip.volume > 2)) {
    errors.push("Volume should be between 0 and 2");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Create clips from a list of sources
 */
export function batchCreateClips(
  sources: string[],
  options?: {
    startTime?: number;
    duration?: number;
    volume?: number;
    muted?: boolean;
  }
): VideoClip[] {
  return sources.map((source, index) =>
    createVideoClip({
      id: `clip-${index + 1}`,
      source,
      startTime: options?.startTime,
      endTime:
        options?.startTime !== undefined && options?.duration !== undefined
          ? options.startTime + options.duration
          : undefined,
      duration: options?.duration,
      volume: options?.volume,
      muted: options?.muted,
    })
  );
}

/**
 * Calculate total duration of clips
 */
export function calculateTotalDuration(clips: VideoClip[]): number {
  return clips.reduce((total, clip) => total + getClipDuration(clip), 0);
}
