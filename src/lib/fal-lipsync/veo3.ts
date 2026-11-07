/**
 * VEO 3.1 Fast Client
 * KIE.ai VEO 3.1 integration for high-quality talking video generation
 *
 * VEO 3.1 Fast generates videos with excellent lip-sync directly from
 * an image and prompt. The model generates its own audio from the prompt,
 * eliminating the need for separate TTS.
 *
 * Pricing: $0.40/video via KIE.ai (75% cheaper than FAL AI)
 * API Documentation: https://docs.kie.ai/veo3-api/generate-veo-3-video
 */

import { logger } from "@/lib/logger";
import {
  generateVideo,
  toKieAspectRatio,
  estimateKieCost,
} from "@/lib/kie/client";

// ============================================================================
// Configuration
// ============================================================================

/** KIE.ai VEO 3.1 Fast model identifier */
export const VEO3_IMAGE_TO_VIDEO_MODEL = "veo3_fast";

/** KIE.ai VEO 3.1 Quality model identifier (for reference) */
export const VEO3_TEXT_TO_VIDEO_MODEL = "veo3";

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
// VEO 3.1 Video Generation
// ============================================================================

/**
 * Generate talking video using VEO 3.1 Fast via KIE.ai
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
    "Starting VEO 3.1 Fast video generation via KIE.ai"
  );

  try {
    // Convert aspect ratio to KIE.ai format
    const aspectRatio = toKieAspectRatio(input.aspectRatio);

    // Generate video using KIE.ai
    const result = await generateVideo({
      imageUrl: input.imageUrl,
      prompt: input.prompt,
      aspectRatio,
      useQualityModel: false, // Use veo3_fast for cost efficiency
    });

    // Parse duration from the input setting (KIE.ai generates ~8s videos)
    const durationSeconds = parseInt(input.duration ?? "8s", 10);

    logger.info(
      {
        videoUrl: result.videoUrl.substring(0, 50) + "...",
        taskId: result.taskId,
        duration: durationSeconds,
      },
      "VEO 3.1 video generated successfully via KIE.ai"
    );

    return {
      videoUrl: result.videoUrl,
      requestId: result.taskId,
      duration: durationSeconds,
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
 *
 * IMPORTANT: For REFERENCE_2_VIDEO mode, the prompt should NOT describe visual style.
 * The reference image defines the appearance, pose, and setting.
 * The prompt should ONLY describe what to say and voice characteristics.
 *
 * @param scriptContent - The testimonial text to be spoken
 * @param _actorDescription - UNUSED - visual style comes from reference image
 * @param actorGender - Gender of the actor (used for voice guidance)
 * @param voicePrompt - Detailed voice description for consistency across clips
 * @returns Formatted prompt for VEO 3.1
 */
export function buildTestimonialPrompt(
  scriptContent: string,
  _actorDescription?: string,
  actorGender?: "male" | "female",
  voicePrompt?: string
): string {
  // Build voice consistency guidance - prioritize detailed voicePrompt for consistency
  const voiceGuidance = voicePrompt
    ? voicePrompt
    : `Natural, conversational ${actorGender === "female" ? "female" : "male"} voice, clear American English`;

  // IMPORTANT: For REFERENCE_2_VIDEO mode, the prompt should NOT describe visual style
  // The reference image defines the appearance, pose, and setting
  // The prompt should ONLY describe what to say and voice characteristics
  return `The person in the image speaks directly to camera, saying: "${scriptContent}"

VOICE CHARACTER:
${voiceGuidance}
Deliver the speech naturally and conversationally.

CRITICAL REQUIREMENTS:
- The person maintains their current pose and setting from the reference image
- Avoid any captions, subtitles, or text overlays on screen
- Avoid any words, letters, or characters appearing on screen
- Single continuous shot, no cuts or transitions
- Start speaking immediately from the first frame
- Lip movements match the spoken words naturally

The person delivers the testimonial naturally, like sharing a genuine recommendation.`;
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
 * Estimate cost for VEO 3.1 generation via KIE.ai
 * Pricing: $0.40/video (flat rate for veo3_fast)
 *
 * @param _duration - Duration setting (unused - flat rate pricing)
 * @returns Estimated cost in USD
 */
 
export function estimateVeo3Cost(_duration: Veo3Duration): number {
  // KIE.ai uses flat rate pricing: $0.40 per video for veo3_fast
  return estimateKieCost(false);
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
