/**
 * Video Editor Module
 * FFmpeg-based video editing utilities for stitching lip-synced clips
 */

// Types
export type {
  VideoFormat,
  AudioFormat,
  AspectRatio,
  Resolution,
  ResolutionDimensions,
  VideoClip,
  AudioTrack,
  TransitionType,
  Transition,
  CutSegment,
  CutConfig,
  PipelineConfig,
  OutputConfig,
  EditResult,
  ProgressInfo,
  ProgressCallback,
} from "./types";

// Config
export {
  RESOLUTION_MAP,
  getDimensions,
  PLATFORM_PRESETS,
  getOutputConfigForPlatform,
  TRANSITION_PRESETS,
  AVAILABLE_TRANSITIONS,
  DEFAULTS,
  isValidAspectRatio,
  isValidResolution,
  isValidTransitionType,
  getFileExtension,
} from "./config";
export type { Platform, TransitionPreset } from "./config";

// Transitions
export {
  TRANSITION_DEFINITIONS,
  createTransition,
  getShortFormTransitions,
  calculateTransitionOverlap,
} from "./transitions";
export type { TransitionDefinition } from "./transitions";

// Cuts
export {
  createVideoClip,
  trimClip,
  splitIntoClips,
  createKeepSegments,
  cutConfigToClips,
  getClipDuration,
  validateClip,
  batchCreateClips,
  calculateTotalDuration,
} from "./cuts";

// Concatenate
export {
  buildConcatConfig,
  calculateOutputDuration,
  generateXfadeFilter,
  generateAcrossfadeFilter,
  generateConcatFilterComplex,
  generateConcatCommand,
  simpleConcatConfig,
  uniformTransitionConfig,
  shortFormConcatConfig,
} from "./concatenate";
export type { ConcatConfig, ConcatResult } from "./concatenate";
