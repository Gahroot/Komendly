/**
 * FAL Lip-Sync Module
 * Complete lip-synced video generation using TTS + SadTalker
 */

// Types
export type {
  FalActorData,
  ClipType,
  ClipStatus,
  CompositeStatus,
  ScriptSegment,
  SegmentationResult,
  TTSVoice,
  TTSOptions,
  TTSResult,
  SadTalkerInput,
  SadTalkerResult,
  ClipGenerationRequest,
  ClipGenerationResult,
  CompositeGenerationRequest,
  CompositeGenerationResult,
  ClipProgress,
  FalGenerateStartResponse,
  FalGenerateStatusResponse,
  FalActorsResponse,
} from "./types";

// TTS Generator
export {
  TTS_VOICES,
  DEFAULT_VOICE,
  DEFAULT_MODEL,
  generateTTS,
  generateTTSWithUpload,
  estimateAudioDuration,
  getRecommendedVoice,
  validateTTSText,
} from "./tts-generator";

// SadTalker
export {
  SADTALKER_MODEL,
  configureFalClient,
  generateLipSyncVideo,
  generateLipSyncVideoWithProgress,
  submitSadTalkerJob,
  checkSadTalkerStatus,
  validateImageUrl,
  validateAudioUrl,
} from "./sadtalker";

// Script Segmenter
export {
  estimateDuration,
  wordsForDuration,
  segmentScript,
  simpleSegmentScript,
  validateSegmentation,
} from "./script-segmenter";

// Video Editor (re-export commonly used functions)
export {
  createVideoClip,
  batchCreateClips,
  getClipDuration,
  calculateTotalDuration,
  buildConcatConfig,
  generateConcatCommand,
  shortFormConcatConfig,
  createTransition,
  DEFAULTS as VIDEO_DEFAULTS,
} from "./video-editor";

// Clip Processor
export {
  processClip,
  processCompositeVideo,
  startBackgroundProcessing,
  processPendingVideos,
} from "./clip-processor";

// Video Stitcher
export {
  stitchVideos,
  simpleConcatVideos,
} from "./video-stitcher";
export type { StitchInput, StitchResult } from "./video-stitcher";

// Live Avatar (Higher Quality Alternative to SadTalker)
export {
  LIVE_AVATAR_MODEL,
  LATENTSYNC_MODEL,
  generateLiveAvatarVideo,
  generateLatentSyncVideo,
  calculateNumClips,
  estimateLiveAvatarCost,
  estimateLatentSyncCost,
} from "./live-avatar";
export type {
  LiveAvatarInput,
  LiveAvatarResult,
  LatentSyncInput,
  LatentSyncResult,
} from "./live-avatar";

// VEO 3.1 Fast (Best Quality - Excellent Lip Sync)
export {
  VEO3_IMAGE_TO_VIDEO_MODEL,
  VEO3_TEXT_TO_VIDEO_MODEL,
  generateVeo3Video,
  buildTestimonialPrompt,
  calculateOptimalDuration,
  estimateVeo3Cost,
  getMaxWordCount,
} from "./veo3";
export type {
  Veo3AspectRatio,
  Veo3Duration,
  Veo3Resolution,
  Veo3ImageToVideoInput,
  Veo3VideoResult,
} from "./veo3";

// Frame Extractor (for frame continuity between clips)
export {
  extractLastFrame,
  extractFrameAt,
} from "./frame-extractor";
export type {
  FrameExtractionResult,
  ExtractFrameOptions,
} from "./frame-extractor";
