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
