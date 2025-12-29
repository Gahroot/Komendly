/**
 * SadTalker Client
 * FAL AI SadTalker integration for lip-synced video generation
 */

import { fal } from "@fal-ai/client";
import { logger } from "@/lib/logger";
import type { SadTalkerInput, SadTalkerResult } from "./types";

// ============================================================================
// Configuration
// ============================================================================

/** FAL SadTalker model ID */
export const SADTALKER_MODEL = "fal-ai/sadtalker";

/** Configure FAL client */
export function configureFalClient(apiKey?: string): void {
  fal.config({
    credentials: apiKey ?? process.env.FAL_API_KEY ?? "",
  });
}

// ============================================================================
// SadTalker Types (FAL API)
// ============================================================================

interface FalSadTalkerInput {
  source_image_url: string;
  driven_audio_url: string;
  face_model_resolution?: "256" | "512";
  expression_scale?: number;
  preprocess?: "crop" | "resize" | "full";
  still_mode?: boolean;
  face_enhancer?: "gfpgan";
}

interface FalSadTalkerOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

// ============================================================================
// SadTalker Generation
// ============================================================================

/**
 * Generate lip-synced video using SadTalker
 */
export async function generateLipSyncVideo(
  input: SadTalkerInput
): Promise<SadTalkerResult> {
  logger.info(
    {
      imageUrl: input.sourceImageUrl.substring(0, 50) + "...",
      audioUrl: input.drivenAudioUrl.substring(0, 50) + "...",
      resolution: input.faceModelResolution,
    },
    "Starting SadTalker video generation"
  );

  // Ensure FAL client is configured
  configureFalClient();

  const falInput: FalSadTalkerInput = {
    source_image_url: input.sourceImageUrl,
    driven_audio_url: input.drivenAudioUrl,
    face_model_resolution: input.faceModelResolution ?? "256",
    expression_scale: input.expressionScale ?? 1,
    preprocess: input.preprocess ?? "crop",
    still_mode: false,
    face_enhancer: undefined,
  };

  try {
    const result = await fal.subscribe(SADTALKER_MODEL, {
      input: falInput,
      logs: true,
      onQueueUpdate: (update) => {
        logger.debug({ status: update.status }, "SadTalker queue update");
      },
    });

    const output = result.data as FalSadTalkerOutput;

    if (!output?.video?.url) {
      throw new Error("SadTalker did not return a video URL");
    }

    logger.info(
      { videoUrl: output.video.url.substring(0, 50) + "..." },
      "SadTalker video generated successfully"
    );

    return {
      videoUrl: output.video.url,
      requestId: result.requestId,
    };
  } catch (error) {
    logger.error({ error }, "SadTalker video generation failed");
    throw error;
  }
}

/**
 * Generate lip-synced video with progress callback
 */
export async function generateLipSyncVideoWithProgress(
  input: SadTalkerInput,
  onProgress?: (status: string, logs?: string[]) => void
): Promise<SadTalkerResult> {
  configureFalClient();

  const falInput: FalSadTalkerInput = {
    source_image_url: input.sourceImageUrl,
    driven_audio_url: input.drivenAudioUrl,
    face_model_resolution: input.faceModelResolution ?? "256",
    expression_scale: input.expressionScale ?? 1,
    preprocess: input.preprocess ?? "crop",
    still_mode: false,
    face_enhancer: undefined,
  };

  try {
    const result = await fal.subscribe(SADTALKER_MODEL, {
      input: falInput,
      logs: true,
      onQueueUpdate: (update) => {
        if (onProgress) {
          const logs = "logs" in update ? (update.logs as { message: string }[])?.map((l) => l.message) : undefined;
          onProgress(update.status, logs);
        }
      },
    });

    const output = result.data as FalSadTalkerOutput;

    if (!output?.video?.url) {
      throw new Error("SadTalker did not return a video URL");
    }

    return {
      videoUrl: output.video.url,
      requestId: result.requestId,
    };
  } catch (error) {
    logger.error({ error }, "SadTalker video generation failed");
    throw error;
  }
}

/**
 * Submit SadTalker job and return request ID for polling
 */
export async function submitSadTalkerJob(
  input: SadTalkerInput
): Promise<string> {
  configureFalClient();

  const falInput: FalSadTalkerInput = {
    source_image_url: input.sourceImageUrl,
    driven_audio_url: input.drivenAudioUrl,
    face_model_resolution: input.faceModelResolution ?? "256",
    expression_scale: input.expressionScale ?? 1,
    preprocess: input.preprocess ?? "crop",
    still_mode: false,
    face_enhancer: undefined,
  };

  const { request_id } = await fal.queue.submit(SADTALKER_MODEL, {
    input: falInput,
  });

  logger.info({ requestId: request_id }, "SadTalker job submitted");

  return request_id;
}

/**
 * Check status of a SadTalker job
 */
export async function checkSadTalkerStatus(
  requestId: string
): Promise<{
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  result?: SadTalkerResult;
  error?: string;
}> {
  configureFalClient();

  const status = await fal.queue.status(SADTALKER_MODEL, {
    requestId,
    logs: true,
  });

  if (status.status === "COMPLETED") {
    const result = await fal.queue.result(SADTALKER_MODEL, { requestId });
    const output = result.data as FalSadTalkerOutput;

    return {
      status: "COMPLETED",
      result: {
        videoUrl: output.video.url,
        requestId,
      },
    };
  }

  const currentStatus = status.status as "IN_QUEUE" | "IN_PROGRESS" | "FAILED";
  return {
    status: currentStatus,
    error: currentStatus === "FAILED" ? "SadTalker job failed" : undefined,
  };
}

/**
 * Validate image URL for SadTalker
 */
export function validateImageUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  if (!url) {
    return { valid: false, error: "Image URL is required" };
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "Image URL must be HTTP or HTTPS" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid image URL format" };
  }
}

/**
 * Validate audio URL for SadTalker
 */
export function validateAudioUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  if (!url) {
    return { valid: false, error: "Audio URL is required" };
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "Audio URL must be HTTP or HTTPS" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid audio URL format" };
  }
}
