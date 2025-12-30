/**
 * Video Stitcher Service
 * Downloads video clips, stitches them with FFmpeg, uploads result to FAL storage
 *
 * Uses the reliable concat demuxer approach (file list) instead of complex
 * xfade filters which are prone to timing issues.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fal } from "@fal-ai/client";
import { logger } from "@/lib/logger";
import { configureFalClient } from "./sadtalker";
import type { AspectRatio } from "./video-editor/types";

// ============================================================================
// Types
// ============================================================================

export interface StitchInput {
  /** Array of video URLs to stitch together */
  videoUrls: string[];
  /** Array of clip durations in seconds (must match videoUrls length) */
  clipDurations?: number[];
  /** Output aspect ratio */
  aspectRatio?: AspectRatio;
}

export interface StitchResult {
  success: boolean;
  finalVideoUrl?: string;
  duration?: number;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a temporary directory for video processing
 */
function createTempDir(): string {
  const tempDir = path.join(os.tmpdir(), `fal-stitch-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up temporary directory
 */
function cleanupTempDir(tempDir: string): void {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    logger.warn({ tempDir, error }, "Failed to cleanup temp directory");
  }
}

/**
 * Download a video file from URL to local path
 */
async function downloadVideo(url: string, outputPath: string): Promise<void> {
  logger.debug({ url: url.substring(0, 50) + "...", outputPath }, "Downloading video");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  logger.debug({ outputPath, size: buffer.length }, "Video downloaded successfully");
}

/**
 * Upload video file to FAL storage
 */
async function uploadVideoToFal(filePath: string): Promise<string> {
  configureFalClient(process.env.FAL_API_KEY);

  const fileBuffer = fs.readFileSync(filePath);
  const uint8Array = new Uint8Array(fileBuffer);
  const blob = new Blob([uint8Array], { type: "video/mp4" });

  const videoUrl = await fal.storage.upload(blob);
  logger.info({ videoUrl: videoUrl.substring(0, 50) + "..." }, "Video uploaded to FAL storage");

  return videoUrl;
}

/**
 * Execute FFmpeg command and wait for completion
 */
async function executeFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.debug({ command: `ffmpeg ${args.slice(0, 10).join(" ")}...` }, "Executing FFmpeg");

    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    ffmpeg.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        logger.debug("FFmpeg completed successfully");
        resolve();
      } else {
        logger.error({ code, stderr: stderr.slice(-500) }, "FFmpeg failed");
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-200)}`));
      }
    });
  });
}

/**
 * Check if FFmpeg is available
 */
async function checkFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    ffmpeg.on("error", () => resolve(false));
    ffmpeg.on("close", (code) => resolve(code === 0));
  });
}

// ============================================================================
// Main Stitching Function
// ============================================================================

/**
 * Get resolution dimensions for aspect ratio
 */
function getResolutionForAspect(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case "9:16":
      return { width: 720, height: 1280 };
    case "16:9":
      return { width: 1280, height: 720 };
    case "1:1":
      return { width: 720, height: 720 };
    case "4:5":
      return { width: 720, height: 900 };
    default:
      return { width: 720, height: 1280 };
  }
}

/**
 * Stitch multiple video clips into a single video
 *
 * Uses the reliable concat demuxer approach:
 * 1. Download all clips to temp directory
 * 2. Write a file list for FFmpeg concat demuxer
 * 3. Re-encode with consistent settings for seamless playback
 * 4. Upload result to FAL storage
 * 5. Cleanup temp files
 */
export async function stitchVideos(input: StitchInput): Promise<StitchResult> {
  const { videoUrls, clipDurations, aspectRatio = "9:16" } = input;

  if (videoUrls.length === 0) {
    return { success: false, error: "No video URLs provided" };
  }

  // If only one video, just return it directly
  if (videoUrls.length === 1) {
    return {
      success: true,
      finalVideoUrl: videoUrls[0],
      duration: clipDurations?.[0],
    };
  }

  // Check FFmpeg availability
  const ffmpegAvailable = await checkFFmpegAvailable();
  if (!ffmpegAvailable) {
    logger.warn("FFmpeg not available, returning first clip as fallback");
    return {
      success: true,
      finalVideoUrl: videoUrls[0],
    };
  }

  const tempDir = createTempDir();
  const localPaths: string[] = [];

  try {
    logger.info(
      { clipCount: videoUrls.length, tempDir, aspectRatio },
      "Starting video stitching with concat demuxer"
    );

    // Step 1: Download all video clips
    for (let i = 0; i < videoUrls.length; i++) {
      const localPath = path.join(tempDir, `clip-${i}.mp4`);
      await downloadVideo(videoUrls[i], localPath);
      localPaths.push(localPath);
    }

    // Step 2: Write file list for concat demuxer
    const fileListPath = path.join(tempDir, "filelist.txt");
    const fileListContent = localPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(fileListPath, fileListContent, "utf8");

    logger.debug({ fileListPath, clipCount: localPaths.length }, "Created concat file list");

    // Step 3: Generate output path and build FFmpeg command
    const outputPath = path.join(tempDir, "output.mp4");
    const { width, height } = getResolutionForAspect(aspectRatio);

    // Use concat demuxer with re-encoding for consistent output
    // This ensures all clips are properly combined regardless of slight codec differences
    const ffmpegArgs = [
      "-y", // Overwrite output
      "-f", "concat", // Use concat demuxer
      "-safe", "0", // Allow absolute paths
      "-i", fileListPath, // Input file list
      // Video settings - re-encode for consistency
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30`,
      "-c:v", "libx264",
      "-preset", "medium",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-crf", "20",
      // Audio settings
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      // Output optimization
      "-movflags", "+faststart",
      outputPath,
    ];

    logger.debug({ command: `ffmpeg ${ffmpegArgs.slice(0, 15).join(" ")}...` }, "Running FFmpeg concat");

    await executeFFmpeg(ffmpegArgs);

    // Verify output exists
    if (!fs.existsSync(outputPath)) {
      throw new Error("FFmpeg did not produce output file");
    }

    const stats = fs.statSync(outputPath);
    logger.info({ outputSize: stats.size }, "FFmpeg produced output file");

    // Step 4: Upload to FAL storage
    const finalVideoUrl = await uploadVideoToFal(outputPath);

    // Calculate total duration from clips
    const totalDuration = clipDurations
      ? clipDurations.reduce((sum, d) => sum + d, 0)
      : videoUrls.length * 8; // Estimate 8s per clip if unknown

    logger.info(
      { finalVideoUrl: finalVideoUrl.substring(0, 50) + "...", clipCount: videoUrls.length, totalDuration },
      "Video stitching completed successfully"
    );

    return {
      success: true,
      finalVideoUrl,
      duration: totalDuration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage, tempDir }, "Video stitching failed");

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    // Cleanup temp directory
    cleanupTempDir(tempDir);
  }
}

/**
 * Simple concatenation (convenience wrapper)
 */
export async function simpleConcatVideos(videoUrls: string[]): Promise<StitchResult> {
  return stitchVideos({ videoUrls });
}
