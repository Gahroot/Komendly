/**
 * FAL Lip-Sync Types
 * Core TypeScript interfaces for lip-synced video generation
 */

// ============================================================================
// Actor Types
// ============================================================================

export interface FalActorData {
  id: string;
  name: string;
  slug: string;
  gender: "male" | "female";
  style: string;
  referenceImageUrl: string;
  thumbnailUrl: string;
  voiceId?: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

// ============================================================================
// Generation Types
// ============================================================================

export type ClipType = "hook" | "testimonial" | "cta";

export type ClipStatus =
  | "pending"
  | "generating_audio"
  | "generating_video"
  | "completed"
  | "failed";

export type CompositeStatus =
  | "pending"
  | "generating_clips"
  | "stitching"
  | "completed"
  | "failed";

export interface ScriptSegment {
  type: ClipType;
  content: string;
  estimatedDuration: number;
  order: number;
}

export interface SegmentationResult {
  segments: ScriptSegment[];
  totalDuration: number;
  clipCount: number;
}

// ============================================================================
// TTS Types
// ============================================================================

export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export interface TTSOptions {
  voice: TTSVoice;
  model?: "tts-1" | "tts-1-hd";
  speed?: number;
}

export interface TTSResult {
  audioBuffer: Buffer;
  audioUrl?: string;
  duration?: number;
}

// ============================================================================
// SadTalker Types
// ============================================================================

export interface SadTalkerInput {
  sourceImageUrl: string;
  drivenAudioUrl: string;
  faceModelResolution?: "256" | "512";
  expressionScale?: number;
  preprocess?: "crop" | "resize" | "full";
}

export interface SadTalkerResult {
  videoUrl: string;
  duration?: number;
  requestId?: string;
}

// ============================================================================
// Composite Video Types
// ============================================================================

export interface ClipGenerationRequest {
  compositeVideoId: string;
  clipType: ClipType;
  clipIndex: number;
  scriptContent: string;
  actorImageUrl: string;
  voiceId: TTSVoice;
}

export interface ClipGenerationResult {
  clipId: string;
  videoUrl: string;
  audioUrl: string;
  duration: number;
  status: ClipStatus;
}

export interface CompositeGenerationRequest {
  reviewId: string;
  actorId: string;
  targetDuration?: number;
  aspectRatio?: "9:16" | "16:9";
  voiceId?: TTSVoice;
  useAIScript?: boolean;
  customScript?: string;
}

export interface CompositeGenerationResult {
  compositeVideoId: string;
  status: CompositeStatus;
  progress: number;
  clips: ClipProgress[];
  finalVideoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface ClipProgress {
  type: ClipType;
  index: number;
  status: ClipStatus;
  progress: number;
  videoUrl?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface FalGenerateStartResponse {
  success: boolean;
  compositeVideoId: string;
  status: CompositeStatus;
  estimatedTime?: number;
  error?: string;
}

export interface FalGenerateStatusResponse {
  compositeVideoId: string;
  status: CompositeStatus;
  progress: number;
  currentClip: number;
  totalClips: number;
  clips: ClipProgress[];
  finalVideoUrl?: string;
  thumbnailUrl?: string;
  actualDuration?: number;
  error?: string;
}

export interface FalActorsResponse {
  actors: FalActorData[];
  total: number;
}
