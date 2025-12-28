import {
  generateUGCScript,
  type Review,
  type ScriptOptions,
  type UGCScript,
  type VideoLength,
  type HookType,
  getTimingConfig,
} from './script-generator';

// ============================================================================
// Types
// ============================================================================

export interface TestimonialPromptParams {
  reviewText: string;
  reviewerName: string;
  businessName: string;
  style: string;
  productName?: string;
  videoLength?: VideoLength;
  hookType?: HookType;
  targetAudience?: string;
  keyBenefit?: string;
}

export interface DetailedPromptResult {
  prompt: string;
  script: UGCScript;
  timingMarkers: string[];
  sections: {
    name: string;
    timing: string;
    content: string;
    notes: string;
  }[];
}

// ============================================================================
// Style Descriptions
// ============================================================================

const styleDescriptions: Record<string, string> = {
  professional: "professional, corporate setting, business attire",
  casual: "casual, relaxed setting, everyday clothing",
  friendly: "warm, welcoming, approachable demeanor",
  energetic: "high energy, enthusiastic, dynamic movements",
  calm: "serene, peaceful, gentle expressions",
  bold: "confident, strong presence, direct eye contact",
  warm: "cozy, inviting, natural warmth",
  corporate: "business professional, office environment",
};

// ============================================================================
// Main Prompt Builder (Original - Backwards Compatible)
// ============================================================================

export function buildTestimonialPrompt(params: {
  reviewText: string;
  reviewerName: string;
  businessName: string;
  style: string;
}): string {
  const styleDesc = styleDescriptions[params.style] || styleDescriptions.professional;

  return `A person giving a genuine video testimonial review. They are ${styleDesc}.
The person is speaking directly to camera, expressing satisfaction about ${params.businessName}.
They appear authentic and trustworthy, like a real customer sharing their experience.
UGC style, selfie video, natural lighting, vertical phone recording.`;
}

// ============================================================================
// Enhanced UGC Prompt Builder
// ============================================================================

/**
 * Builds a detailed UGC-optimized prompt with full script and timing markers
 */
export function buildUGCTestimonialPrompt(params: TestimonialPromptParams): DetailedPromptResult {
  // Create review object for script generator
  const review: Review = {
    text: params.reviewText,
    reviewerName: params.reviewerName,
  };

  // Create script options
  const scriptOptions: ScriptOptions = {
    businessName: params.businessName,
    productName: params.productName,
    videoLength: params.videoLength || '30s',
    hookType: params.hookType,
    style: params.style,
    targetAudience: params.targetAudience,
    keyBenefit: params.keyBenefit,
  };

  // Generate the UGC script
  const script = generateUGCScript(review, scriptOptions);

  // Build timing markers
  const timingMarkers = script.sections.map(section => {
    return `[${section.startTime}s-${section.endTime}s] ${section.type.toUpperCase()}`;
  });

  // Build detailed sections
  const sections = script.sections.map(section => ({
    name: section.type.charAt(0).toUpperCase() + section.type.slice(1),
    timing: `${section.startTime}s - ${section.endTime}s`,
    content: section.content,
    notes: section.speakingNotes || '',
  }));

  // Build the final prompt
  const styleDesc = styleDescriptions[params.style] || styleDescriptions.friendly;
  // Get timing config for video length (used for pacing guidance)
  void getTimingConfig(params.videoLength || '30s');

  const prompt = buildDetailedVideoPrompt({
    script,
    styleDesc,
    businessName: params.businessName,
    totalDuration: script.totalDuration,
  });

  return {
    prompt,
    script,
    timingMarkers,
    sections,
  };
}

// ============================================================================
// Detailed Video Prompt Generator
// ============================================================================

interface DetailedPromptParams {
  script: UGCScript;
  styleDesc: string;
  businessName: string;
  totalDuration: number;
}

function buildDetailedVideoPrompt(params: DetailedPromptParams): string {
  const { script, styleDesc, businessName, totalDuration } = params;

  // Build section-by-section timing instructions
  const sectionInstructions = script.sections.map(section => {
    const duration = section.endTime - section.startTime;
    return `[${section.startTime}s-${section.endTime}s | ${duration}s] ${section.type.toUpperCase()}
  - Expression: ${section.speakingNotes}
  - Content: "${section.content}"`;
  }).join('\n\n');

  // Hook-specific emotional guidance
  const hookEmotions: Record<string, string> = {
    question: "starts with curious, slightly surprised expression, as if sharing a discovery",
    emotional: "begins with expressive, animated energy, genuinely enthusiastic",
    curiosity: "opens with intrigued, excited-to-share demeanor, slightly conspiratorial",
    skeptical: "starts with honest, relatable skepticism that transforms to genuine belief",
    relatable: "opens with understanding, empathetic connection, like talking to a friend",
  };

  const emotionalGuidance = hookEmotions[script.hookType] || hookEmotions.curiosity;

  return `UGC-STYLE TESTIMONIAL VIDEO (${totalDuration} seconds)

VISUAL STYLE:
- ${styleDesc}
- Vertical phone-style selfie video format (9:16)
- Natural lighting, authentic environment
- Speaking directly to camera
- Genuine customer sharing real experience with ${businessName}

EMOTIONAL ARC:
- ${emotionalGuidance}
- Transitions naturally through the testimonial journey
- Ends with warm, conversational recommendation

SCRIPT STRUCTURE WITH TIMING:

${sectionInstructions}

FULL SPOKEN SCRIPT:
"${script.fullScript}"

PRODUCTION NOTES:
- Authentic UGC feel, not overly polished or produced
- Natural gestures and expressions
- Genuine eye contact with camera (audience connection)
- Conversational pacing, not rushed
- Real person energy, relatable and trustworthy`;
}

// ============================================================================
// Quick Prompt Builders for Specific Video Lengths
// ============================================================================

/**
 * Build a prompt optimized for short-form content (15 seconds)
 */
export function buildShortFormPrompt(params: Omit<TestimonialPromptParams, 'videoLength'>): DetailedPromptResult {
  return buildUGCTestimonialPrompt({ ...params, videoLength: '15s' });
}

/**
 * Build a prompt optimized for standard UGC content (30 seconds)
 */
export function buildStandardPrompt(params: Omit<TestimonialPromptParams, 'videoLength'>): DetailedPromptResult {
  return buildUGCTestimonialPrompt({ ...params, videoLength: '30s' });
}

/**
 * Build a prompt optimized for long-form content (60 seconds)
 */
export function buildLongFormPrompt(params: Omit<TestimonialPromptParams, 'videoLength'>): DetailedPromptResult {
  return buildUGCTestimonialPrompt({ ...params, videoLength: '60s' });
}

// ============================================================================
// Hook-Specific Prompt Builders
// ============================================================================

/**
 * Build a prompt with a question-based hook
 */
export function buildQuestionHookPrompt(params: Omit<TestimonialPromptParams, 'hookType'>): DetailedPromptResult {
  return buildUGCTestimonialPrompt({ ...params, hookType: 'question' });
}

/**
 * Build a prompt with an emotional hook
 */
export function buildEmotionalHookPrompt(params: Omit<TestimonialPromptParams, 'hookType'>): DetailedPromptResult {
  return buildUGCTestimonialPrompt({ ...params, hookType: 'emotional' });
}

/**
 * Build a prompt with a curiosity-based hook
 */
export function buildCuriosityHookPrompt(params: Omit<TestimonialPromptParams, 'hookType'>): DetailedPromptResult {
  return buildUGCTestimonialPrompt({ ...params, hookType: 'curiosity' });
}

/**
 * Build a prompt with a skeptical-turned-believer hook
 */
export function buildSkepticalHookPrompt(params: Omit<TestimonialPromptParams, 'hookType'>): DetailedPromptResult {
  return buildUGCTestimonialPrompt({ ...params, hookType: 'skeptical' });
}

/**
 * Build a prompt with a relatable hook
 */
export function buildRelatableHookPrompt(params: Omit<TestimonialPromptParams, 'hookType'>): DetailedPromptResult {
  return buildUGCTestimonialPrompt({ ...params, hookType: 'relatable' });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a simple prompt string from detailed result
 */
export function extractPromptString(result: DetailedPromptResult): string {
  return result.prompt;
}

/**
 * Format timing markers as a readable string
 */
export function formatTimingMarkers(markers: string[]): string {
  return markers.join(' -> ');
}

/**
 * Get section summary for display
 */
export function getSectionSummary(result: DetailedPromptResult): string {
  return result.sections
    .map(s => `${s.name} (${s.timing}): ${s.content}`)
    .join('\n');
}

// Re-export types from script-generator for convenience
export type {
  Review,
  ScriptOptions,
  UGCScript,
  VideoLength,
  HookType,
  ScriptSection,
  ScriptSectionType,
} from './script-generator';

// Re-export utility functions from script-generator
export {
  generateUGCScript,
  getHookTemplates,
  getHookTypes,
  getTimingConfig,
  validateScriptOptions,
  generateScriptVariations,
} from './script-generator';
