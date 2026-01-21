/**
 * KIE.ai API Types
 * Types for the Veo 3.1 video generation API
 *
 * API Documentation: https://docs.kie.ai/veo3-api/generate-veo-3-video
 */

// ============================================================================
// Request Types
// ============================================================================

/** Video generation model */
export type KieModel = "veo3" | "veo3_fast";

/** Video generation type */
export type KieGenerationType =
  | "TEXT_2_VIDEO"
  | "FIRST_AND_LAST_FRAMES_2_VIDEO"
  | "REFERENCE_2_VIDEO";

/** Supported aspect ratios */
export type KieAspectRatio = "16:9" | "9:16" | "Auto";

/**
 * Request body for video generation
 */
export interface KieGenerateRequest {
  /** Detailed description of desired video content */
  prompt: string;
  /** 1-2 images for image-to-video modes */
  imageUrls?: string[];
  /** Model to use: veo3 (quality) or veo3_fast (cost-efficient) */
  model: KieModel;
  /** Generation type */
  generationType: KieGenerationType;
  /** Aspect ratio of output video */
  aspect_ratio?: KieAspectRatio;
  /** Seed for reproducibility (10000-99999) */
  seeds?: number;
  /** Brand watermark text */
  watermark?: string;
  /** Webhook URL for completion notifications */
  callBackUrl?: string;
  /** Auto-translate prompts to English (default: true) */
  enableTranslation?: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response from generate endpoint
 */
export interface KieGenerateResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

/**
 * Task status values
 * 0 = processing, 1 = completed, 2 = failed, 3 = generation failed after task creation
 */
export type KieSuccessFlag = 0 | 1 | 2 | 3;

/**
 * Response from status check endpoint
 */
export interface KieStatusResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    successFlag: KieSuccessFlag;
    completeTime?: string;
    errorCode?: number;
    errorMessage?: string;
    response?: {
      /** Video URLs for 16:9 aspect ratio */
      resultUrls?: string[];
      /** Video URLs for other aspect ratios */
      originUrls?: string[];
    };
  };
}

// ============================================================================
// Client Types
// ============================================================================

/**
 * Options for video generation
 */
export interface KieVideoOptions {
  /** Reference image URL (for image-to-video) */
  imageUrl?: string;
  /** Text prompt describing the video */
  prompt: string;
  /** Aspect ratio (default: 9:16) */
  aspectRatio?: KieAspectRatio;
  /** Use quality model instead of fast (default: false) */
  useQualityModel?: boolean;
  /** Webhook URL for completion notification */
  callbackUrl?: string;
}

/**
 * Result from video generation
 */
export interface KieVideoResult {
  /** Video URL */
  videoUrl: string;
  /** Task ID */
  taskId: string;
  /** Generation duration in seconds (estimated) */
  duration?: number;
}

/**
 * Status check result
 */
export interface KieStatusResult {
  /** Whether the task is complete */
  isComplete: boolean;
  /** Whether the task succeeded */
  isSuccess: boolean;
  /** Whether the task failed */
  isFailed: boolean;
  /** Video URL (if complete and successful) */
  videoUrl?: string;
  /** Error message (if failed) */
  error?: string;
}
