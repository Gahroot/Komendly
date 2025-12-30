/**
 * Concatenate Module
 * Video concatenation with or without transitions
 */

import type { VideoClip, Transition, OutputConfig, AspectRatio, Resolution } from "./types";
import { DEFAULTS, getDimensions } from "./config";
import { createTransition, TRANSITION_DEFINITIONS } from "./transitions";
import { getClipDuration } from "./cuts";

// ============================================================================
// Concatenation Configuration
// ============================================================================

export interface ConcatConfig {
  /** Video clips to concatenate */
  clips: VideoClip[];
  /** Transitions between clips (length = clips.length - 1) */
  transitions?: Transition[];
  /** Default transition to use when not specified */
  defaultTransition?: Transition;
  /** Output configuration */
  output: OutputConfig;
}

export interface ConcatResult {
  /** Generated FFmpeg filter complex string */
  filterComplex: string;
  /** Input file arguments */
  inputs: string[];
  /** Output arguments */
  outputArgs: string[];
  /** Estimated output duration */
  estimatedDuration: number;
  /** Video output label */
  videoOutputLabel: string;
  /** Audio output label */
  audioOutputLabel: string;
}

// ============================================================================
// Concatenation Logic
// ============================================================================

/**
 * Build concatenation configuration
 */
export function buildConcatConfig(
  clips: VideoClip[],
  options?: {
    transitions?: Transition[];
    defaultTransition?: Transition;
    output?: Partial<OutputConfig>;
  }
): ConcatConfig {
  const defaultTrans = options?.defaultTransition ?? DEFAULTS.transition;
  const numTransitions = Math.max(0, clips.length - 1);

  const transitions: Transition[] = [];
  for (let i = 0; i < numTransitions; i++) {
    transitions.push(options?.transitions?.[i] ?? defaultTrans);
  }

  return {
    clips,
    transitions,
    defaultTransition: defaultTrans,
    output: {
      path: options?.output?.path ?? "./output.mp4",
      format: options?.output?.format ?? DEFAULTS.format,
      aspectRatio: options?.output?.aspectRatio ?? DEFAULTS.aspectRatio,
      resolution: options?.output?.resolution ?? DEFAULTS.resolution,
      fps: options?.output?.fps ?? DEFAULTS.fps,
      quality: options?.output?.quality ?? "high",
      ...options?.output,
    },
  };
}

/**
 * Calculate total output duration accounting for transitions
 */
export function calculateOutputDuration(config: ConcatConfig): number {
  const clipDurations = config.clips.map(getClipDuration);
  const totalClipDuration = clipDurations.reduce((sum, d) => sum + d, 0);

  const transitionOverlap = config.transitions?.reduce((sum, t) => sum + t.duration, 0) ?? 0;

  return totalClipDuration - transitionOverlap;
}

// ============================================================================
// FFmpeg Filter Generation
// ============================================================================

/**
 * Generate xfade transition between two clips
 */
export function generateXfadeFilter(
  input1: string,
  input2: string,
  transition: Transition,
  offset: number,
  outputLabel: string
): string {
  const def = TRANSITION_DEFINITIONS[transition.type];

  if (!def.usesXfade || transition.type === "none" || transition.duration === 0) {
    return `[${input1}][${input2}]concat=n=2:v=1:a=0[${outputLabel}]`;
  }

  const xfadeName = def.xfadeName || "fade";

  return (
    `[${input1}][${input2}]xfade=` +
    `transition=${xfadeName}:` +
    `duration=${transition.duration}:` +
    `offset=${offset}[${outputLabel}]`
  );
}

/**
 * Generate audio crossfade between two clips
 */
export function generateAcrossfadeFilter(
  input1: string,
  input2: string,
  duration: number,
  outputLabel: string
): string {
  if (duration === 0) {
    return `[${input1}][${input2}]concat=n=2:v=0:a=1[${outputLabel}]`;
  }

  return `[${input1}][${input2}]acrossfade=d=${duration}:c1=tri:c2=tri[${outputLabel}]`;
}

/**
 * Generate complete filter complex for concatenation with transitions
 */
export function generateConcatFilterComplex(config: ConcatConfig): ConcatResult {
  const clips = config.clips;
  const transitions = config.transitions || [];
  const output = config.output;

  if (clips.length === 0) {
    throw new Error("At least one clip is required");
  }

  const filterParts: string[] = [];
  const inputs: string[] = [];
  const dims = getDimensions(
    output.aspectRatio ?? DEFAULTS.aspectRatio,
    output.resolution ?? DEFAULTS.resolution
  );

  // Add inputs
  clips.forEach((clip) => {
    inputs.push("-i", clip.source);
  });

  // Step 1: Process each clip (trim, scale, format)
  clips.forEach((clip, i) => {
    const hasTrims = clip.startTime !== undefined && clip.endTime !== undefined;

    // Video processing
    let videoFilter = `[${i}:v]`;

    if (hasTrims) {
      videoFilter += `trim=start=${clip.startTime}:end=${clip.endTime},setpts=PTS-STARTPTS,`;
    }

    videoFilter +=
      `scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease,` +
      `pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2:black,` +
      `setsar=1,fps=${output.fps ?? 30},format=yuv420p[v${i}]`;

    filterParts.push(videoFilter);

    // Audio processing
    let audioFilter = `[${i}:a]`;

    if (hasTrims) {
      audioFilter += `atrim=start=${clip.startTime}:end=${clip.endTime},asetpts=PTS-STARTPTS,`;
    }

    if (clip.muted) {
      audioFilter += `volume=0,`;
    } else if (clip.volume !== undefined && clip.volume !== 1) {
      audioFilter += `volume=${clip.volume},`;
    }

    audioFilter += `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`;

    filterParts.push(audioFilter);
  });

  // Step 2: Apply transitions (video)
  if (clips.length === 1) {
    filterParts.push("[v0]copy[outv]");
    filterParts.push("[a0]acopy[outa]");
  } else {
    const clipDurations = clips.map(getClipDuration);
    let currentVideoLabel = "v0";
    let currentAudioLabel = "a0";
    let runningDuration = clipDurations[0];

    for (let i = 0; i < clips.length - 1; i++) {
      const transition = transitions[i] ?? createTransition("none");
      const nextVideoLabel = `v${i + 1}`;
      const nextAudioLabel = `a${i + 1}`;
      const isLast = i === clips.length - 2;
      const outVideoLabel = isLast ? "outv" : `xv${i}`;
      const outAudioLabel = isLast ? "outa" : `xa${i}`;

      const offset = runningDuration - transition.duration;

      const videoXfade = generateXfadeFilter(
        currentVideoLabel,
        nextVideoLabel,
        transition,
        offset,
        outVideoLabel
      );
      filterParts.push(videoXfade);

      const audioXfade = generateAcrossfadeFilter(
        currentAudioLabel,
        nextAudioLabel,
        transition.duration,
        outAudioLabel
      );
      filterParts.push(audioXfade);

      currentVideoLabel = outVideoLabel;
      currentAudioLabel = outAudioLabel;
      runningDuration = runningDuration - transition.duration + clipDurations[i + 1];
    }
  }

  // Build output arguments
  const outputArgs: string[] = [];
  outputArgs.push("-c:v", "libx264");
  outputArgs.push("-preset", "medium");
  // Ensure browser-compatible H.264 encoding (High profile with yuv420p)
  outputArgs.push("-profile:v", "high");
  outputArgs.push("-pix_fmt", "yuv420p");
  outputArgs.push(
    "-crf",
    output.quality === "best" ? "18" : output.quality === "high" ? "20" : "23"
  );

  if (output.videoBitrate) {
    outputArgs.push("-b:v", output.videoBitrate);
  }

  outputArgs.push("-c:a", "aac");
  outputArgs.push("-b:a", output.audioBitrate ?? "192k");
  outputArgs.push("-movflags", "+faststart");
  outputArgs.push("-y");

  return {
    filterComplex: filterParts.join(";\n"),
    inputs,
    outputArgs,
    estimatedDuration: calculateOutputDuration(config),
    videoOutputLabel: "outv",
    audioOutputLabel: "outa",
  };
}

// ============================================================================
// Command Generation
// ============================================================================

/**
 * Generate complete FFmpeg command for concatenation
 */
export function generateConcatCommand(config: ConcatConfig): string[] {
  const result = generateConcatFilterComplex(config);

  const command = [
    "ffmpeg",
    ...result.inputs,
    "-filter_complex",
    result.filterComplex,
    "-map",
    `[${result.videoOutputLabel}]`,
    "-map",
    `[${result.audioOutputLabel}]`,
    ...result.outputArgs,
    config.output.path,
  ];

  return command;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick concatenation without transitions
 */
export function simpleConcatConfig(
  sources: string[],
  outputPath: string,
  options?: {
    aspectRatio?: AspectRatio;
    resolution?: Resolution;
  }
): ConcatConfig {
  const clips: VideoClip[] = sources.map((source, i) => ({
    id: `clip-${i}`,
    source,
  }));

  return buildConcatConfig(clips, {
    transitions: sources.slice(1).map(() => createTransition("none")),
    output: {
      path: outputPath,
      aspectRatio: options?.aspectRatio,
      resolution: options?.resolution,
    },
  });
}

/**
 * Concatenation with uniform transitions
 */
export function uniformTransitionConfig(
  sources: string[],
  outputPath: string,
  transition: Transition,
  options?: {
    aspectRatio?: AspectRatio;
    resolution?: Resolution;
  }
): ConcatConfig {
  const clips: VideoClip[] = sources.map((source, i) => ({
    id: `clip-${i}`,
    source,
  }));

  return buildConcatConfig(clips, {
    defaultTransition: transition,
    output: {
      path: outputPath,
      aspectRatio: options?.aspectRatio,
      resolution: options?.resolution,
    },
  });
}

/**
 * Create config for TikTok/Reels style video
 */
export function shortFormConcatConfig(
  sources: string[],
  outputPath: string,
  options?: {
    transitionStyle?: "none" | "quick" | "flashy";
    /** Clip durations in seconds - REQUIRED for xfade transitions */
    durations?: number[];
  }
): ConcatConfig {
  const style = options?.transitionStyle ?? "quick";
  const durations = options?.durations;

  // If no durations provided, fall back to simple concat (no transitions)
  // to avoid the xfade timing bug
  const hasDurations = durations && durations.length === sources.length;
  const effectiveStyle = hasDurations ? style : "none";

  let transition: Transition;
  switch (effectiveStyle) {
    case "none":
      transition = createTransition("none");
      break;
    case "flashy":
      transition = createTransition("flash", 0.15);
      break;
    case "quick":
    default:
      transition = createTransition("fade", 0.2);
      break;
  }

  const clips: VideoClip[] = sources.map((source, i) => ({
    id: `clip-${i}`,
    source,
    duration: durations?.[i],
  }));

  return buildConcatConfig(clips, {
    defaultTransition: transition,
    output: {
      path: outputPath,
      aspectRatio: "9:16",
      resolution: "1080p",
      fps: 30,
      quality: "high",
    },
  });
}
