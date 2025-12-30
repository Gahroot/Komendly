/**
 * VEO 3.1 Fast Client
 * FAL AI VEO 3.1 integration for high-quality talking video generation
 *
 * VEO 3.1 Fast generates videos with excellent lip-sync directly from
 * an image and prompt. The model generates its own audio from the prompt,
 * eliminating the need for separate TTS.
 *
 * Pricing: $0.10/sec (audio off), $0.15/sec (audio on)
 */

import { fal } from "@fal-ai/client";
import { logger } from "@/lib/logger";
import { configureFalClient } from "./sadtalker";

// ============================================================================
// Configuration
// ============================================================================

/** FAL VEO 3.1 Fast Image-to-Video model ID */
export const VEO3_IMAGE_TO_VIDEO_MODEL = "fal-ai/veo3.1/fast/image-to-video";

/** FAL VEO 3.1 Fast Text-to-Video model ID (for reference) */
export const VEO3_TEXT_TO_VIDEO_MODEL = "fal-ai/veo3.1/fast";

// ============================================================================
// Types
// ============================================================================

export type Veo3AspectRatio = "auto" | "16:9" | "9:16";
export type Veo3Duration = "4s" | "6s" | "8s";
export type Veo3Resolution = "720p" | "1080p";

export interface Veo3ImageToVideoInput {
  /** URL of the reference image (720p+ resolution recommended) */
  imageUrl: string;
  /** Text prompt describing what the person should say/do */
  prompt: string;
  /** Aspect ratio of the output video */
  aspectRatio?: Veo3AspectRatio;
  /** Duration of the output video */
  duration?: Veo3Duration;
  /** Output resolution */
  resolution?: Veo3Resolution;
  /** Whether to generate audio (enables lip-sync) */
  generateAudio?: boolean;
  /** Auto-fix prompts that fail content policy */
  autoFix?: boolean;
}

export interface Veo3VideoResult {
  videoUrl: string;
  requestId: string;
  duration?: number;
  contentType?: string;
  fileSize?: number;
}

// ============================================================================
// FAL API Types
// ============================================================================

interface FalVeo3Input {
  prompt: string;
  image_url: string;
  aspect_ratio?: Veo3AspectRatio;
  duration?: Veo3Duration;
  resolution?: Veo3Resolution;
  generate_audio?: boolean;
  auto_fix?: boolean;
}

interface FalVeo3Output {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

// ============================================================================
// VEO 3.1 Video Generation
// ============================================================================

/**
 * Generate talking video using VEO 3.1 Fast Image-to-Video
 * Takes an image and prompt, produces a video with generated speech and lip-sync
 *
 * @param input - Generation parameters
 * @returns Video result with URL and metadata
 */
export async function generateVeo3Video(
  input: Veo3ImageToVideoInput
): Promise<Veo3VideoResult> {
  logger.info(
    {
      imageUrl: input.imageUrl.substring(0, 50) + "...",
      promptLength: input.prompt.length,
      duration: input.duration,
      generateAudio: input.generateAudio,
    },
    "Starting VEO 3.1 Fast video generation"
  );

  configureFalClient();

  const falInput: FalVeo3Input = {
    prompt: input.prompt,
    image_url: input.imageUrl,
    aspect_ratio: input.aspectRatio ?? "9:16",
    duration: input.duration ?? "8s",
    resolution: input.resolution ?? "720p",
    generate_audio: input.generateAudio ?? true,
    auto_fix: input.autoFix ?? true,
  };

  try {
    const result = await fal.subscribe(VEO3_IMAGE_TO_VIDEO_MODEL, {
      input: falInput,
      logs: true,
      onQueueUpdate: (update) => {
        logger.debug({ status: update.status }, "VEO 3.1 queue update");
      },
    });

    const output = result.data as FalVeo3Output;

    if (!output?.video?.url) {
      throw new Error("VEO 3.1 did not return a video URL");
    }

    // Parse duration from the input setting
    const durationSeconds = parseInt(input.duration ?? "8s", 10);

    logger.info(
      {
        videoUrl: output.video.url.substring(0, 50) + "...",
        duration: durationSeconds,
      },
      "VEO 3.1 video generated successfully"
    );

    return {
      videoUrl: output.video.url,
      requestId: result.requestId,
      duration: durationSeconds,
      contentType: output.video.content_type,
      fileSize: output.video.file_size,
    };
  } catch (error) {
    logger.error({ error }, "VEO 3.1 video generation failed");
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Build a VEO 3.1 prompt for testimonial video generation
 * Includes speaking instructions and the actual testimonial text
 *
 * @param scriptContent - The testimonial text to be spoken
 * @param actorDescription - Description of the actor's appearance/style
 * @param actorGender - Gender of the actor
 * @param voicePrompt - Detailed voice description for consistency across clips
 * @returns Formatted prompt for VEO 3.1
 */
export function buildTestimonialPrompt(
  scriptContent: string,
  actorDescription?: string,
  actorGender?: "male" | "female",
  voicePrompt?: string
): string {
  const genderTerm = actorGender === "female" ? "woman" : "man";
  const description = actorDescription || "professional person";

  // Build voice consistency guidance - prioritize detailed voicePrompt for consistency
  const voiceGuidance = voicePrompt
    ? voicePrompt
    : `Natural, conversational ${actorGender === "female" ? "female" : "male"} voice, clear American English`;

  // Build a strict prompt with explicit constraints for consistent video generation
  // IMPORTANT: VEO sometimes adds captions/text - be extremely explicit about avoiding this
  // IMPORTANT: Voice description is placed prominently to ensure consistency across clips
  return `A ${description} (${genderTerm}) recording a selfie-style video testimonial on their phone. They speak directly to camera saying: "${scriptContent}"

VOICE CHARACTER:
${voiceGuidance}
Speak naturally and conversationally while maintaining this distinct voice character.

ZERO TOLERANCE - CLEAN VIDEO ONLY:
- Avoid any captions, subtitles, or text overlays
- Avoid any words, letters, or characters appearing on screen
- Avoid lower thirds, titles, watermarks, or graphics
- The frame contains ONLY the person speaking against their background - nothing else
- This is a raw, unedited phone video with absolutely zero post-production text added

VIDEO STYLE:
- Authentic iPhone selfie video, vertical 9:16 format
- Natural indoor lighting, slightly imperfect framing (real UGC feel)
- Person fills most of the frame, eye contact with camera
- Single continuous shot, avoid cuts or transitions
- Starts speaking immediately from first frame

The person delivers the testimonial naturally and conversationally, like sharing a genuine recommendation with a friend.`;
}

/**
 * Calculate the optimal VEO 3.1 duration setting based on script length
 * VEO 3.1 supports: 4s, 6s, 8s
 *
 * @param scriptContent - The text to be spoken
 * @param wordsPerSecond - Average speaking rate (default: 2.5)
 * @returns Optimal duration setting
 */
export function calculateOptimalDuration(
  scriptContent: string,
  wordsPerSecond = 2.5
): Veo3Duration {
  const wordCount = scriptContent.trim().split(/\s+/).length;
  const estimatedSeconds = wordCount / wordsPerSecond;

  // Choose the smallest duration that can fit the content
  if (estimatedSeconds <= 4) return "4s";
  if (estimatedSeconds <= 6) return "6s";
  return "8s";
}

/**
 * Estimate cost for VEO 3.1 generation
 * Pricing: $0.10/sec (audio off), $0.15/sec (audio on)
 *
 * @param duration - Duration setting
 * @param withAudio - Whether audio is enabled
 * @returns Estimated cost in USD
 */
export function estimateVeo3Cost(
  duration: Veo3Duration,
  withAudio = true
): number {
  const seconds = parseInt(duration, 10);
  const ratePerSecond = withAudio ? 0.15 : 0.1;
  return seconds * ratePerSecond;
}

/**
 * Get maximum word count for a given duration
 * Based on average speaking rate of 2.5 words/second
 *
 * @param duration - Duration setting
 * @returns Maximum recommended word count
 */
export function getMaxWordCount(duration: Veo3Duration): number {
  const seconds = parseInt(duration, 10);
  return Math.floor(seconds * 2.5);
}
