/**
 * Actor Presets System for AI Video Generation
 *
 * This module provides predefined actor presets with consistent visual and voice settings
 * for maintaining actor continuity across video testimonials.
 */

import { prisma } from "@/lib/prisma";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface VoiceSettings {
  voiceId?: string;
  speed?: number; // 0.5 - 2.0, default 1.0
  pitch?: number; // -20 to 20, default 0
  stability?: number; // 0 - 1, default 0.5
  similarityBoost?: number; // 0 - 1, default 0.75
}

export interface VisualSettings {
  background?: string;
  lighting?: "natural" | "studio" | "warm" | "cool" | "dramatic";
  cameraAngle?: "front" | "slight-left" | "slight-right" | "low" | "high";
  framing?: "close-up" | "medium" | "wide";
  colorGrading?: string;
}

export interface ActorPreset {
  id: string;
  name: string;
  description: string;
  avatarStyle: string;
  category: "male" | "female" | "neutral";
  ethnicity?: string;
  ageGroup?: "young-adult" | "adult" | "middle-aged" | "senior";
  voiceSettings: VoiceSettings;
  visualSettings: VisualSettings;
  thumbnailUrl?: string;
  isDefault?: boolean;
}

export interface SavedActorPreset extends ActorPreset {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Predefined Actor Presets
// ============================================================================

export const DEFAULT_ACTOR_PRESETS: ActorPreset[] = [
  // Male Presets
  {
    id: "preset-male-professional-1",
    name: "Marcus Professional",
    description: "Professional young adult male with confident demeanor, suitable for corporate testimonials",
    avatarStyle: "marcus_professional",
    category: "male",
    ethnicity: "african-american",
    ageGroup: "young-adult",
    voiceSettings: {
      voiceId: "marcus-deep",
      speed: 1.0,
      pitch: -2,
      stability: 0.7,
      similarityBoost: 0.8,
    },
    visualSettings: {
      background: "modern-office",
      lighting: "studio",
      cameraAngle: "front",
      framing: "medium",
    },
    thumbnailUrl: "/presets/marcus-professional.jpg",
  },
  {
    id: "preset-male-casual-1",
    name: "James Casual",
    description: "Friendly casual male ideal for lifestyle and consumer product testimonials",
    avatarStyle: "james_casual",
    category: "male",
    ethnicity: "caucasian",
    ageGroup: "adult",
    voiceSettings: {
      voiceId: "james-friendly",
      speed: 1.05,
      pitch: 0,
      stability: 0.6,
      similarityBoost: 0.75,
    },
    visualSettings: {
      background: "home-interior",
      lighting: "natural",
      cameraAngle: "slight-left",
      framing: "close-up",
    },
    thumbnailUrl: "/presets/james-casual.jpg",
  },
  {
    id: "preset-male-tech-1",
    name: "Kevin Tech",
    description: "Tech-savvy young male perfect for software and gadget reviews",
    avatarStyle: "kevin_tech",
    category: "male",
    ethnicity: "asian",
    ageGroup: "young-adult",
    voiceSettings: {
      voiceId: "kevin-enthusiastic",
      speed: 1.1,
      pitch: 1,
      stability: 0.55,
      similarityBoost: 0.7,
    },
    visualSettings: {
      background: "tech-setup",
      lighting: "cool",
      cameraAngle: "front",
      framing: "medium",
    },
    thumbnailUrl: "/presets/kevin-tech.jpg",
  },
  {
    id: "preset-male-executive-1",
    name: "Richard Executive",
    description: "Mature executive male for high-end B2B and enterprise testimonials",
    avatarStyle: "richard_executive",
    category: "male",
    ethnicity: "caucasian",
    ageGroup: "middle-aged",
    voiceSettings: {
      voiceId: "richard-authoritative",
      speed: 0.95,
      pitch: -3,
      stability: 0.8,
      similarityBoost: 0.85,
    },
    visualSettings: {
      background: "executive-office",
      lighting: "warm",
      cameraAngle: "slight-right",
      framing: "medium",
    },
    thumbnailUrl: "/presets/richard-executive.jpg",
  },
  {
    id: "preset-male-latino-1",
    name: "Carlos Energetic",
    description: "Energetic Latino male suitable for hospitality and entertainment testimonials",
    avatarStyle: "carlos_energetic",
    category: "male",
    ethnicity: "latino",
    ageGroup: "adult",
    voiceSettings: {
      voiceId: "carlos-warm",
      speed: 1.05,
      pitch: 0,
      stability: 0.6,
      similarityBoost: 0.75,
    },
    visualSettings: {
      background: "vibrant-cafe",
      lighting: "warm",
      cameraAngle: "front",
      framing: "close-up",
    },
    thumbnailUrl: "/presets/carlos-energetic.jpg",
  },

  // Female Presets
  {
    id: "preset-female-professional-1",
    name: "Sarah Professional",
    description: "Professional female with polished appearance for corporate and business testimonials",
    avatarStyle: "sarah_professional",
    category: "female",
    ethnicity: "caucasian",
    ageGroup: "adult",
    voiceSettings: {
      voiceId: "sarah-confident",
      speed: 1.0,
      pitch: 2,
      stability: 0.7,
      similarityBoost: 0.8,
    },
    visualSettings: {
      background: "modern-office",
      lighting: "studio",
      cameraAngle: "front",
      framing: "medium",
    },
    thumbnailUrl: "/presets/sarah-professional.jpg",
  },
  {
    id: "preset-female-casual-1",
    name: "Emily Casual",
    description: "Warm and approachable female for lifestyle, health, and wellness testimonials",
    avatarStyle: "emily_casual",
    category: "female",
    ethnicity: "caucasian",
    ageGroup: "young-adult",
    voiceSettings: {
      voiceId: "emily-friendly",
      speed: 1.05,
      pitch: 3,
      stability: 0.6,
      similarityBoost: 0.75,
    },
    visualSettings: {
      background: "bright-home",
      lighting: "natural",
      cameraAngle: "slight-right",
      framing: "close-up",
    },
    thumbnailUrl: "/presets/emily-casual.jpg",
  },
  {
    id: "preset-female-creative-1",
    name: "Aaliyah Creative",
    description: "Creative and expressive female ideal for arts, fashion, and creative industry testimonials",
    avatarStyle: "aaliyah_creative",
    category: "female",
    ethnicity: "african-american",
    ageGroup: "young-adult",
    voiceSettings: {
      voiceId: "aaliyah-expressive",
      speed: 1.0,
      pitch: 1,
      stability: 0.55,
      similarityBoost: 0.7,
    },
    visualSettings: {
      background: "creative-studio",
      lighting: "dramatic",
      cameraAngle: "slight-left",
      framing: "medium",
    },
    thumbnailUrl: "/presets/aaliyah-creative.jpg",
  },
  {
    id: "preset-female-executive-1",
    name: "Michelle Executive",
    description: "Senior executive female for enterprise and leadership testimonials",
    avatarStyle: "michelle_executive",
    category: "female",
    ethnicity: "asian",
    ageGroup: "middle-aged",
    voiceSettings: {
      voiceId: "michelle-authoritative",
      speed: 0.95,
      pitch: 0,
      stability: 0.8,
      similarityBoost: 0.85,
    },
    visualSettings: {
      background: "executive-boardroom",
      lighting: "studio",
      cameraAngle: "front",
      framing: "medium",
    },
    thumbnailUrl: "/presets/michelle-executive.jpg",
  },
  {
    id: "preset-female-latina-1",
    name: "Isabella Warm",
    description: "Warm and personable Latina female for hospitality, food, and family-oriented testimonials",
    avatarStyle: "isabella_warm",
    category: "female",
    ethnicity: "latina",
    ageGroup: "adult",
    voiceSettings: {
      voiceId: "isabella-warm",
      speed: 1.0,
      pitch: 2,
      stability: 0.65,
      similarityBoost: 0.75,
    },
    visualSettings: {
      background: "cozy-kitchen",
      lighting: "warm",
      cameraAngle: "front",
      framing: "close-up",
    },
    thumbnailUrl: "/presets/isabella-warm.jpg",
  },
  {
    id: "preset-female-senior-1",
    name: "Margaret Trustworthy",
    description: "Mature and trustworthy senior female for healthcare, finance, and trust-building testimonials",
    avatarStyle: "margaret_trustworthy",
    category: "female",
    ethnicity: "caucasian",
    ageGroup: "senior",
    voiceSettings: {
      voiceId: "margaret-wise",
      speed: 0.9,
      pitch: -1,
      stability: 0.85,
      similarityBoost: 0.9,
    },
    visualSettings: {
      background: "elegant-living-room",
      lighting: "warm",
      cameraAngle: "front",
      framing: "medium",
    },
    thumbnailUrl: "/presets/margaret-trustworthy.jpg",
  },

  // Neutral/Diverse Presets
  {
    id: "preset-neutral-versatile-1",
    name: "Alex Versatile",
    description: "Gender-neutral versatile presenter suitable for tech and modern brand testimonials",
    avatarStyle: "alex_versatile",
    category: "neutral",
    ageGroup: "young-adult",
    voiceSettings: {
      voiceId: "alex-neutral",
      speed: 1.0,
      pitch: 0,
      stability: 0.65,
      similarityBoost: 0.75,
    },
    visualSettings: {
      background: "minimal-modern",
      lighting: "studio",
      cameraAngle: "front",
      framing: "medium",
    },
    thumbnailUrl: "/presets/alex-versatile.jpg",
  },
];

// ============================================================================
// Preset Management Functions
// ============================================================================

/**
 * Get all default presets available in the system
 */
export function getDefaultPresets(): ActorPreset[] {
  return DEFAULT_ACTOR_PRESETS;
}

/**
 * Get a specific default preset by ID
 */
export function getDefaultPresetById(presetId: string): ActorPreset | undefined {
  return DEFAULT_ACTOR_PRESETS.find((preset) => preset.id === presetId);
}

/**
 * Filter default presets by category
 */
export function getPresetsByCategory(category: "male" | "female" | "neutral"): ActorPreset[] {
  return DEFAULT_ACTOR_PRESETS.filter((preset) => preset.category === category);
}

/**
 * Filter default presets by age group
 */
export function getPresetsByAgeGroup(
  ageGroup: "young-adult" | "adult" | "middle-aged" | "senior"
): ActorPreset[] {
  return DEFAULT_ACTOR_PRESETS.filter((preset) => preset.ageGroup === ageGroup);
}

/**
 * Filter default presets by ethnicity
 */
export function getPresetsByEthnicity(ethnicity: string): ActorPreset[] {
  return DEFAULT_ACTOR_PRESETS.filter(
    (preset) => preset.ethnicity?.toLowerCase() === ethnicity.toLowerCase()
  );
}

// ============================================================================
// Database Persistence Functions
// ============================================================================

/**
 * Save a user's custom actor preset to the database
 */
export async function saveUserPreset(
  userId: string,
  preset: Omit<ActorPreset, "id">
): Promise<SavedActorPreset> {
  const savedPreset = await prisma.actorPreset.create({
    data: {
      userId,
      name: preset.name,
      description: preset.description,
      avatarStyle: preset.avatarStyle,
      category: preset.category,
      ethnicity: preset.ethnicity,
      ageGroup: preset.ageGroup,
      voiceSettings: preset.voiceSettings as object,
      visualSettings: preset.visualSettings as object,
      thumbnailUrl: preset.thumbnailUrl,
      isDefault: preset.isDefault ?? false,
    },
  });

  return {
    id: savedPreset.id,
    userId: savedPreset.userId,
    name: savedPreset.name,
    description: savedPreset.description ?? "",
    avatarStyle: savedPreset.avatarStyle,
    category: savedPreset.category as "male" | "female" | "neutral",
    ethnicity: savedPreset.ethnicity ?? undefined,
    ageGroup: savedPreset.ageGroup as "young-adult" | "adult" | "middle-aged" | "senior" | undefined,
    voiceSettings: savedPreset.voiceSettings as VoiceSettings,
    visualSettings: savedPreset.visualSettings as VisualSettings,
    thumbnailUrl: savedPreset.thumbnailUrl ?? undefined,
    isDefault: savedPreset.isDefault,
    createdAt: savedPreset.createdAt,
    updatedAt: savedPreset.updatedAt,
  };
}

/**
 * Get all presets saved by a user
 */
export async function getUserPresets(userId: string): Promise<SavedActorPreset[]> {
  const presets = await prisma.actorPreset.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return presets.map((preset) => ({
    id: preset.id,
    userId: preset.userId,
    name: preset.name,
    description: preset.description ?? "",
    avatarStyle: preset.avatarStyle,
    category: preset.category as "male" | "female" | "neutral",
    ethnicity: preset.ethnicity ?? undefined,
    ageGroup: preset.ageGroup as "young-adult" | "adult" | "middle-aged" | "senior" | undefined,
    voiceSettings: preset.voiceSettings as VoiceSettings,
    visualSettings: preset.visualSettings as VisualSettings,
    thumbnailUrl: preset.thumbnailUrl ?? undefined,
    isDefault: preset.isDefault,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  }));
}

/**
 * Get a specific user preset by ID
 */
export async function getUserPresetById(
  userId: string,
  presetId: string
): Promise<SavedActorPreset | null> {
  const preset = await prisma.actorPreset.findFirst({
    where: { id: presetId, userId },
  });

  if (!preset) return null;

  return {
    id: preset.id,
    userId: preset.userId,
    name: preset.name,
    description: preset.description ?? "",
    avatarStyle: preset.avatarStyle,
    category: preset.category as "male" | "female" | "neutral",
    ethnicity: preset.ethnicity ?? undefined,
    ageGroup: preset.ageGroup as "young-adult" | "adult" | "middle-aged" | "senior" | undefined,
    voiceSettings: preset.voiceSettings as VoiceSettings,
    visualSettings: preset.visualSettings as VisualSettings,
    thumbnailUrl: preset.thumbnailUrl ?? undefined,
    isDefault: preset.isDefault,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  };
}

/**
 * Update a user's preset
 */
export async function updateUserPreset(
  userId: string,
  presetId: string,
  updates: Partial<Omit<ActorPreset, "id">>
): Promise<SavedActorPreset | null> {
  // Check if preset exists and belongs to user
  const existing = await prisma.actorPreset.findFirst({
    where: { id: presetId, userId },
  });

  if (!existing) return null;

  const updatedPreset = await prisma.actorPreset.update({
    where: { id: presetId },
    data: {
      name: updates.name,
      description: updates.description,
      avatarStyle: updates.avatarStyle,
      category: updates.category,
      ethnicity: updates.ethnicity,
      ageGroup: updates.ageGroup,
      voiceSettings: updates.voiceSettings as object | undefined,
      visualSettings: updates.visualSettings as object | undefined,
      thumbnailUrl: updates.thumbnailUrl,
      isDefault: updates.isDefault,
    },
  });

  return {
    id: updatedPreset.id,
    userId: updatedPreset.userId,
    name: updatedPreset.name,
    description: updatedPreset.description ?? "",
    avatarStyle: updatedPreset.avatarStyle,
    category: updatedPreset.category as "male" | "female" | "neutral",
    ethnicity: updatedPreset.ethnicity ?? undefined,
    ageGroup: updatedPreset.ageGroup as "young-adult" | "adult" | "middle-aged" | "senior" | undefined,
    voiceSettings: updatedPreset.voiceSettings as VoiceSettings,
    visualSettings: updatedPreset.visualSettings as VisualSettings,
    thumbnailUrl: updatedPreset.thumbnailUrl ?? undefined,
    isDefault: updatedPreset.isDefault,
    createdAt: updatedPreset.createdAt,
    updatedAt: updatedPreset.updatedAt,
  };
}

/**
 * Delete a user's preset
 */
export async function deleteUserPreset(userId: string, presetId: string): Promise<boolean> {
  const existing = await prisma.actorPreset.findFirst({
    where: { id: presetId, userId },
  });

  if (!existing) return false;

  await prisma.actorPreset.delete({
    where: { id: presetId },
  });

  return true;
}

/**
 * Set a preset as the user's default
 */
export async function setDefaultPreset(userId: string, presetId: string): Promise<boolean> {
  // First, unset any existing default
  await prisma.actorPreset.updateMany({
    where: { userId, isDefault: true },
    data: { isDefault: false },
  });

  // Set the new default
  const result = await prisma.actorPreset.updateMany({
    where: { id: presetId, userId },
    data: { isDefault: true },
  });

  return result.count > 0;
}

/**
 * Get the user's default preset
 */
export async function getDefaultUserPreset(userId: string): Promise<SavedActorPreset | null> {
  const preset = await prisma.actorPreset.findFirst({
    where: { userId, isDefault: true },
  });

  if (!preset) return null;

  return {
    id: preset.id,
    userId: preset.userId,
    name: preset.name,
    description: preset.description ?? "",
    avatarStyle: preset.avatarStyle,
    category: preset.category as "male" | "female" | "neutral",
    ethnicity: preset.ethnicity ?? undefined,
    ageGroup: preset.ageGroup as "young-adult" | "adult" | "middle-aged" | "senior" | undefined,
    voiceSettings: preset.voiceSettings as VoiceSettings,
    visualSettings: preset.visualSettings as VisualSettings,
    thumbnailUrl: preset.thumbnailUrl ?? undefined,
    isDefault: preset.isDefault,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  };
}

// ============================================================================
// Video Generation Integration
// ============================================================================

export interface VideoGenerationConfig {
  prompt: string;
  duration?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

/**
 * Apply an actor preset to video generation configuration
 * This merges the preset settings with the base video config
 */
export function applyPresetToVideoConfig(
  preset: ActorPreset,
  baseConfig: VideoGenerationConfig
): VideoGenerationConfig & { actorSettings: ActorPreset } {
  // Build enhanced prompt with actor details
  const actorDescription = buildActorDescription(preset);
  const enhancedPrompt = `${actorDescription}\n\n${baseConfig.prompt}`;

  return {
    ...baseConfig,
    prompt: enhancedPrompt,
    actorSettings: preset,
  };
}

/**
 * Build a descriptive prompt segment for the actor
 */
function buildActorDescription(preset: ActorPreset): string {
  const parts: string[] = [];

  // Actor identity
  parts.push(`Actor: ${preset.name}`);
  parts.push(`Style: ${preset.avatarStyle}`);

  // Visual settings
  if (preset.visualSettings.background) {
    parts.push(`Background: ${preset.visualSettings.background}`);
  }
  if (preset.visualSettings.lighting) {
    parts.push(`Lighting: ${preset.visualSettings.lighting}`);
  }
  if (preset.visualSettings.cameraAngle) {
    parts.push(`Camera Angle: ${preset.visualSettings.cameraAngle}`);
  }
  if (preset.visualSettings.framing) {
    parts.push(`Framing: ${preset.visualSettings.framing}`);
  }

  return parts.join(", ");
}

/**
 * Get preset configuration for API response
 */
export function serializePreset(preset: ActorPreset | SavedActorPreset): object {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    avatarStyle: preset.avatarStyle,
    category: preset.category,
    ethnicity: preset.ethnicity,
    ageGroup: preset.ageGroup,
    voiceSettings: preset.voiceSettings,
    visualSettings: preset.visualSettings,
    thumbnailUrl: preset.thumbnailUrl,
    isDefault: preset.isDefault ?? false,
    ...("userId" in preset && {
      userId: preset.userId,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
    }),
  };
}
