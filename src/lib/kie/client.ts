/**
 * KIE.ai API Client
 * Client for Veo 3.1 video generation via KIE.ai
 *
 * Pricing: $0.40 per Veo 3.1 Fast video (25% of Google's direct pricing)
 * API Documentation: https://docs.kie.ai/veo3-api/generate-veo-3-video
 */

import { logger } from "@/lib/logger";
import type {
  KieGenerateRequest,
  KieGenerateResponse,
  KieStatusResponse,
  KieVideoOptions,
  KieVideoResult,
  KieStatusResult,
  KieAspectRatio,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

const KIE_API_BASE = "https://api.kie.ai/api/v1/veo";
const DEFAULT_POLL_INTERVAL_MS = 10_000; // 10 seconds
const MAX_POLL_ATTEMPTS = 60; // 10 minutes max wait

/**
 * Get the KIE API key from environment
 */
function getApiKey(): string {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    throw new Error("KIE_API_KEY environment variable is not set");
  }
  return apiKey;
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Submit a video generation request to KIE.ai
 */
export async function submitVideoGeneration(
  options: KieVideoOptions
): Promise<string> {
  const apiKey = getApiKey();

  const requestBody: KieGenerateRequest = {
    prompt: options.prompt,
    model: options.useQualityModel ? "veo3" : "veo3_fast",
    generationType: options.imageUrl ? "REFERENCE_2_VIDEO" : "TEXT_2_VIDEO",
    aspect_ratio: options.aspectRatio ?? "9:16",
    enableTranslation: true,
  };

  // Add image URL if provided (for image-to-video)
  if (options.imageUrl) {
    requestBody.imageUrls = [options.imageUrl];
  }

  // Add callback URL if provided
  if (options.callbackUrl) {
    requestBody.callBackUrl = options.callbackUrl;
  }

  logger.info(
    {
      model: requestBody.model,
      generationType: requestBody.generationType,
      aspectRatio: requestBody.aspect_ratio,
      hasImage: !!options.imageUrl,
      promptLength: options.prompt.length,
    },
    "Submitting video generation to KIE.ai"
  );

  const response = await fetch(`${KIE_API_BASE}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { status: response.status, error: errorText },
      "KIE.ai API error"
    );
    throw new Error(`KIE.ai API error: ${response.status} - ${errorText}`);
  }

  const data: KieGenerateResponse = await response.json();

  if (data.code !== 200) {
    throw new Error(`KIE.ai generation failed: ${data.msg}`);
  }

  logger.info({ taskId: data.data.taskId }, "KIE.ai video generation submitted");

  return data.data.taskId;
}

/**
 * Check the status of a video generation task
 */
export async function checkTaskStatus(taskId: string): Promise<KieStatusResult> {
  const apiKey = getApiKey();

  const response = await fetch(
    `${KIE_API_BASE}/record-info?taskId=${encodeURIComponent(taskId)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`KIE.ai status check failed: ${response.status} - ${errorText}`);
  }

  const data: KieStatusResponse = await response.json();

  const { successFlag, errorMessage, errorCode, response: taskResponse } = data.data;

  // successFlag: 0 = processing, 1 = completed, 2 = failed, 3 = generation failed
  const isComplete = successFlag === 1;
  const isFailed = successFlag === 2 || successFlag === 3;

  let videoUrl: string | undefined;
  if (isComplete && taskResponse) {
    // Get video URL from resultUrls (16:9) or originUrls (other aspect ratios)
    videoUrl = taskResponse.resultUrls?.[0] ?? taskResponse.originUrls?.[0];
  }

  return {
    isComplete,
    isSuccess: isComplete && !!videoUrl,
    isFailed,
    videoUrl,
    error: isFailed ? errorMessage || `Error code: ${errorCode}` : undefined,
  };
}

/**
 * Poll for video completion with exponential backoff
 */
export async function pollForCompletion(
  taskId: string,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxAttempts = MAX_POLL_ATTEMPTS,
  onProgress?: (attempt: number, maxAttempts: number) => void
): Promise<KieStatusResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await checkTaskStatus(taskId);

    if (onProgress) {
      onProgress(attempt, maxAttempts);
    }

    if (status.isComplete || status.isFailed) {
      return status;
    }

    logger.debug(
      { taskId, attempt, maxAttempts },
      "Video still processing, waiting..."
    );

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Video generation timed out after ${maxAttempts} attempts`);
}

/**
 * Generate a video and wait for completion
 * This is the main high-level function to use
 */
export async function generateVideo(
  options: KieVideoOptions
): Promise<KieVideoResult> {
  logger.info(
    {
      hasImage: !!options.imageUrl,
      promptLength: options.prompt.length,
      aspectRatio: options.aspectRatio,
    },
    "Starting KIE.ai video generation"
  );

  // Submit generation request
  const taskId = await submitVideoGeneration(options);

  // Poll for completion
  const status = await pollForCompletion(taskId, DEFAULT_POLL_INTERVAL_MS, MAX_POLL_ATTEMPTS, (attempt, max) => {
    logger.debug({ taskId, attempt, max }, "Polling KIE.ai for video completion");
  });

  if (status.isFailed) {
    throw new Error(`Video generation failed: ${status.error}`);
  }

  if (!status.videoUrl) {
    throw new Error("Video generation completed but no URL returned");
  }

  logger.info(
    { taskId, videoUrl: status.videoUrl.substring(0, 50) + "..." },
    "KIE.ai video generation completed"
  );

  return {
    videoUrl: status.videoUrl,
    taskId,
    // KIE.ai Veo 3.1 generates ~8 second videos
    duration: 8,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Map internal aspect ratio to KIE.ai format
 */
export function toKieAspectRatio(
  aspectRatio: string | undefined
): KieAspectRatio {
  switch (aspectRatio) {
    case "16:9":
      return "16:9";
    case "9:16":
      return "9:16";
    default:
      return "9:16"; // Default to vertical for testimonials
  }
}

/**
 * Estimate cost for KIE.ai generation
 * Pricing: $0.40 per Veo 3.1 Fast video, $2.00 per Veo 3.1 Quality video
 */
export function estimateKieCost(useQualityModel = false): number {
  return useQualityModel ? 2.0 : 0.4;
}
