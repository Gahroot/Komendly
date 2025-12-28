/**
 * UGC (User Generated Content) Video Script Generator
 *
 * Generates authentic, conversion-optimized video scripts from customer reviews
 * following proven UGC formula: Hook -> Problem -> Solution -> Proof -> CTA
 */

// ============================================================================
// Types
// ============================================================================

export type ScriptSectionType = 'hook' | 'problem' | 'solution' | 'proof' | 'cta';

export type HookType = 'question' | 'emotional' | 'curiosity' | 'skeptical' | 'relatable';

export type VideoLength = '15s' | '30s' | '60s';

export interface ScriptSection {
  type: ScriptSectionType;
  content: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  speakingNotes?: string;
}

export interface UGCScript {
  sections: ScriptSection[];
  totalDuration: number;
  hookType: HookType;
  fullScript: string;
  promptText: string; // Optimized for AI video generation
}

export interface Review {
  text: string;
  reviewerName: string;
  rating?: number;
  date?: string;
}

export interface ScriptOptions {
  businessName: string;
  productName?: string;
  videoLength: VideoLength;
  hookType?: HookType;
  style?: string;
  targetAudience?: string;
  keyBenefit?: string;
}

// ============================================================================
// Timing Configuration
// ============================================================================

interface TimingConfig {
  hook: { start: number; end: number };
  problem: { start: number; end: number };
  solution: { start: number; end: number };
  proof: { start: number; end: number };
  cta: { start: number; end: number };
}

const TIMING_CONFIGS: Record<VideoLength, TimingConfig> = {
  '15s': {
    hook: { start: 0, end: 2 },
    problem: { start: 2, end: 4 },
    solution: { start: 4, end: 8 },
    proof: { start: 8, end: 12 },
    cta: { start: 12, end: 15 },
  },
  '30s': {
    hook: { start: 0, end: 3 },
    problem: { start: 3, end: 7 },
    solution: { start: 7, end: 15 },
    proof: { start: 15, end: 25 },
    cta: { start: 25, end: 30 },
  },
  '60s': {
    hook: { start: 0, end: 5 },
    problem: { start: 5, end: 15 },
    solution: { start: 15, end: 30 },
    proof: { start: 30, end: 50 },
    cta: { start: 50, end: 60 },
  },
};

// ============================================================================
// Hook Templates
// ============================================================================

interface HookTemplate {
  type: HookType;
  templates: string[];
}

const HOOK_TEMPLATES: HookTemplate[] = [
  {
    type: 'question',
    templates: [
      "Wait, have you been doing THIS wrong the whole time?",
      "Why didn't anyone tell me about {businessName} sooner?",
      "What if I told you {keyBenefit} was actually possible?",
      "Struggling with {problem}? I was too, until...",
      "Ever wonder why some people just get {keyBenefit}?",
    ],
  },
  {
    type: 'emotional',
    templates: [
      "I was SO frustrated with {problem}...",
      "The thing I hated most was {problem}. Then everything changed.",
      "I'm literally obsessed with {businessName} right now.",
      "This is the best decision I've made all year.",
      "I cannot stop talking about this to everyone I know.",
    ],
  },
  {
    type: 'curiosity',
    templates: [
      "Okay so I found something that actually works...",
      "I tried something different and wow.",
      "Nobody's talking about this but they should be.",
      "Let me show you what changed everything for me.",
      "I discovered something that I need to share.",
    ],
  },
  {
    type: 'skeptical',
    templates: [
      "I was skeptical about {businessName}, but...",
      "Honestly? I didn't think this would work. But here's what happened.",
      "I wasn't expecting much, I'll be real.",
      "I almost didn't try this. So glad I did.",
      "I've tried everything. Nothing worked. Until this.",
    ],
  },
  {
    type: 'relatable',
    templates: [
      "POV: You finally found something that actually works.",
      "Me before vs. after discovering {businessName}.",
      "If you're struggling with {problem}, you NEED to see this.",
      "This is for my people who've tried everything.",
      "Finally, something made for people like us.",
    ],
  },
];

// ============================================================================
// Problem Templates
// ============================================================================

const PROBLEM_TEMPLATES = [
  "I used to {painPoint} and it was honestly exhausting.",
  "Every time I tried to {painPoint}, I'd just get frustrated.",
  "I was spending so much time and money on {painPoint} with no results.",
  "I felt stuck because {painPoint} just wasn't getting better.",
  "The worst part was {painPoint} and not knowing what to do about it.",
];

// ============================================================================
// Solution Templates
// ============================================================================

const SOLUTION_TEMPLATES = [
  "Then I discovered {businessName} and it completely changed things.",
  "That's when someone recommended {businessName} to me.",
  "I finally tried {businessName} and honestly wish I'd done it sooner.",
  "Enter {businessName}. Game. Changer.",
  "{businessName} came into my life and everything shifted.",
];

// ============================================================================
// Proof Templates
// ============================================================================

const PROOF_TEMPLATES = [
  "Now {result}. Seriously, the difference is unreal.",
  "Fast forward to today and {result}.",
  "The results speak for themselves: {result}.",
  "I've been using it for a while now and {result}.",
  "What I love most is that {result}.",
];

// ============================================================================
// CTA Templates
// ============================================================================

const CTA_TEMPLATES = [
  "If you're dealing with this too, just try it. You won't regret it.",
  "Honestly, just give it a shot. What do you have to lose?",
  "Link is in my bio if you want to check them out.",
  "Trust me on this one. Go check out {businessName}.",
  "Do yourself a favor and look into {businessName}.",
  "I really think you'll love it as much as I do.",
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts key information from review text
 */
function extractReviewInsights(reviewText: string): {
  painPoint: string;
  result: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  keyPhrases: string[];
} {
  const text = reviewText.toLowerCase();

  // Detect sentiment
  const positiveWords = ['love', 'amazing', 'great', 'excellent', 'best', 'fantastic', 'wonderful', 'perfect', 'recommend', 'happy'];
  const negativeWords = ['bad', 'terrible', 'worst', 'hate', 'awful', 'disappointed', 'poor', 'waste'];

  const positiveCount = positiveWords.filter(w => text.includes(w)).length;
  const negativeCount = negativeWords.filter(w => text.includes(w)).length;

  let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (positiveCount > negativeCount) sentiment = 'positive';
  else if (negativeCount > positiveCount) sentiment = 'negative';

  // Extract pain points (common patterns)
  const painPatterns = [
    /(?:was|were|had been|used to be)\s+(?:struggling|dealing|frustrated|tired|sick)\s+(?:with|of)\s+(.+?)(?:\.|,|!|$)/i,
    /(?:before|used to|couldn't|wasn't able to)\s+(.+?)(?:\.|,|!|$)/i,
    /(?:problem|issue|challenge|difficulty)\s+(?:with|was)\s+(.+?)(?:\.|,|!|$)/i,
  ];

  let painPoint = "finding the right solution";
  for (const pattern of painPatterns) {
    const match = reviewText.match(pattern);
    if (match && match[1]) {
      painPoint = match[1].trim();
      break;
    }
  }

  // Extract results (common patterns)
  const resultPatterns = [
    /(?:now|finally|after)\s+(?:I|we|my)\s+(.+?)(?:\.|!|$)/i,
    /(?:love|helped|improved|changed)\s+(.+?)(?:\.|!|$)/i,
    /(?:result|difference|change)\s+(?:is|was|has been)\s+(.+?)(?:\.|!|$)/i,
  ];

  let result = "everything is so much better";
  for (const pattern of resultPatterns) {
    const match = reviewText.match(pattern);
    if (match && match[1]) {
      result = match[1].trim();
      break;
    }
  }

  // Extract key phrases (sentences with strong sentiment)
  const sentences = reviewText.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const keyPhrases = sentences
    .filter(s => positiveWords.some(w => s.toLowerCase().includes(w)))
    .slice(0, 3)
    .map(s => s.trim());

  return { painPoint, result, sentiment, keyPhrases };
}

/**
 * Selects and fills a template with provided values
 */
function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Randomly selects an item from an array
 */
function randomPick<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Determines the best hook type based on review content
 */
function determineHookType(review: Review, options: ScriptOptions): HookType {
  if (options.hookType) return options.hookType;

  const text = review.text.toLowerCase();

  // Check for skepticism patterns
  if (text.includes('skeptical') || text.includes('didn\'t expect') || text.includes('surprised')) {
    return 'skeptical';
  }

  // Check for strong emotional patterns
  if (text.includes('love') || text.includes('amazing') || text.includes('obsessed')) {
    return 'emotional';
  }

  // Check for problem-solving patterns
  if (text.includes('struggled') || text.includes('tried everything') || text.includes('finally')) {
    return 'relatable';
  }

  // Check for question-worthy content
  if (text.includes('wish') || text.includes('sooner') || text.includes('why')) {
    return 'question';
  }

  // Default to curiosity
  return 'curiosity';
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generates a complete UGC video script from a customer review
 */
export function generateUGCScript(review: Review, options: ScriptOptions): UGCScript {
  const timing = TIMING_CONFIGS[options.videoLength];
  const insights = extractReviewInsights(review.text);
  const hookType = determineHookType(review, options);

  // Prepare template values
  const templateValues: Record<string, string> = {
    businessName: options.businessName,
    productName: options.productName || options.businessName,
    keyBenefit: options.keyBenefit || 'real results',
    problem: insights.painPoint,
    painPoint: insights.painPoint,
    result: insights.result,
    reviewerName: review.reviewerName,
    targetAudience: options.targetAudience || 'anyone',
  };

  // Generate hook section
  const hookTemplates = HOOK_TEMPLATES.find(h => h.type === hookType)?.templates || HOOK_TEMPLATES[0].templates;
  const hookContent = fillTemplate(randomPick(hookTemplates), templateValues);

  // Generate problem section
  const problemContent = fillTemplate(randomPick(PROBLEM_TEMPLATES), templateValues);

  // Generate solution section
  const solutionContent = fillTemplate(randomPick(SOLUTION_TEMPLATES), templateValues);

  // Generate proof section - use actual review content
  const proofContent = insights.keyPhrases.length > 0
    ? insights.keyPhrases[0]
    : fillTemplate(randomPick(PROOF_TEMPLATES), templateValues);

  // Generate CTA section
  const ctaContent = fillTemplate(randomPick(CTA_TEMPLATES), templateValues);

  // Build sections with timing
  const sections: ScriptSection[] = [
    {
      type: 'hook',
      content: hookContent,
      startTime: timing.hook.start,
      endTime: timing.hook.end,
      speakingNotes: 'Deliver with energy and eye contact. Pattern interrupt.',
    },
    {
      type: 'problem',
      content: problemContent,
      startTime: timing.problem.start,
      endTime: timing.problem.end,
      speakingNotes: 'Show empathy. Relatable expression. Slight frustration.',
    },
    {
      type: 'solution',
      content: solutionContent,
      startTime: timing.solution.start,
      endTime: timing.solution.end,
      speakingNotes: 'Transition to hope. Natural product mention. Genuine enthusiasm.',
    },
    {
      type: 'proof',
      content: proofContent,
      startTime: timing.proof.start,
      endTime: timing.proof.end,
      speakingNotes: 'Confident delivery. Share real results. Authentic excitement.',
    },
    {
      type: 'cta',
      content: ctaContent,
      startTime: timing.cta.start,
      endTime: timing.cta.end,
      speakingNotes: 'Conversational, not pushy. Friend recommending to friend.',
    },
  ];

  // Combine into full script
  const fullScript = sections.map(s => s.content).join(' ');

  // Generate AI video prompt
  const promptText = generateVideoPrompt(sections, options, hookType);

  return {
    sections,
    totalDuration: timing.cta.end,
    hookType,
    fullScript,
    promptText,
  };
}

/**
 * Generates an optimized prompt for AI video generation
 */
function generateVideoPrompt(
  sections: ScriptSection[],
  options: ScriptOptions,
  hookType: HookType
): string {
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

  const hookEmotions: Record<HookType, string> = {
    question: "curious, engaged, slightly surprised",
    emotional: "expressive, passionate, animated",
    curiosity: "intrigued, excited to share, conspiratorial",
    skeptical: "honest, genuine, authentic transformation",
    relatable: "friendly, understanding, empathetic",
  };

  const style = options.style || 'friendly';
  const styleDesc = styleDescriptions[style] || styleDescriptions.friendly;
  const emotionDesc = hookEmotions[hookType];

  // Build timing markers into prompt
  const timingMarkers = sections.map(s =>
    `[${s.startTime}s-${s.endTime}s] ${s.type.toUpperCase()}: ${s.speakingNotes}`
  ).join(' ');

  return `A person giving an authentic UGC-style video testimonial. They are ${styleDesc}.

Expression and emotion: ${emotionDesc}.

The person is speaking directly to camera in a vertical phone-style selfie video format.
Natural lighting, authentic feel, like a real customer sharing their genuine experience with ${options.businessName}.

Video structure with timing:
${timingMarkers}

The video should feel organic and unscripted, like genuine user-generated content.
Authentic, trustworthy, relatable - not polished or overly produced.`;
}

// ============================================================================
// Additional Utility Functions
// ============================================================================

/**
 * Get all available hook templates for a specific type
 */
export function getHookTemplates(hookType: HookType): string[] {
  return HOOK_TEMPLATES.find(h => h.type === hookType)?.templates || [];
}

/**
 * Get all hook types
 */
export function getHookTypes(): HookType[] {
  return ['question', 'emotional', 'curiosity', 'skeptical', 'relatable'];
}

/**
 * Get timing configuration for a video length
 */
export function getTimingConfig(videoLength: VideoLength): TimingConfig {
  return TIMING_CONFIGS[videoLength];
}

/**
 * Validate script options
 */
export function validateScriptOptions(options: Partial<ScriptOptions>): options is ScriptOptions {
  return !!(options.businessName && options.videoLength);
}

/**
 * Generate multiple script variations
 */
export function generateScriptVariations(
  review: Review,
  options: ScriptOptions,
  count: number = 3
): UGCScript[] {
  const hookTypes: HookType[] = ['question', 'emotional', 'curiosity', 'skeptical', 'relatable'];
  const scripts: UGCScript[] = [];

  for (let i = 0; i < count; i++) {
    const hookType = hookTypes[i % hookTypes.length];
    scripts.push(generateUGCScript(review, { ...options, hookType }));
  }

  return scripts;
}
