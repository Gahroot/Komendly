/**
 * Live Avatar Client
 * FAL AI Live Avatar integration for high-quality talking video generation
 *
 * Much higher quality than SadTalker - generates full talking avatars
 * with natural movement and expressions, not just animated mouths.
 *
 * Pricing: $0.01 per video second
 */

import { fal } from "@fal-ai/client";
import { logger } from "@/lib/logger";
import { configureFalClient } from "./sadtalker";

// ============================================================================
// Configuration
// ============================================================================

/** FAL Live Avatar model ID */
export const LIVE_AVATAR_MODEL = "fal-ai/live-avatar";

/** FAL LatentSync model ID (for video + audio lip sync) */
export const LATENTSYNC_MODEL = "fal-ai/latentsync";

// ============================================================================
// Types
// ============================================================================

export interface LiveAvatarInput {
  /** URL of the reference image (front-facing portrait) */
  imageUrl: string;
  /** URL of the driving audio file (WAV or MP3) */
  audioUrl: string;
  /** Text prompt describing the scene/character style */
  prompt?: string;
  /** Number of 3-second clips to generate (1-100, default 10) */
  numClips?: number;
  /** Frames per clip (16-80, multiples of 4, default 48) */
  framesPerClip?: number;
  /** Guidance scale for prompt adherence (0-10, default 0) */
  guidanceScale?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Acceleration mode for faster decoding */
  acceleration?: "none" | "light" | "regular" | "high";
}

export interface LiveAvatarResult {
  videoUrl: string;
  requestId: string;
  duration?: number;
}

export interface LatentSyncInput {
  /** URL of the source video */
  videoUrl: string;
  /** URL of the driving audio */
  audioUrl: string;
  /** Guidance scale (1-2, default 1) */
  guidanceScale?: number;
  /** Random seed */
  seed?: number;
  /** Loop mode when audio > video: "pingpong" or "loop" */
  loopMode?: "pingpong" | "loop";
}

export interface LatentSyncResult {
  videoUrl: string;
  requestId: string;
}

// ============================================================================
// FAL API Types
// ============================================================================

interface FalLiveAvatarInput {
  image_url: string;
  audio_url: string;
  prompt: string;
  num_clips?: number;
  frames_per_clip?: number;
  guidance_scale?: number;
  seed?: number;
  enable_safety_checker?: boolean;
  acceleration?: "none" | "light" | "regular" | "high";
}

interface FalLiveAvatarOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
    width?: number;
    height?: number;
    fps?: number;
    duration?: number;
  };
}

interface FalLatentSyncInput {
  video_url: string;
  audio_url: string;
  guidance_scale?: number;
  seed?: number;
  loop_mode?: "pingpong" | "loop";
}

interface FalLatentSyncOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

// ============================================================================
// Live Avatar Generation (Image + Audio → Video)
// ============================================================================

/**
 * Generate talking video using Live Avatar
 * Takes an image and audio, produces a full talking video with natural movement
 */
export async function generateLiveAvatarVideo(
  input: LiveAvatarInput
): Promise<LiveAvatarResult> {
  logger.info(
    {
      imageUrl: input.imageUrl.substring(0, 50) + "...",
      audioUrl: input.audioUrl.substring(0, 50) + "...",
      numClips: input.numClips,
    },
    "Starting Live Avatar video generation"
  );

  configureFalClient();

  // Calculate num_clips based on expected audio duration
  // Each clip is ~3 seconds, so for a 15 second video we need ~5 clips
  const numClips = input.numClips ?? 5;

  const falInput: FalLiveAvatarInput = {
    image_url: input.imageUrl,
    audio_url: input.audioUrl,
    prompt: input.prompt ?? "A person speaking naturally to the camera in a professional setting",
    num_clips: numClips,
    frames_per_clip: input.framesPerClip ?? 48,
    guidance_scale: input.guidanceScale ?? 0,
    seed: input.seed,
    enable_safety_checker: true,
    acceleration: input.acceleration ?? "regular",
  };

  try {
    const result = await fal.subscribe(LIVE_AVATAR_MODEL, {
      input: falInput,
      logs: true,
      onQueueUpdate: (update) => {
        logger.debug({ status: update.status }, "Live Avatar queue update");
      },
    });

    const output = result.data as FalLiveAvatarOutput;

    if (!output?.video?.url) {
      throw new Error("Live Avatar did not return a video URL");
    }

    logger.info(
      {
        videoUrl: output.video.url.substring(0, 50) + "...",
        duration: output.video.duration,
      },
      "Live Avatar video generated successfully"
    );

    return {
      videoUrl: output.video.url,
      requestId: result.requestId,
      duration: output.video.duration,
    };
  } catch (error) {
    logger.error({ error }, "Live Avatar video generation failed");
    throw error;
  }
}

// ============================================================================
// LatentSync Generation (Video + Audio → Lip-Synced Video)
// ============================================================================

/**
 * Generate lip-synced video using LatentSync
 * Takes a video and audio, applies high-quality lip sync
 *
 * Pricing: $0.20 for up to 40 seconds, $0.005/sec after
 */
export async function generateLatentSyncVideo(
  input: LatentSyncInput
): Promise<LatentSyncResult> {
  logger.info(
    {
      videoUrl: input.videoUrl.substring(0, 50) + "...",
      audioUrl: input.audioUrl.substring(0, 50) + "...",
    },
    "Starting LatentSync video generation"
  );

  configureFalClient();

  const falInput: FalLatentSyncInput = {
    video_url: input.videoUrl,
    audio_url: input.audioUrl,
    guidance_scale: input.guidanceScale ?? 1,
    seed: input.seed ?? 42,
    loop_mode: input.loopMode ?? "loop",
  };

  try {
    const result = await fal.subscribe(LATENTSYNC_MODEL, {
      input: falInput,
      logs: true,
      onQueueUpdate: (update) => {
        logger.debug({ status: update.status }, "LatentSync queue update");
      },
    });

    const output = result.data as FalLatentSyncOutput;

    if (!output?.video?.url) {
      throw new Error("LatentSync did not return a video URL");
    }

    logger.info(
      { videoUrl: output.video.url.substring(0, 50) + "..." },
      "LatentSync video generated successfully"
    );

    return {
      videoUrl: output.video.url,
      requestId: result.requestId,
    };
  } catch (error) {
    logger.error({ error }, "LatentSync video generation failed");
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate number of clips needed for a given audio duration
 * Each clip is approximately 3 seconds
 */
export function calculateNumClips(audioDurationSeconds: number): number {
  // Each clip is ~3 seconds, add 1 for safety margin
  return Math.ceil(audioDurationSeconds / 3) + 1;
}

/**
 * Estimate cost for Live Avatar generation
 * Pricing: $0.01 per video second
 */
export function estimateLiveAvatarCost(durationSeconds: number): number {
  return durationSeconds * 0.01;
}

/**
 * Estimate cost for LatentSync generation
 * Pricing: $0.20 for up to 40 seconds, $0.005/sec after
 */
export function estimateLatentSyncCost(durationSeconds: number): number {
  if (durationSeconds <= 40) {
    return 0.20;
  }
  return 0.20 + (durationSeconds - 40) * 0.005;
}
