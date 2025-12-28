import OpenAI from 'openai';
import { createOpenAICircuitBreaker } from './resilience';
import { openaiRateLimiter, withRateLimit } from './rate-limiter';
import { logger } from './logger';

/**
 * OpenAI UGC Script Generation for Testimonials
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (500 req/min)
 * - Structured logging
 * - 60s timeout for AI generation
 */

if (!process.env.OPENAI_API_KEY) {
  logger.warn('OPENAI_API_KEY is not set. Script generation will not work.');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  timeout: 60000,
});

/**
 * Get the selected OpenAI model from environment or use default
 */
function getSelectedModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

/**
 * Generate UGC-style video script from testimonial (internal, unprotected)
 *
 * @param testimonial - The customer testimonial text (will be used verbatim)
 * @param targetDuration - Target video duration in seconds (15, 30, 45, 60)
 * @param systemPrompt - Optional custom system prompt
 * @returns High-converting UGC script under 800 characters
 */
async function generateUGCScriptInternal(
  testimonial: string,
  targetDuration: number = 30,
  systemPrompt?: string
): Promise<string> {
  logger.info(
    { testimonialLength: testimonial.length, targetDuration, hasSystemPrompt: !!systemPrompt },
    'Generating UGC video script with AI'
  );

  // Calculate approximate character count for target duration
  // Average speaking rate: ~150 words per minute = 2.5 words per second
  // Average word length: ~5 characters = ~12.5 characters per second
  const targetCharacters = Math.min(targetDuration * 12, 800); // Max 800 chars (Mirage limit)

  const defaultSystemPrompt = `You are an expert UGC (User-Generated Content) ad copywriter specializing in authentic testimonial videos.

Your task is to create a high-converting video script that:
1. Starts with an ENGAGING HOOK (2-4 seconds) that grabs attention
2. Includes the customer's TESTIMONIAL VERBATIM in the middle
3. Ends with a clear CALL-TO-ACTION (3-5 seconds)

CRITICAL RULES:
- Target video length: ${targetDuration} seconds when spoken
- Approximate script length: ${targetCharacters} characters (strict maximum: 800)
- The testimonial text MUST appear word-for-word in your script
- Write for SPOKEN delivery - natural, conversational tone at ~2.5 words per second
- Hook should be attention-grabbing and relate to the testimonial's main benefit
- CTA should be specific and actionable
- Format: Write the full script as one continuous piece for an AI actor to read
- Do NOT include labels like "HOOK:", "TESTIMONIAL:", or "CTA:" - just write the script
- If testimonial is long, you may need to use only key parts verbatim and paraphrase the rest

Duration Guidelines:
- 15 seconds: Very brief hook (1-2s) + core testimonial quote (10-12s) + quick CTA (2-3s)
- 30 seconds: Short hook (3-4s) + full testimonial (20-22s) + CTA (4-6s)
- 45 seconds: Engaging hook (5-6s) + testimonial with context (30-32s) + strong CTA (7-9s)
- 60 seconds: Extended hook (7-8s) + detailed testimonial (40-42s) + compelling CTA (10-12s)

Style: UGC ads should feel authentic, not overly polished. Think "real person sharing their experience" not "professional commercial."`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: systemPrompt || defaultSystemPrompt,
    },
    {
      role: 'user',
      content: `Create a high-converting UGC ad script from this testimonial. Remember to include the testimonial text EXACTLY as written:

"${testimonial}"`,
    },
  ];

  const model = getSelectedModel();

  // GPT-5/o1/o3 models don't support optional parameters
  const isAdvancedModel = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3');

  const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages,
    ...(isAdvancedModel ? {} : { max_tokens: 500, temperature: 0.7 }),
  };

  const completion = await openai.chat.completions.create(completionParams);
  const result = completion.choices[0]?.message?.content || '';

  // Validate script length
  if (result.length > 800) {
    logger.warn({ scriptLength: result.length }, 'Generated script exceeds 800 characters, truncating');
    // Truncate to 800 characters at last complete sentence
    const truncated = result.substring(0, 800);
    const lastPeriod = truncated.lastIndexOf('.');
    const finalScript = lastPeriod > 0 ? truncated.substring(0, lastPeriod + 1) : truncated;

    logger.info({ scriptLength: finalScript.length }, 'UGC script generated and truncated');
    return finalScript;
  }

  logger.info({ scriptLength: result.length }, 'UGC script generated successfully');
  return result;
}

/**
 * Generate UGC-style video script from testimonial (protected with circuit breaker + rate limiting)
 */
const generateUGCScriptWithBreaker = createOpenAICircuitBreaker(generateUGCScriptInternal);

export const generateUGCScript = withRateLimit(
  async (testimonial: string, targetDuration?: number, systemPrompt?: string): Promise<string> => {
    const result = await generateUGCScriptWithBreaker.fire(testimonial, targetDuration, systemPrompt);
    return result as string;
  },
  openaiRateLimiter
);

/**
 * Simple script generation without OpenAI (fallback)
 * Just formats the testimonial with basic hook and CTA
 */
export function generateSimpleScript(
  testimonial: string,
  reviewerName?: string,
  businessName?: string
): string {
  const hook = "You won't believe what happened when I tried this...";
  const cta = businessName
    ? `Check out ${businessName} today!`
    : "Try it for yourself!";

  const script = `${hook} ${testimonial} ${cta}`;

  // Ensure under 800 characters
  if (script.length > 800) {
    const maxTestimonialLength = 800 - hook.length - cta.length - 10;
    const truncatedTestimonial = testimonial.substring(0, maxTestimonialLength) + '...';
    return `${hook} ${truncatedTestimonial} ${cta}`;
  }

  return script;
}
