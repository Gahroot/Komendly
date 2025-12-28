import { fal, configureFalClient, type QueueUpdate, type FalVideo } from "./client";
import { videoGenLogger, createPerformanceTimer, logError } from "@/lib/logger";

const KLING_MODEL = "fal-ai/kling-video/v2.5-turbo/pro/text-to-video";

// Aspect ratios supported by fal.ai
export const FAL_SUPPORTED_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type FalAspectRatio = (typeof FAL_SUPPORTED_ASPECT_RATIOS)[number];

// Aspect ratio configurations with proper dimensions
// Extended ratios map to the closest fal.ai supported ratio
export const ASPECT_RATIO_CONFIG = {
  "16:9": { width: 1920, height: 1080, label: "Landscape (16:9)", falRatio: "16:9" as FalAspectRatio },
  "9:16": { width: 1080, height: 1920, label: "Portrait (9:16)", falRatio: "9:16" as FalAspectRatio },
  "1:1": { width: 1080, height: 1080, label: "Square (1:1)", falRatio: "1:1" as FalAspectRatio },
  "4:3": { width: 1440, height: 1080, label: "Standard (4:3)", falRatio: "16:9" as FalAspectRatio },
  "3:4": { width: 1080, height: 1440, label: "Portrait Standard (3:4)", falRatio: "9:16" as FalAspectRatio },
  "21:9": { width: 2560, height: 1080, label: "Ultra-wide (21:9)", falRatio: "16:9" as FalAspectRatio },
} as const;

export type AspectRatio = keyof typeof ASPECT_RATIO_CONFIG;

// Duration options in seconds
export const DURATION_OPTIONS = {
  "5": { seconds: 5, label: "5 seconds" },
  "10": { seconds: 10, label: "10 seconds" },
} as const;

export type Duration = keyof typeof DURATION_OPTIONS;

export interface GenerateVideoInput {
  prompt: string;
  duration?: Duration;
  aspectRatio?: AspectRatio;
  negativePrompt?: string;
}

export interface GenerateVideoOutput {
  video: FalVideo;
}

export interface VideoGenerationProgress {
  status: "queued" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  position?: number; // Queue position
  estimatedTime?: number; // Estimated time remaining in seconds
  message?: string;
}

export type ProgressCallback = (progress: VideoGenerationProgress) => void;

// Retry configuration
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// Error types that should trigger a retry
const RETRYABLE_ERROR_PATTERNS = [
  "rate limit",
  "timeout",
  "network error",
  "503",
  "502",
  "429",
  "temporarily unavailable",
];

function isRetryableError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  return RETRYABLE_ERROR_PATTERNS.some((pattern) =>
    errorMessage.includes(pattern.toLowerCase())
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  // Add jitter (10-20% random variation)
  const jitter = delay * (0.1 + Math.random() * 0.1);
  return Math.min(delay + jitter, config.maxDelayMs);
}

export interface QueueStatusResult {
  requestId: string;
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  position?: number;
  result?: GenerateVideoOutput;
  error?: string;
}

/**
 * Poll the queue status for a given request ID
 */
export async function pollQueueStatus(
  apiKey: string,
  requestId: string
): Promise<QueueStatusResult> {
  configureFalClient(apiKey);

  try {
    const status = await fal.queue.status(KLING_MODEL, {
      requestId,
      logs: true,
    });

    const result: QueueStatusResult = {
      requestId,
      status: status.status as QueueStatusResult["status"],
    };

    if ("queue_position" in status && typeof status.queue_position === "number") {
      result.position = status.queue_position;
    }

    return result;
  } catch (error) {
    return {
      requestId,
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get the result of a completed queue request
 */
export async function getQueueResult(
  apiKey: string,
  requestId: string
): Promise<GenerateVideoOutput | null> {
  configureFalClient(apiKey);

  try {
    const result = await fal.queue.result(KLING_MODEL, {
      requestId,
    });

    return result.data as GenerateVideoOutput;
  } catch (error) {
    logError(videoGenLogger, error, "Failed to get queue result", { requestId });
    return null;
  }
}

/**
 * Submit a video generation request to the queue (non-blocking)
 */
export async function submitVideoGeneration(
  apiKey: string,
  input: GenerateVideoInput
): Promise<string> {
  configureFalClient(apiKey);

  const aspectRatioConfig = ASPECT_RATIO_CONFIG[input.aspectRatio || "9:16"];

  const { request_id } = await fal.queue.submit(KLING_MODEL, {
    input: {
      prompt: input.prompt,
      negative_prompt: input.negativePrompt,
      duration: input.duration || "5",
      aspect_ratio: aspectRatioConfig.falRatio,
    },
  });

  return request_id;
}

/**
 * Generate a testimonial video with progress callbacks and retry logic
 */
export async function generateTestimonialVideo(
  apiKey: string,
  input: GenerateVideoInput,
  onProgress?: ProgressCallback,
  retryConfig: Partial<RetryConfig> = {}
): Promise<GenerateVideoOutput> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  let lastError: Error | null = null;

  const log = videoGenLogger.child({ operation: "generateTestimonialVideo" });
  const timer = createPerformanceTimer(log, "video-generation");

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoffDelay(attempt - 1, config);
        log.info({ attempt, maxRetries: config.maxRetries, delayMs: delay }, `Retry attempt ${attempt}/${config.maxRetries}`);

        onProgress?.({
          status: "queued",
          progress: 0,
          message: `Retrying (attempt ${attempt}/${config.maxRetries})...`,
        });

        await sleep(delay);
      }

      const result = await executeVideoGeneration(apiKey, input, onProgress);
      timer.end({ success: true, attempts: attempt + 1 });
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(lastError) || attempt === config.maxRetries) {
        onProgress?.({
          status: "failed",
          progress: 0,
          message: lastError.message,
        });
        timer.error(lastError, { attempts: attempt + 1 });
        throw lastError;
      }

      log.warn({ attempt: attempt + 1, error: lastError.message }, `Video generation failed, will retry`);
    }
  }

  throw lastError || new Error("Video generation failed after retries");
}

async function executeVideoGeneration(
  apiKey: string,
  input: GenerateVideoInput,
  onProgress?: ProgressCallback
): Promise<GenerateVideoOutput> {
  configureFalClient(apiKey);

  const aspectRatioConfig = ASPECT_RATIO_CONFIG[input.aspectRatio || "9:16"];

  // Notify that we're starting
  onProgress?.({
    status: "queued",
    progress: 0,
    message: "Submitting video generation request...",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (fal.subscribe as (model: string, options: any) => Promise<any>)(KLING_MODEL, {
    input: {
      prompt: input.prompt,
      negative_prompt: input.negativePrompt,
      duration: input.duration || "5",
      aspect_ratio: aspectRatioConfig.falRatio,
    },
    logs: true,
    onQueueUpdate: (update: QueueUpdate) => {
      if (!onProgress) return;

      let progress: VideoGenerationProgress;

      switch (update.status) {
        case "IN_QUEUE":
          progress = {
            status: "queued",
            progress: 5,
            position: update.position,
            message: update.position
              ? `Position ${update.position} in queue`
              : "Waiting in queue...",
          };
          break;
        case "IN_PROGRESS":
          progress = {
            status: "processing",
            progress: 50, // We can't get exact progress, so estimate
            message: "Generating video...",
          };
          break;
        case "COMPLETED":
          progress = {
            status: "completed",
            progress: 100,
            message: "Video generation complete!",
          };
          break;
        default:
          progress = {
            status: "processing",
            progress: 25,
            message: "Processing...",
          };
      }

      onProgress(progress);
    },
  });

  // Final progress update
  onProgress?.({
    status: "completed",
    progress: 100,
    message: "Video ready!",
  });

  return result.data as GenerateVideoOutput;
}

/**
 * Poll queue status with automatic retries until completion or failure
 */
export async function pollUntilComplete(
  apiKey: string,
  requestId: string,
  onProgress?: ProgressCallback,
  pollIntervalMs: number = 2000,
  maxPollAttempts: number = 300 // 10 minutes max
): Promise<GenerateVideoOutput> {
  let attempts = 0;

  while (attempts < maxPollAttempts) {
    const status = await pollQueueStatus(apiKey, requestId);

    switch (status.status) {
      case "COMPLETED":
        onProgress?.({
          status: "completed",
          progress: 100,
          message: "Video generation complete!",
        });

        const result = await getQueueResult(apiKey, requestId);
        if (!result) {
          throw new Error("Failed to retrieve completed video result");
        }
        return result;

      case "FAILED":
        onProgress?.({
          status: "failed",
          progress: 0,
          message: status.error || "Video generation failed",
        });
        throw new Error(status.error || "Video generation failed");

      case "IN_QUEUE":
        onProgress?.({
          status: "queued",
          progress: 5,
          position: status.position,
          message: status.position
            ? `Position ${status.position} in queue`
            : "Waiting in queue...",
        });
        break;

      case "IN_PROGRESS":
        onProgress?.({
          status: "processing",
          progress: 50,
          message: "Generating video...",
        });
        break;
    }

    await sleep(pollIntervalMs);
    attempts++;
  }

  throw new Error("Polling timed out waiting for video generation");
}
