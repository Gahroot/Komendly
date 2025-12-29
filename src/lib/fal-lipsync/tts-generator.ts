/**
 * TTS Generator
 * OpenAI Text-to-Speech wrapper for generating audio from script segments
 */

import OpenAI from "openai";
import { logger } from "@/lib/logger";
import type { TTSVoice, TTSOptions, TTSResult } from "./types";

// ============================================================================
// OpenAI Client
// ============================================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
  timeout: 60000,
});

// ============================================================================
// Voice Configuration
// ============================================================================

/** Available TTS voices with descriptions */
export const TTS_VOICES: Record<TTSVoice, { name: string; description: string }> = {
  alloy: { name: "Alloy", description: "Neutral and balanced" },
  echo: { name: "Echo", description: "Warm and conversational" },
  fable: { name: "Fable", description: "British and expressive" },
  onyx: { name: "Onyx", description: "Deep and authoritative" },
  nova: { name: "Nova", description: "Friendly and upbeat" },
  shimmer: { name: "Shimmer", description: "Soft and gentle" },
};

/** Default voice for testimonials */
export const DEFAULT_VOICE: TTSVoice = "nova";

/** Default TTS model */
export const DEFAULT_MODEL = "tts-1";

// ============================================================================
// TTS Generation
// ============================================================================

/**
 * Generate TTS audio from text
 */
export async function generateTTS(
  text: string,
  options?: Partial<TTSOptions>
): Promise<TTSResult> {
  const voice = options?.voice ?? DEFAULT_VOICE;
  const model = options?.model ?? DEFAULT_MODEL;
  const speed = options?.speed ?? 1.0;

  logger.info(
    { textLength: text.length, voice, model, speed },
    "Generating TTS audio"
  );

  try {
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text,
      speed,
    });

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    logger.info(
      { bufferSize: audioBuffer.length, voice },
      "TTS audio generated successfully"
    );

    return {
      audioBuffer,
    };
  } catch (error) {
    logger.error({ error, voice, model }, "Failed to generate TTS audio");
    throw error;
  }
}

/**
 * Generate TTS and upload to storage, returning URL
 */
export async function generateTTSWithUpload(
  text: string,
  uploadFn: (buffer: Buffer, filename: string) => Promise<string>,
  options?: Partial<TTSOptions> & { filename?: string }
): Promise<TTSResult> {
  const result = await generateTTS(text, options);

  const filename = options?.filename ?? `tts-${Date.now()}.mp3`;
  const audioUrl = await uploadFn(result.audioBuffer, filename);

  return {
    ...result,
    audioUrl,
  };
}

/**
 * Estimate audio duration from text
 * Based on average speaking rate of ~150 words per minute
 */
export function estimateAudioDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerSecond = 2.5; // ~150 WPM
  return words / wordsPerSecond;
}

/**
 * Get recommended voice for actor gender
 */
export function getRecommendedVoice(gender: "male" | "female"): TTSVoice {
  // Map genders to suitable voices
  const voiceMap: Record<"male" | "female", TTSVoice[]> = {
    male: ["onyx", "echo", "fable"],
    female: ["nova", "shimmer", "alloy"],
  };

  const voices = voiceMap[gender];
  return voices[0]; // Return first (primary) voice
}

/**
 * Validate text length for TTS
 * OpenAI TTS has a 4096 character limit
 */
export function validateTTSText(text: string): {
  valid: boolean;
  error?: string;
  truncated?: string;
} {
  const MAX_LENGTH = 4096;

  if (!text || text.trim().length === 0) {
    return { valid: false, error: "Text cannot be empty" };
  }

  if (text.length <= MAX_LENGTH) {
    return { valid: true };
  }

  // Truncate at last sentence boundary within limit
  const truncated = text.substring(0, MAX_LENGTH);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastQuestion = truncated.lastIndexOf("?");
  const lastExclaim = truncated.lastIndexOf("!");

  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclaim);

  if (lastSentenceEnd > MAX_LENGTH * 0.5) {
    return {
      valid: true,
      truncated: truncated.substring(0, lastSentenceEnd + 1),
    };
  }

  return {
    valid: true,
    truncated: truncated.substring(0, MAX_LENGTH - 3) + "...",
  };
}
