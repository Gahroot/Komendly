/**
 * Script Segmenter
 * Split testimonial scripts into Hook, Testimonial, and CTA segments
 */

import { logger } from "@/lib/logger";
import type { ClipType, ScriptSegment, SegmentationResult } from "./types";

// ============================================================================
// Configuration
// ============================================================================

/** Speaking rate in words per second */
const WORDS_PER_SECOND = 2.5;

/** Target durations for each segment type (in seconds) */
const SEGMENT_TARGETS = {
  hook: { min: 4, max: 7, ideal: 5 },
  testimonial: { min: 8, max: 25, ideal: 15 },
  cta: { min: 4, max: 7, ideal: 5 },
};

/** Maximum characters per segment (for TTS limits) */
const MAX_CHARS_PER_SEGMENT = 800;

// ============================================================================
// Duration Estimation
// ============================================================================

/**
 * Estimate speaking duration from text
 */
export function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / WORDS_PER_SECOND;
}

/**
 * Estimate word count for target duration
 */
export function wordsForDuration(seconds: number): number {
  return Math.round(seconds * WORDS_PER_SECOND);
}

// ============================================================================
// Text Splitting
// ============================================================================

/**
 * Find natural break points in text (sentence boundaries)
 */
function findSentenceBoundaries(text: string): number[] {
  const boundaries: number[] = [];
  const regex = /[.!?]+\s*/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    boundaries.push(match.index + match[0].length);
  }

  return boundaries;
}

/**
 * Split text at a natural boundary near target position
 */
function splitAtNaturalBoundary(
  text: string,
  targetPosition: number,
  tolerance: number = 50
): { before: string; after: string } {
  const boundaries = findSentenceBoundaries(text);

  // Find closest boundary to target within tolerance
  let closestBoundary = targetPosition;
  let minDistance = tolerance;

  for (const boundary of boundaries) {
    const distance = Math.abs(boundary - targetPosition);
    if (distance < minDistance) {
      minDistance = distance;
      closestBoundary = boundary;
    }
  }

  return {
    before: text.substring(0, closestBoundary).trim(),
    after: text.substring(closestBoundary).trim(),
  };
}

// ============================================================================
// Script Parsing
// ============================================================================

/**
 * Try to extract hook from script (first attention-grabbing sentence)
 */
function extractHook(script: string): { hook: string; remaining: string } {
  const hookPatterns = [
    /^(.+?[!?])\s+/,  // First sentence ending with ! or ?
    /^(.+?\.)\s+/,     // First sentence
  ];

  for (const pattern of hookPatterns) {
    const match = script.match(pattern);
    if (match && match[1].length < 150) {
      return {
        hook: match[1].trim(),
        remaining: script.substring(match[0].length).trim(),
      };
    }
  }

  // Fallback: take first ~5 seconds worth of words
  const words = script.split(/\s+/);
  const hookWords = wordsForDuration(SEGMENT_TARGETS.hook.ideal);
  const hook = words.slice(0, hookWords).join(" ");
  const remaining = words.slice(hookWords).join(" ");

  return { hook, remaining };
}

/**
 * Try to extract CTA from script (last call-to-action sentence)
 */
function extractCTA(script: string): { cta: string; remaining: string } {
  const ctaPatterns = [
    /(.+?)([^.!?]*(?:try|check|visit|get|start|sign up|download|click|learn more|find out)[^.!?]*[.!?])\s*$/i,
    /(.+?)([^.!?]*(?:today|now|for yourself)[^.!?]*[.!?])\s*$/i,
  ];

  for (const pattern of ctaPatterns) {
    const match = script.match(pattern);
    if (match && match[2].length < 150 && match[2].length > 20) {
      return {
        remaining: match[1].trim(),
        cta: match[2].trim(),
      };
    }
  }

  // Fallback: take last ~5 seconds worth of words
  const words = script.split(/\s+/);
  const ctaWords = wordsForDuration(SEGMENT_TARGETS.cta.ideal);
  const cta = words.slice(-ctaWords).join(" ");
  const remaining = words.slice(0, -ctaWords).join(" ");

  return { cta, remaining };
}

// ============================================================================
// Main Segmentation
// ============================================================================

/**
 * Segment a full script into Hook, Testimonial, and CTA parts
 */
export function segmentScript(
  fullScript: string,
  options?: {
    targetTotalDuration?: number;
    hookDuration?: number;
    ctaDuration?: number;
    maxClipDuration?: number;
  }
): SegmentationResult {
  const targetTotal = options?.targetTotalDuration ?? 30;
  const hookTarget = options?.hookDuration ?? SEGMENT_TARGETS.hook.ideal;
  const ctaTarget = options?.ctaDuration ?? SEGMENT_TARGETS.cta.ideal;
  const maxClipDuration = options?.maxClipDuration ?? 10;

  logger.info(
    { scriptLength: fullScript.length, targetTotal, hookTarget, ctaTarget },
    "Segmenting script"
  );

  // Clean up the script
  const cleanScript = fullScript.trim().replace(/\s+/g, " ");

  // Extract hook
  const { hook, remaining: afterHook } = extractHook(cleanScript);

  // Extract CTA
  const { cta, remaining: testimonial } = extractCTA(afterHook);

  // Calculate durations
  const hookDuration = estimateDuration(hook);
  const testimonialDuration = estimateDuration(testimonial);
  const ctaDuration = estimateDuration(cta);

  const segments: ScriptSegment[] = [];

  // Add hook segment
  segments.push({
    type: "hook",
    content: hook,
    estimatedDuration: hookDuration,
    order: 0,
  });

  // Handle long testimonials by splitting into multiple segments
  if (testimonialDuration > maxClipDuration) {
    const testimonialSegments = splitLongText(
      testimonial,
      maxClipDuration,
      "testimonial"
    );
    testimonialSegments.forEach((seg, i) => {
      segments.push({
        ...seg,
        order: 1 + i,
      });
    });
  } else {
    segments.push({
      type: "testimonial",
      content: testimonial,
      estimatedDuration: testimonialDuration,
      order: 1,
    });
  }

  // Add CTA segment
  segments.push({
    type: "cta",
    content: cta,
    estimatedDuration: ctaDuration,
    order: segments.length,
  });

  // Reorder segments
  segments.forEach((seg, i) => {
    seg.order = i;
  });

  const totalDuration = segments.reduce((sum, s) => sum + s.estimatedDuration, 0);

  logger.info(
    {
      clipCount: segments.length,
      totalDuration,
      segments: segments.map((s) => ({
        type: s.type,
        duration: s.estimatedDuration.toFixed(1),
        chars: s.content.length,
      })),
    },
    "Script segmented successfully"
  );

  return {
    segments,
    totalDuration,
    clipCount: segments.length,
  };
}

/**
 * Split long text into multiple segments
 */
function splitLongText(
  text: string,
  maxDurationPerSegment: number,
  type: ClipType
): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  let remaining = text;
  let order = 0;

  while (remaining.length > 0) {
    const targetChars = wordsForDuration(maxDurationPerSegment) * 5; // ~5 chars per word

    if (remaining.length <= targetChars * 1.2) {
      // Remaining text fits in one segment
      segments.push({
        type,
        content: remaining,
        estimatedDuration: estimateDuration(remaining),
        order,
      });
      break;
    }

    // Split at natural boundary
    const { before, after } = splitAtNaturalBoundary(
      remaining,
      targetChars,
      targetChars * 0.2
    );

    if (before.length === 0) {
      // No good split point found, force split
      const words = remaining.split(/\s+/);
      const splitWords = wordsForDuration(maxDurationPerSegment);
      segments.push({
        type,
        content: words.slice(0, splitWords).join(" "),
        estimatedDuration: maxDurationPerSegment,
        order,
      });
      remaining = words.slice(splitWords).join(" ");
    } else {
      segments.push({
        type,
        content: before,
        estimatedDuration: estimateDuration(before),
        order,
      });
      remaining = after;
    }

    order++;

    // Safety limit
    if (order > 10) {
      logger.warn("Script segmentation exceeded 10 segments, truncating");
      break;
    }
  }

  return segments;
}

/**
 * Simple segmentation that splits evenly into 3 parts
 */
export function simpleSegmentScript(fullScript: string): SegmentationResult {
  const cleanScript = fullScript.trim().replace(/\s+/g, " ");
  const totalDuration = estimateDuration(cleanScript);

  // Simple 20/60/20 split
  const hookDuration = totalDuration * 0.2;
  const testimonialDuration = totalDuration * 0.6;
  const ctaDuration = totalDuration * 0.2;

  const words = cleanScript.split(/\s+/);
  const hookWords = wordsForDuration(hookDuration);
  const ctaWords = wordsForDuration(ctaDuration);

  const hook = words.slice(0, hookWords).join(" ");
  const cta = words.slice(-ctaWords).join(" ");
  const testimonial = words.slice(hookWords, -ctaWords).join(" ");

  const segments: ScriptSegment[] = [
    {
      type: "hook",
      content: hook,
      estimatedDuration: hookDuration,
      order: 0,
    },
    {
      type: "testimonial",
      content: testimonial,
      estimatedDuration: testimonialDuration,
      order: 1,
    },
    {
      type: "cta",
      content: cta,
      estimatedDuration: ctaDuration,
      order: 2,
    },
  ];

  return {
    segments,
    totalDuration,
    clipCount: 3,
  };
}

/**
 * Validate segmentation result
 */
export function validateSegmentation(result: SegmentationResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (result.segments.length === 0) {
    errors.push("No segments generated");
  }

  for (const segment of result.segments) {
    if (segment.content.length === 0) {
      errors.push(`Empty content in ${segment.type} segment`);
    }

    if (segment.content.length > MAX_CHARS_PER_SEGMENT) {
      errors.push(
        `${segment.type} segment exceeds ${MAX_CHARS_PER_SEGMENT} characters`
      );
    }

    if (segment.estimatedDuration < 2) {
      errors.push(`${segment.type} segment too short (< 2 seconds)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
