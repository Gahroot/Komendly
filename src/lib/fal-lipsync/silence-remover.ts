/**
 * Silence Remover Utility
 * Trims video clips to end when speech ends, even with background noise
 *
 * Uses FFmpeg's silencedetect to find speech boundaries, then trims the video
 * to end shortly after the last speech segment. This works better than
 * silenceremove when there's background noise (which isn't "silence").
 *
 * The approach:
 * 1. Detect silence periods using silencedetect filter
 * 2. Find where the last speech segment ends
 * 3. Trim video to end shortly after speech ends
 * 4. Also trim any leading silence before speech starts
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { logger } from "@/lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface SilenceRemovalOptions {
  /** Threshold in dB below which audio is considered silence (default: -30) */
  startThreshold?: number;
  /** Threshold in dB for end silence detection (default: -30) */
  stopThreshold?: number;
  /** Minimum silence duration in seconds to detect (default: 0.3) */
  minSilenceDuration?: number;
  /** Buffer time after last speech before trimming (default: 0.2) */
  endBuffer?: number;
  /** Buffer time before first speech (default: 0.1) */
  startBuffer?: number;
}

export interface SilenceRemovalResult {
  success: boolean;
  inputPath: string;
  outputPath: string;
  inputDuration?: number;
  outputDuration?: number;
  silenceRemoved?: number;
  speechStart?: number;
  speechEnd?: number;
  error?: string;
}

export interface BatchSilenceRemovalResult {
  processedPaths: string[];
  totalSilenceRemoved: number;
  results: SilenceRemovalResult[];
}

interface SilencePeriod {
  start: number;
  end: number;
  duration: number;
}

// ============================================================================
// FFmpeg Helpers
// ============================================================================

/**
 * Execute FFmpeg/FFprobe command and return stdout/stderr
 */
async function executeCommand(
  command: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      reject(new Error(`${command} spawn error: ${err.message}`));
    });

    proc.on("close", (code) => {
      // silencedetect outputs to stderr, so code 0 is success
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}

/**
 * Get duration of a media file using FFprobe
 */
async function getMediaDuration(filePath: string): Promise<number> {
  const { stdout } = await executeCommand("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  const duration = parseFloat(stdout.trim());
  if (isNaN(duration)) {
    throw new Error("Failed to parse duration");
  }
  return duration;
}

/**
 * Detect silence periods in audio using FFmpeg silencedetect
 * Returns array of silence periods with start/end times
 */
async function detectSilencePeriods(
  filePath: string,
  threshold: number,
  minDuration: number
): Promise<SilencePeriod[]> {
  // Run silencedetect filter - output goes to stderr
  const { stderr } = await executeCommand("ffmpeg", [
    "-i", filePath,
    "-af", `silencedetect=noise=${threshold}dB:d=${minDuration}`,
    "-f", "null",
    "-",
  ]);

  // Parse silence_start and silence_end from stderr
  // Format: [silencedetect @ 0x...] silence_start: 5.678
  // Format: [silencedetect @ 0x...] silence_end: 7.890 | silence_duration: 2.212
  const periods: SilencePeriod[] = [];
  let currentStart: number | null = null;

  const lines = stderr.split("\n");
  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);

    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
    } else if (endMatch && currentStart !== null) {
      periods.push({
        start: currentStart,
        end: parseFloat(endMatch[1]),
        duration: parseFloat(endMatch[2]),
      });
      currentStart = null;
    }
  }

  // Handle case where silence extends to end of file (no silence_end)
  if (currentStart !== null) {
    try {
      const duration = await getMediaDuration(filePath);
      periods.push({
        start: currentStart,
        end: duration,
        duration: duration - currentStart,
      });
    } catch {
      // Ignore if we can't get duration
    }
  }

  return periods;
}

/**
 * Find speech boundaries from silence periods
 * Returns the time when first speech starts and last speech ends
 */
function findSpeechBoundaries(
  silencePeriods: SilencePeriod[],
  totalDuration: number
): { speechStart: number; speechEnd: number } {
  if (silencePeriods.length === 0) {
    // No silence detected - assume speech throughout
    return { speechStart: 0, speechEnd: totalDuration };
  }

  // Sort by start time
  const sorted = [...silencePeriods].sort((a, b) => a.start - b.start);

  // Find speech start (end of first silence if it starts at 0, otherwise 0)
  let speechStart = 0;
  if (sorted[0].start < 0.1) {
    // Silence at the beginning - speech starts when silence ends
    speechStart = sorted[0].end;
  }

  // Find speech end (start of last significant silence period)
  // We look for silence that extends close to the end of the file
  let speechEnd = totalDuration;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const silence = sorted[i];
    // If silence extends to within 0.5s of the end, speech ended before it
    if (silence.end >= totalDuration - 0.5) {
      speechEnd = silence.start;
      break;
    }
  }

  return { speechStart, speechEnd };
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Trim video to speech boundaries
 *
 * Uses silencedetect to find where speech actually starts and ends,
 * then trims the video accordingly. This works even with background noise
 * because we're detecting speech gaps, not just quiet audio.
 *
 * @param inputPath - Path to input video file
 * @param outputPath - Path for output video file
 * @param options - Silence removal options
 * @returns Result with duration information
 */
export async function removeSilence(
  inputPath: string,
  outputPath: string,
  options?: SilenceRemovalOptions
): Promise<SilenceRemovalResult> {
  const {
    startThreshold = -30,
    stopThreshold = -30,
    minSilenceDuration = 0.3,
    endBuffer = 0.2,
    startBuffer = 0.1,
  } = options ?? {};

  logger.debug(
    { inputPath, outputPath, startThreshold, stopThreshold, minSilenceDuration },
    "Starting speech-based trimming"
  );

  try {
    // Get input duration
    const inputDuration = await getMediaDuration(inputPath);

    // Detect silence periods
    // Use the more sensitive threshold for detection
    const threshold = Math.max(startThreshold, stopThreshold);
    const silencePeriods = await detectSilencePeriods(inputPath, threshold, minSilenceDuration);

    logger.debug(
      { silencePeriods: silencePeriods.length, inputDuration },
      "Silence periods detected"
    );

    // Find speech boundaries
    const { speechStart, speechEnd } = findSpeechBoundaries(silencePeriods, inputDuration);

    // Calculate trim points with buffers
    const trimStart = Math.max(0, speechStart - startBuffer);
    const trimEnd = Math.min(inputDuration, speechEnd + endBuffer);
    const trimDuration = trimEnd - trimStart;

    logger.debug(
      { speechStart, speechEnd, trimStart, trimEnd, trimDuration },
      "Calculated trim points"
    );

    // If no significant trimming needed, copy the file
    if (trimStart < 0.1 && trimEnd >= inputDuration - 0.1) {
      fs.copyFileSync(inputPath, outputPath);
      logger.info({ inputPath }, "No trimming needed, copied original");
      return {
        success: true,
        inputPath,
        outputPath,
        inputDuration,
        outputDuration: inputDuration,
        silenceRemoved: 0,
        speechStart,
        speechEnd,
      };
    }

    // Trim the video using FFmpeg
    const ffmpegArgs = [
      "-y",
      "-i", inputPath,
      "-ss", trimStart.toFixed(3),
      "-t", trimDuration.toFixed(3),
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      outputPath,
    ];

    await executeCommand("ffmpeg", ffmpegArgs);

    // Verify output exists
    if (!fs.existsSync(outputPath)) {
      throw new Error("FFmpeg did not produce output file");
    }

    // Get output duration
    const outputDuration = await getMediaDuration(outputPath);
    const silenceRemoved = Math.max(0, inputDuration - outputDuration);

    logger.info(
      {
        inputPath: path.basename(inputPath),
        inputDuration: inputDuration.toFixed(2),
        outputDuration: outputDuration.toFixed(2),
        silenceRemoved: silenceRemoved.toFixed(2),
        speechStart: speechStart.toFixed(2),
        speechEnd: speechEnd.toFixed(2),
      },
      "Clip trimmed to speech boundaries"
    );

    return {
      success: true,
      inputPath,
      outputPath,
      inputDuration,
      outputDuration,
      silenceRemoved,
      speechStart,
      speechEnd,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage, inputPath }, "Failed to trim clip");

    // On failure, copy original file
    try {
      fs.copyFileSync(inputPath, outputPath);
      const duration = await getMediaDuration(inputPath);
      return {
        success: true, // Still "success" since we have a usable output
        inputPath,
        outputPath,
        inputDuration: duration,
        outputDuration: duration,
        silenceRemoved: 0,
        error: `Fallback to original: ${errorMessage}`,
      };
    } catch {
      return {
        success: false,
        inputPath,
        outputPath,
        error: errorMessage,
      };
    }
  }
}

/**
 * Trim multiple clips to speech boundaries
 *
 * Processes each clip and returns the paths to the processed files.
 *
 * @param clipPaths - Array of paths to video clips
 * @param tempDir - Temporary directory for processed files
 * @param options - Silence removal options
 * @returns Processed paths and total silence removed
 */
export async function removeSilenceFromClips(
  clipPaths: string[],
  tempDir: string,
  options?: SilenceRemovalOptions
): Promise<BatchSilenceRemovalResult> {
  const results: SilenceRemovalResult[] = [];
  const processedPaths: string[] = [];
  let totalSilenceRemoved = 0;

  logger.info(
    { clipCount: clipPaths.length, tempDir },
    "Starting batch speech-based trimming"
  );

  for (let i = 0; i < clipPaths.length; i++) {
    const inputPath = clipPaths[i];
    const outputPath = path.join(tempDir, `trimmed-${i}.mp4`);

    const result = await removeSilence(inputPath, outputPath, options);
    results.push(result);

    if (result.success) {
      processedPaths.push(outputPath);
      totalSilenceRemoved += result.silenceRemoved ?? 0;
    } else {
      // If trimming failed, use the original file
      logger.warn(
        { inputPath, error: result.error },
        "Trimming failed, using original clip"
      );
      processedPaths.push(inputPath);
    }
  }

  logger.info(
    {
      clipCount: clipPaths.length,
      totalSilenceRemoved: totalSilenceRemoved.toFixed(2),
      successCount: results.filter((r) => r.success).length,
    },
    "Batch trimming completed"
  );

  return {
    processedPaths,
    totalSilenceRemoved,
    results,
  };
}
