export const AVATAR_STYLES = [
  { id: "professional", name: "Professional", description: "Clean, corporate look", gradient: "from-slate-600 to-slate-800" },
  { id: "casual", name: "Casual", description: "Relaxed, everyday vibe", gradient: "from-amber-400 to-orange-500" },
  { id: "friendly", name: "Friendly", description: "Warm and approachable", gradient: "from-pink-400 to-rose-500" },
  { id: "energetic", name: "Energetic", description: "High energy, exciting", gradient: "from-yellow-400 to-red-500" },
  { id: "calm", name: "Calm", description: "Soothing and peaceful", gradient: "from-cyan-400 to-blue-500" },
  { id: "bold", name: "Bold", description: "Strong and confident", gradient: "from-purple-500 to-indigo-600" },
  { id: "warm", name: "Warm", description: "Cozy and inviting", gradient: "from-orange-400 to-red-400" },
  { id: "corporate", name: "Corporate", description: "Business professional", gradient: "from-blue-600 to-blue-800" },
] as const;

// Platform specification interface
export interface PlatformSpec {
  name: string;
  icon: string; // lucide-react icon name
  ratio: string;
  width: number;
  height: number;
  maxDuration?: number; // in seconds
}

// Platform specifications for each social media platform
export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  tiktok: {
    name: "TikTok",
    icon: "Music2",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    maxDuration: 60,
  },
  instagramReels: {
    name: "Instagram Reels",
    icon: "Instagram",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    maxDuration: 90,
  },
  youtubeShorts: {
    name: "YouTube Shorts",
    icon: "Youtube",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    maxDuration: 60,
  },
  youtube: {
    name: "YouTube",
    icon: "Youtube",
    ratio: "16:9",
    width: 1920,
    height: 1080,
  },
  instagramFeedSquare: {
    name: "Instagram Feed",
    icon: "Instagram",
    ratio: "1:1",
    width: 1080,
    height: 1080,
  },
  instagramFeedPortrait: {
    name: "Instagram Feed",
    icon: "Instagram",
    ratio: "4:5",
    width: 1080,
    height: 1350,
  },
  facebookFeed: {
    name: "Facebook Feed",
    icon: "Facebook",
    ratio: "4:5",
    width: 1080,
    height: 1350,
  },
  linkedin: {
    name: "LinkedIn",
    icon: "Linkedin",
    ratio: "1:1",
    width: 1080,
    height: 1080,
  },
  linkedinWide: {
    name: "LinkedIn",
    icon: "Linkedin",
    ratio: "16:9",
    width: 1920,
    height: 1080,
  },
} as const;

// Enhanced aspect ratio interface
export interface AspectRatioConfig {
  id: string;
  name: string;
  description: string;
  width: number; // ratio width
  height: number; // ratio height
  pixelWidth: number; // actual pixel width
  pixelHeight: number; // actual pixel height
  platforms: PlatformSpec[];
  recommendation: string;
}

export const ASPECT_RATIOS: AspectRatioConfig[] = [
  {
    id: "9:16",
    name: "Vertical",
    description: "TikTok, Reels, Shorts",
    width: 9,
    height: 16,
    pixelWidth: 1080,
    pixelHeight: 1920,
    platforms: [
      PLATFORM_SPECS.tiktok,
      PLATFORM_SPECS.instagramReels,
      PLATFORM_SPECS.youtubeShorts,
    ],
    recommendation: "Best for mobile-first short-form content. Maximum engagement on TikTok and Instagram Reels.",
  },
  {
    id: "16:9",
    name: "Horizontal",
    description: "YouTube, Website",
    width: 16,
    height: 9,
    pixelWidth: 1920,
    pixelHeight: 1080,
    platforms: [
      PLATFORM_SPECS.youtube,
      PLATFORM_SPECS.linkedinWide,
    ],
    recommendation: "Standard widescreen format. Ideal for YouTube videos and website embeds.",
  },
  {
    id: "1:1",
    name: "Square",
    description: "Instagram, LinkedIn",
    width: 1,
    height: 1,
    pixelWidth: 1080,
    pixelHeight: 1080,
    platforms: [
      PLATFORM_SPECS.instagramFeedSquare,
      PLATFORM_SPECS.linkedin,
    ],
    recommendation: "Versatile format that works well on most social feeds. Great for Instagram and LinkedIn.",
  },
  {
    id: "4:5",
    name: "Portrait",
    description: "Instagram Feed, Facebook",
    width: 4,
    height: 5,
    pixelWidth: 1080,
    pixelHeight: 1350,
    platforms: [
      PLATFORM_SPECS.instagramFeedPortrait,
      PLATFORM_SPECS.facebookFeed,
    ],
    recommendation: "Optimal for Instagram feed posts. Takes up more screen space than square.",
  },
];

export const DURATIONS = [
  { id: "15", name: "15 seconds", description: "Quick hook + core message" },
  { id: "30", name: "30 seconds", description: "Full testimonial with CTA" },
  { id: "45", name: "45 seconds", description: "Extended with context" },
  { id: "60", name: "60 seconds", description: "Detailed testimonial" },
] as const;

export type AvatarStyleId = (typeof AVATAR_STYLES)[number]["id"];
export type AspectRatioId = "9:16" | "16:9" | "1:1" | "4:5";
export type DurationId = (typeof DURATIONS)[number]["id"];

// Mirage-specific constants
export const MIRAGE_RESOLUTIONS = [
  { id: "fhd", name: "Full HD", description: "1080p - Good for most uses" },
  { id: "4k", name: "4K", description: "Ultra HD - Best quality" },
] as const;

export type MirageResolutionId = (typeof MIRAGE_RESOLUTIONS)[number]["id"];
