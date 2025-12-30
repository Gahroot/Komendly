/**
 * Frame Extractor
 * FFmpeg-based utility for extracting frames from videos
 *
 * Used for frame continuity in multi-clip video generation:
 * - Extract last frame of clip N
 * - Use as input image for clip N+1
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fal } from "@fal-ai/client";
import { logger } from "@/lib/logger";
import { configureFalClient } from "./sadtalker";

// ============================================================================
// Types
// ============================================================================

export interface FrameExtractionResult {
  success: boolean;
  frameUrl?: string;
  localPath?: string;
  error?: string;
}

export interface ExtractFrameOptions {
  /** Position to extract frame from: "last" | "first" | number (seconds) */
  position?: "last" | "first" | number;
  /** Output format */
  format?: "png" | "jpg";
  /** Cleanup local file after upload */
  cleanup?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a temporary directory for frame extraction
 */
function createTempDir(): string {
  const tempDir = path.join(os.tmpdir(), `fal-frame-${Date.now()}`);
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
  logger.debug({ url: url.substring(0, 50) + "...", outputPath }, "Downloading video for frame extraction");

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
 * Get video duration using FFprobe
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);

    let stdout = "";
    let stderr = "";

    ffprobe.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    ffprobe.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    ffprobe.on("error", (err) => {
      reject(new Error(`FFprobe spawn error: ${err.message}`));
    });

    ffprobe.on("close", (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        if (isNaN(duration)) {
          reject(new Error("Could not parse video duration"));
        } else {
          resolve(duration);
        }
      } else {
        reject(new Error(`FFprobe exited with code ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * Extract a single frame from video using FFmpeg
 */
async function extractFrame(
  videoPath: string,
  outputPath: string,
  seekTime: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use accurate seeking with -ss before -i for speed, then precise frame extraction
    const args = [
      "-y", // Overwrite output
      "-ss", seekTime.toFixed(3), // Seek to position
      "-i", videoPath, // Input video
      "-frames:v", "1", // Extract exactly 1 frame
      "-q:v", "2", // High quality (1-31, lower is better)
      outputPath,
    ];

    logger.debug({ command: `ffmpeg ${args.join(" ")}` }, "Extracting frame");

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
        logger.debug({ outputPath }, "Frame extracted successfully");
        resolve();
      } else {
        logger.error({ code, stderr: stderr.slice(-500) }, "FFmpeg frame extraction failed");
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-200)}`));
      }
    });
  });
}

/**
 * Upload image file to FAL storage
 */
async function uploadImageToFal(filePath: string): Promise<string> {
  configureFalClient(process.env.FAL_API_KEY);

  const fileBuffer = fs.readFileSync(filePath);
  const uint8Array = new Uint8Array(fileBuffer);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  const blob = new Blob([uint8Array], { type: mimeType });

  const imageUrl = await fal.storage.upload(blob);
  logger.info({ imageUrl: imageUrl.substring(0, 50) + "..." }, "Frame uploaded to FAL storage");

  return imageUrl;
}

/**
 * Check if FFmpeg/FFprobe is available
 */
async function checkFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    ffmpeg.on("error", () => resolve(false));
    ffmpeg.on("close", (code) => resolve(code === 0));
  });
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Extract the last frame from a video and upload to FAL storage
 *
 * @param videoUrl - URL of the video to extract frame from
 * @param options - Extraction options
 * @returns Frame extraction result with uploaded URL
 */
export async function extractLastFrame(
  videoUrl: string,
  options: ExtractFrameOptions = {}
): Promise<FrameExtractionResult> {
  const { format = "png", cleanup = true } = options;

  // Check FFmpeg availability
  const ffmpegAvailable = await checkFFmpegAvailable();
  if (!ffmpegAvailable) {
    logger.error("FFmpeg not available for frame extraction");
    return {
      success: false,
      error: "FFmpeg not available",
    };
  }

  const tempDir = createTempDir();
  const videoPath = path.join(tempDir, "input.mp4");
  const framePath = path.join(tempDir, `frame.${format}`);

  try {
    logger.info(
      { videoUrl: videoUrl.substring(0, 50) + "...", format },
      "Starting last frame extraction"
    );

    // Step 1: Download video
    await downloadVideo(videoUrl, videoPath);

    // Step 2: Get video duration
    const duration = await getVideoDuration(videoPath);
    logger.debug({ duration }, "Video duration detected");

    // Step 3: Calculate seek time (0.1 seconds before end to ensure we get a valid frame)
    const seekTime = Math.max(0, duration - 0.1);

    // Step 4: Extract frame
    await extractFrame(videoPath, framePath, seekTime);

    // Verify frame was created
    if (!fs.existsSync(framePath)) {
      throw new Error("FFmpeg did not produce output frame");
    }

    // Step 5: Upload to FAL storage
    const frameUrl = await uploadImageToFal(framePath);

    logger.info(
      { frameUrl: frameUrl.substring(0, 50) + "...", duration, seekTime },
      "Last frame extracted and uploaded successfully"
    );

    return {
      success: true,
      frameUrl,
      localPath: cleanup ? undefined : framePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage, videoUrl: videoUrl.substring(0, 50) + "..." }, "Frame extraction failed");

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    if (cleanup) {
      cleanupTempDir(tempDir);
    }
  }
}

/**
 * Extract a frame at a specific position from a video
 *
 * @param videoUrl - URL of the video to extract frame from
 * @param position - Position in seconds, or "first"/"last"
 * @param options - Additional options
 * @returns Frame extraction result with uploaded URL
 */
export async function extractFrameAt(
  videoUrl: string,
  position: "first" | "last" | number,
  options: Omit<ExtractFrameOptions, "position"> = {}
): Promise<FrameExtractionResult> {
  if (position === "last") {
    return extractLastFrame(videoUrl, options);
  }

  const { format = "png", cleanup = true } = options;

  // Check FFmpeg availability
  const ffmpegAvailable = await checkFFmpegAvailable();
  if (!ffmpegAvailable) {
    return {
      success: false,
      error: "FFmpeg not available",
    };
  }

  const tempDir = createTempDir();
  const videoPath = path.join(tempDir, "input.mp4");
  const framePath = path.join(tempDir, `frame.${format}`);

  try {
    // Download video
    await downloadVideo(videoUrl, videoPath);

    // Calculate seek time
    let seekTime: number;
    if (position === "first") {
      seekTime = 0.1; // Slight offset to ensure we get a valid frame
    } else {
      seekTime = position;
    }

    // Extract frame
    await extractFrame(videoPath, framePath, seekTime);

    // Verify and upload
    if (!fs.existsSync(framePath)) {
      throw new Error("FFmpeg did not produce output frame");
    }

    const frameUrl = await uploadImageToFal(framePath);

    return {
      success: true,
      frameUrl,
      localPath: cleanup ? undefined : framePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "Frame extraction failed");

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    if (cleanup) {
      cleanupTempDir(tempDir);
    }
  }
}
