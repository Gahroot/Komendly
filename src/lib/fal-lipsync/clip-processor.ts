/**
 * FAL Clip Processor
 * Background processor for generating lip-synced video clips
 *
 * Flow for VEO 3.1 with frame continuity:
 * 1. Generate clip 1 from actor's reference image (the selected "look")
 * 2. Extract LAST FRAME of clip 1
 * 3. Generate clip 2 using the extracted frame as input
 * 4. Extract LAST FRAME of clip 2
 * 5. Generate clip 3 using the extracted frame as input
 * 6. Stitch all clips together (seamless transitions)
 *
 * This ensures visual continuity between clips.
 */

import { fal } from "@fal-ai/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { generateTTS, estimateAudioDuration } from "./tts-generator";
import { generateLipSyncVideo, configureFalClient } from "./sadtalker";
import { generateLiveAvatarVideo, calculateNumClips } from "./live-avatar";
import {
  generateVeo3Video,
  buildTestimonialPrompt,
  calculateOptimalDuration,
  type Veo3AspectRatio,
} from "./veo3";
import { extractLastFrame } from "./frame-extractor";
import { stitchVideos } from "./video-stitcher";
import type { FalClip, FalActor } from "@prisma/client";
import type { AspectRatio } from "./video-editor/types";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Video generation model to use
 * - "sadtalker": Legacy model, cheap but low quality (animated still image)
 * - "live-avatar": High quality, natural movement and expressions
 * - "veo3": Best quality - VEO 3.1 Fast with excellent lip sync (generates its own audio)
 */
type VideoModel = "sadtalker" | "live-avatar" | "veo3";

/** Default model - use VEO 3.1 for best lip sync quality */
const DEFAULT_VIDEO_MODEL: VideoModel = "veo3";

// ============================================================================
// Types
// ============================================================================

interface ClipProcessorResult {
  success: boolean;
  clipId: string;
  videoUrl?: string;
  audioUrl?: string;
  duration?: number;
  error?: string;
}

interface CompositeProcessorResult {
  success: boolean;
  compositeVideoId: string;
  completedClips: number;
  totalClips: number;
  finalVideoUrl?: string;
  error?: string;
}

// ============================================================================
// Audio Upload to FAL Storage
// ============================================================================

/**
 * Upload audio buffer to FAL storage
 */
async function uploadAudioToFal(audioBuffer: Buffer, filename: string): Promise<string> {
  // Configure FAL client
  configureFalClient(process.env.FAL_API_KEY);

  // Convert Buffer to Uint8Array for Blob compatibility
  const uint8Array = new Uint8Array(audioBuffer);

  // Create a Blob from the Uint8Array
  const blob = new Blob([uint8Array], { type: "audio/mpeg" });

  // Upload to FAL storage
  const audioUrl = await fal.storage.upload(blob);

  logger.info({ audioUrl: audioUrl.substring(0, 50) + "...", filename }, "Audio uploaded to FAL storage");

  return audioUrl;
}

// ============================================================================
// Single Clip Processing
// ============================================================================

/**
 * Process a single clip: Generate video with lip-synced speech
 *
 * For VEO 3.1: Image + Prompt -> Video with generated audio (no TTS needed)
 * For Live Avatar/SadTalker: TTS -> Upload -> Video generation
 *
 * @param clip - The clip record to process
 * @param actor - The actor to use for video generation
 * @param voiceId - Voice ID for TTS (only used for non-VEO models)
 * @param inputImageUrl - Optional override image URL for frame continuity.
 *                        If provided, uses this instead of actor.referenceImageUrl.
 *                        This should be the last frame of the previous clip.
 */
export async function processClip(
  clip: FalClip,
  actor: FalActor,
  voiceId: string,
  inputImageUrl?: string
): Promise<ClipProcessorResult> {
  const clipId = clip.id;

  // Use the provided input image (for frame continuity) or fall back to actor's reference image
  const imageUrl = inputImageUrl ?? actor.referenceImageUrl;

  try {
    logger.info(
      {
        clipId,
        clipType: clip.clipType,
        clipIndex: clip.clipIndex,
        model: DEFAULT_VIDEO_MODEL,
        usingCustomImage: !!inputImageUrl,
      },
      "Starting clip processing"
    );

    let videoResult: { videoUrl: string; requestId?: string; duration?: number };
    let audioUrl: string | undefined;

    if (DEFAULT_VIDEO_MODEL === "veo3") {
      // VEO 3.1 Fast - generates video with lip-synced audio directly from prompt
      // No separate TTS step needed!
      await prisma.falClip.update({
        where: { id: clipId },
        data: { status: "generating_video" },
      });

      logger.info(
        { clipId, imageUrl: imageUrl.substring(0, 50) + "...", isFrameContinuity: !!inputImageUrl },
        "Generating video with VEO 3.1 Fast"
      );

      // Use actor's voicePrompt for consistent voice across all clips
      // If voicePrompt is not set, fall back to style-based voice description
      let voiceStyle: string;
      if (actor.voicePrompt) {
        voiceStyle = actor.voicePrompt;
      } else {
        const actorStyle = actor.style || "professional";
        const genderVoice = actor.gender === "female" ? "female" : "male";
        const styleVoiceMap: Record<string, string> = {
          professional: `clear, confident ${genderVoice} voice with professional tone`,
          casual: `relaxed, friendly ${genderVoice} voice with casual conversational tone`,
          energetic: `upbeat, enthusiastic ${genderVoice} voice with dynamic energy`,
          friendly: `warm, approachable ${genderVoice} voice with genuine warmth`,
          calm: `soothing, gentle ${genderVoice} voice with relaxed pace`,
          bold: `strong, confident ${genderVoice} voice with assertive delivery`,
        };
        voiceStyle = styleVoiceMap[actorStyle] || styleVoiceMap.professional;
      }

      // Build the testimonial prompt with the actual script content
      const prompt = buildTestimonialPrompt(
        clip.scriptContent,
        actor.description ?? undefined,
        actor.gender as "male" | "female",
        voiceStyle
      );

      // Calculate optimal duration based on script length
      const duration = calculateOptimalDuration(clip.scriptContent);

      const veo3Result = await generateVeo3Video({
        imageUrl: imageUrl, // Use the input image (frame from previous clip or actor reference)
        prompt: prompt,
        aspectRatio: "9:16" as Veo3AspectRatio,
        duration: duration,
        resolution: "720p",
        generateAudio: true, // VEO generates lip-synced audio
        autoFix: true,
      });

      videoResult = {
        videoUrl: veo3Result.videoUrl,
        requestId: veo3Result.requestId,
        duration: veo3Result.duration,
      };
    } else {
      // Legacy flow: TTS + separate video generation

      // Step 1: Update status to generating_audio
      await prisma.falClip.update({
        where: { id: clipId },
        data: { status: "generating_audio" },
      });

      // Step 2: Generate TTS audio
      logger.info({ clipId }, "Generating TTS audio");
      const ttsResult = await generateTTS(clip.scriptContent, {
        voice: voiceId as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      });

      // Step 3: Upload audio to FAL storage
      logger.info({ clipId }, "Uploading audio to FAL storage");
      const audioFilename = `clip-${clipId}-${Date.now()}.mp3`;
      audioUrl = await uploadAudioToFal(ttsResult.audioBuffer, audioFilename);

      // Step 4: Update clip with audio URL and change status
      await prisma.falClip.update({
        where: { id: clipId },
        data: {
          audioUrl,
          status: "generating_video",
        },
      });

      // Step 5: Generate lip-synced video
      logger.info(
        { clipId, imageUrl: imageUrl.substring(0, 50) + "...", model: DEFAULT_VIDEO_MODEL },
        "Generating lip-synced video"
      );

      // Estimate duration from script for clip calculation
      const estimatedAudioDuration = estimateAudioDuration(clip.scriptContent);

      if (DEFAULT_VIDEO_MODEL === "live-avatar") {
        // Use Live Avatar for high quality video generation
        const numClips = calculateNumClips(estimatedAudioDuration);

        const liveAvatarResult = await generateLiveAvatarVideo({
          imageUrl: imageUrl, // Use input image for frame continuity
          audioUrl: audioUrl,
          prompt: `A ${actor.style || "professional"} person speaking naturally to camera, ${actor.gender || "person"}, testimonial video style, well-lit, high quality`,
          numClips: numClips,
          framesPerClip: 48,
          acceleration: "regular",
        });

        videoResult = {
          videoUrl: liveAvatarResult.videoUrl,
          requestId: liveAvatarResult.requestId,
          duration: liveAvatarResult.duration,
        };
      } else {
        // Fallback to SadTalker (legacy, lower quality)
        const sadTalkerResult = await generateLipSyncVideo({
          sourceImageUrl: imageUrl, // Use input image for frame continuity
          drivenAudioUrl: audioUrl,
          faceModelResolution: "512",
          expressionScale: 1,
        });

        videoResult = {
          videoUrl: sadTalkerResult.videoUrl,
          requestId: sadTalkerResult.requestId,
        };
      }
    }

    // Calculate duration
    const words = clip.scriptContent.trim().split(/\s+/).length;
    const estimatedDuration = videoResult.duration ?? Math.ceil(words / 2.5);

    // Update clip as completed
    await prisma.falClip.update({
      where: { id: clipId },
      data: {
        videoUrl: videoResult.videoUrl,
        audioUrl: audioUrl,
        falRequestId: videoResult.requestId,
        duration: estimatedDuration,
        status: "completed",
        completedAt: new Date(),
      },
    });

    logger.info(
      { clipId, videoUrl: videoResult.videoUrl.substring(0, 50) + "..." },
      "Clip processing completed successfully"
    );

    return {
      success: true,
      clipId,
      videoUrl: videoResult.videoUrl,
      audioUrl,
      duration: estimatedDuration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logger.error({ clipId, error: errorMessage }, "Clip processing failed");

    // Update clip as failed
    await prisma.falClip.update({
      where: { id: clipId },
      data: {
        status: "failed",
        errorMessage,
      },
    });

    return {
      success: false,
      clipId,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Composite Video Processing
// ============================================================================

/**
 * Process all clips for a composite video with frame continuity
 *
 * For VEO 3.1, this ensures smooth visual transitions between clips:
 * - Clip 1: Uses the actor's reference image (the selected "look")
 * - Clip 2: Uses the last frame of Clip 1 as input
 * - Clip 3: Uses the last frame of Clip 2 as input
 *
 * This creates a seamless video where the character's pose flows naturally.
 */
export async function processCompositeVideo(
  compositeVideoId: string
): Promise<CompositeProcessorResult> {
  try {
    logger.info({ compositeVideoId }, "Starting composite video processing with frame continuity");

    // Fetch composite video with clips and actor
    const compositeVideo = await prisma.falCompositeVideo.findUnique({
      where: { id: compositeVideoId },
      include: {
        clips: { orderBy: { clipIndex: "asc" } },
        actor: true,
      },
    });

    if (!compositeVideo) {
      return {
        success: false,
        compositeVideoId,
        completedClips: 0,
        totalClips: 0,
        error: "Composite video not found",
      };
    }

    const { clips, actor, voiceId } = compositeVideo;
    let completedCount = 0;

    // Track the current input image for frame continuity
    // Start with the actor's reference image (the selected "look")
    let currentInputImageUrl: string | undefined = undefined;

    // Process each pending clip sequentially with frame continuity
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const isLastClip = i === clips.length - 1;

      if (clip.status === "completed") {
        completedCount++;
        // If clip is already completed, we need its video URL to extract the last frame
        // for the next clip (unless this is the last clip)
        if (!isLastClip && clip.videoUrl) {
          logger.info(
            { clipIndex: i, clipId: clip.id },
            "Clip already completed, extracting last frame for next clip"
          );
          const frameResult = await extractLastFrame(clip.videoUrl);
          if (frameResult.success && frameResult.frameUrl) {
            currentInputImageUrl = frameResult.frameUrl;
          } else {
            logger.warn(
              { clipId: clip.id, error: frameResult.error },
              "Failed to extract last frame from completed clip, using actor reference"
            );
            // Fall back to actor reference if extraction fails
            currentInputImageUrl = undefined;
          }
        }
        continue;
      }

      if (clip.status === "failed") {
        // Skip failed clips - could implement retry logic here
        continue;
      }

      // Process the clip with the current input image (for frame continuity)
      // First clip (index 0) uses actor.referenceImageUrl (currentInputImageUrl is undefined)
      // Subsequent clips use the last frame of the previous clip
      logger.info(
        {
          clipId: clip.id,
          clipIndex: i,
          hasFrameContinuityImage: !!currentInputImageUrl,
        },
        `Processing clip ${i + 1}/${clips.length}`
      );

      const result = await processClip(clip, actor, voiceId, currentInputImageUrl);

      if (result.success) {
        completedCount++;

        // Update composite video progress
        await prisma.falCompositeVideo.update({
          where: { id: compositeVideoId },
          data: { currentClip: completedCount },
        });

        // Extract the last frame of this clip for the next clip (unless this is the last clip)
        if (!isLastClip && result.videoUrl) {
          logger.info(
            { clipId: clip.id, clipIndex: i },
            "Extracting last frame for next clip"
          );

          const frameResult = await extractLastFrame(result.videoUrl);
          if (frameResult.success && frameResult.frameUrl) {
            currentInputImageUrl = frameResult.frameUrl;
            logger.info(
              { clipId: clip.id, frameUrl: frameResult.frameUrl.substring(0, 50) + "..." },
              "Last frame extracted successfully for frame continuity"
            );
          } else {
            logger.warn(
              { clipId: clip.id, error: frameResult.error },
              "Failed to extract last frame, next clip will use actor reference"
            );
            // Fall back to actor reference if extraction fails
            currentInputImageUrl = undefined;
          }
        }
      } else {
        // If a clip fails, mark composite as failed
        await prisma.falCompositeVideo.update({
          where: { id: compositeVideoId },
          data: {
            status: "failed",
            errorMessage: `Clip ${clip.clipIndex + 1} failed: ${result.error}`,
          },
        });

        return {
          success: false,
          compositeVideoId,
          completedClips: completedCount,
          totalClips: clips.length,
          error: result.error,
        };
      }
    }

    // All clips completed - update to stitching
    await prisma.falCompositeVideo.update({
      where: { id: compositeVideoId },
      data: { status: "stitching" },
    });

    // Fetch all completed clips for stitching
    const allClips = await prisma.falClip.findMany({
      where: { compositeVideoId },
      orderBy: { clipIndex: "asc" },
    });

    // Collect video URLs and durations in order
    const completedClips = allClips.filter((c) => c.status === "completed" && c.videoUrl);
    const videoUrls = completedClips.map((c) => c.videoUrl as string);
    const clipDurations = completedClips.map((c) => c.duration ?? 8); // Default to 8s if unknown

    if (videoUrls.length === 0) {
      throw new Error("No completed clips with video URLs to stitch");
    }

    // Stitch videos together using FFmpeg
    logger.info(
      { compositeVideoId, clipCount: videoUrls.length, clipDurations },
      "Starting video stitching with FFmpeg"
    );

    const stitchResult = await stitchVideos({
      videoUrls,
      clipDurations,
      aspectRatio: (compositeVideo.aspectRatio || "9:16") as AspectRatio,
    });

    if (!stitchResult.success || !stitchResult.finalVideoUrl) {
      throw new Error(`Video stitching failed: ${stitchResult.error || "Unknown error"}`);
    }

    // Calculate total duration from clips
    const totalDuration = allClips.reduce((sum, c) => sum + (c.duration ?? 0), 0);

    // Mark as completed with stitched video URL
    await prisma.falCompositeVideo.update({
      where: { id: compositeVideoId },
      data: {
        status: "completed",
        finalVideoUrl: stitchResult.finalVideoUrl,
        actualDuration: stitchResult.duration ?? totalDuration,
        completedAt: new Date(),
      },
    });

    logger.info(
      { compositeVideoId, completedClips: completedCount, totalDuration, finalVideoUrl: stitchResult.finalVideoUrl.substring(0, 50) + "..." },
      "Composite video processing completed"
    );

    return {
      success: true,
      compositeVideoId,
      completedClips: completedCount,
      totalClips: clips.length,
      finalVideoUrl: stitchResult.finalVideoUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logger.error({ compositeVideoId, error: errorMessage }, "Composite video processing failed");

    await prisma.falCompositeVideo.update({
      where: { id: compositeVideoId },
      data: {
        status: "failed",
        errorMessage,
      },
    });

    return {
      success: false,
      compositeVideoId,
      completedClips: 0,
      totalClips: 0,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Background Processing Trigger
// ============================================================================

/**
 * Start processing a composite video in the background (non-blocking)
 * This is called from the API route after creating the composite video
 */
export function startBackgroundProcessing(compositeVideoId: string): void {
  // Use setImmediate to run processing after the current event loop
  // This allows the API to return immediately while processing continues
  setImmediate(async () => {
    try {
      await processCompositeVideo(compositeVideoId);
    } catch (error) {
      logger.error(
        { compositeVideoId, error },
        "Background processing failed unexpectedly"
      );
    }
  });
}

/**
 * Process pending composite videos (can be called by a cron job)
 */
export async function processPendingVideos(): Promise<void> {
  const pendingVideos = await prisma.falCompositeVideo.findMany({
    where: {
      status: "generating_clips",
    },
    orderBy: { createdAt: "asc" },
    take: 5, // Process up to 5 at a time
  });

  logger.info({ count: pendingVideos.length }, "Found pending composite videos to process");

  for (const video of pendingVideos) {
    await processCompositeVideo(video.id);
  }
}
