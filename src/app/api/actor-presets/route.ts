import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDefaultPresets,
  getUserPresets,
  saveUserPreset,
  updateUserPreset,
  deleteUserPreset,
  setDefaultPreset,
  serializePreset,
  type ActorPreset,
  type VoiceSettings,
  type VisualSettings,
} from "@/lib/actor-presets";

// ============================================================================
// Request/Response Types
// ============================================================================

interface CreatePresetRequest {
  name: string;
  description?: string;
  avatarStyle: string;
  category: "male" | "female" | "neutral";
  ethnicity?: string;
  ageGroup?: "young-adult" | "adult" | "middle-aged" | "senior";
  voiceSettings?: VoiceSettings;
  visualSettings?: VisualSettings;
  thumbnailUrl?: string;
  isDefault?: boolean;
}

interface UpdatePresetRequest extends Partial<CreatePresetRequest> {
  id: string;
}

// ============================================================================
// GET: List user's saved presets (and optionally include defaults)
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const includeDefaults = searchParams.get("includeDefaults") === "true";
    const category = searchParams.get("category") as "male" | "female" | "neutral" | null;
    const ageGroup = searchParams.get("ageGroup") as
      | "young-adult"
      | "adult"
      | "middle-aged"
      | "senior"
      | null;

    // Get user's saved presets
    const userPresets = await getUserPresets(user.id);

    // Optionally include default presets
    let allPresets: ActorPreset[] = userPresets;

    if (includeDefaults) {
      const defaultPresets = getDefaultPresets();
      allPresets = [
        ...userPresets,
        ...defaultPresets.map((p) => ({ ...p, isSystemPreset: true })),
      ] as ActorPreset[];
    }

    // Apply filters if provided
    let filteredPresets = allPresets;

    if (category) {
      filteredPresets = filteredPresets.filter((p) => p.category === category);
    }

    if (ageGroup) {
      filteredPresets = filteredPresets.filter((p) => p.ageGroup === ageGroup);
    }

    return NextResponse.json({
      success: true,
      presets: filteredPresets.map(serializePreset),
      total: filteredPresets.length,
      userPresetsCount: userPresets.length,
    });
  } catch (error) {
    console.error("Error fetching actor presets:", error);
    return NextResponse.json(
      { error: "Failed to fetch actor presets" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST: Save a new preset
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const body: CreatePresetRequest = await request.json();

    // Validate required fields
    if (!body.name || !body.avatarStyle || !body.category) {
      return NextResponse.json(
        { error: "Missing required fields: name, avatarStyle, and category are required" },
        { status: 400 }
      );
    }

    // Validate category
    if (!["male", "female", "neutral"].includes(body.category)) {
      return NextResponse.json(
        { error: "Invalid category. Must be 'male', 'female', or 'neutral'" },
        { status: 400 }
      );
    }

    // Validate ageGroup if provided
    if (
      body.ageGroup &&
      !["young-adult", "adult", "middle-aged", "senior"].includes(body.ageGroup)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid ageGroup. Must be 'young-adult', 'adult', 'middle-aged', or 'senior'",
        },
        { status: 400 }
      );
    }

    // Validate voice settings if provided
    if (body.voiceSettings) {
      const { speed, pitch, stability, similarityBoost } = body.voiceSettings;
      if (speed !== undefined && (speed < 0.5 || speed > 2.0)) {
        return NextResponse.json(
          { error: "Voice speed must be between 0.5 and 2.0" },
          { status: 400 }
        );
      }
      if (pitch !== undefined && (pitch < -20 || pitch > 20)) {
        return NextResponse.json(
          { error: "Voice pitch must be between -20 and 20" },
          { status: 400 }
        );
      }
      if (stability !== undefined && (stability < 0 || stability > 1)) {
        return NextResponse.json(
          { error: "Voice stability must be between 0 and 1" },
          { status: 400 }
        );
      }
      if (similarityBoost !== undefined && (similarityBoost < 0 || similarityBoost > 1)) {
        return NextResponse.json(
          { error: "Voice similarityBoost must be between 0 and 1" },
          { status: 400 }
        );
      }
    }

    // Validate visual settings if provided
    if (body.visualSettings?.lighting) {
      const validLighting = ["natural", "studio", "warm", "cool", "dramatic"];
      if (!validLighting.includes(body.visualSettings.lighting)) {
        return NextResponse.json(
          { error: `Invalid lighting. Must be one of: ${validLighting.join(", ")}` },
          { status: 400 }
        );
      }
    }

    if (body.visualSettings?.cameraAngle) {
      const validAngles = ["front", "slight-left", "slight-right", "low", "high"];
      if (!validAngles.includes(body.visualSettings.cameraAngle)) {
        return NextResponse.json(
          { error: `Invalid cameraAngle. Must be one of: ${validAngles.join(", ")}` },
          { status: 400 }
        );
      }
    }

    if (body.visualSettings?.framing) {
      const validFraming = ["close-up", "medium", "wide"];
      if (!validFraming.includes(body.visualSettings.framing)) {
        return NextResponse.json(
          { error: `Invalid framing. Must be one of: ${validFraming.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // Create the preset
    const newPreset = await saveUserPreset(user.id, {
      name: body.name,
      description: body.description ?? "",
      avatarStyle: body.avatarStyle,
      category: body.category,
      ethnicity: body.ethnicity,
      ageGroup: body.ageGroup,
      voiceSettings: body.voiceSettings ?? {},
      visualSettings: body.visualSettings ?? {},
      thumbnailUrl: body.thumbnailUrl,
      isDefault: body.isDefault,
    });

    // If this should be the default, set it
    if (body.isDefault) {
      await setDefaultPreset(user.id, newPreset.id);
    }

    return NextResponse.json(
      {
        success: true,
        preset: serializePreset(newPreset),
        message: "Actor preset created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating actor preset:", error);
    return NextResponse.json(
      { error: "Failed to create actor preset" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT: Update an existing preset
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const body: UpdatePresetRequest = await request.json();

    // Validate required ID
    if (!body.id) {
      return NextResponse.json(
        { error: "Preset ID is required for updates" },
        { status: 400 }
      );
    }

    // Validate category if provided
    if (body.category && !["male", "female", "neutral"].includes(body.category)) {
      return NextResponse.json(
        { error: "Invalid category. Must be 'male', 'female', or 'neutral'" },
        { status: 400 }
      );
    }

    // Validate ageGroup if provided
    if (
      body.ageGroup &&
      !["young-adult", "adult", "middle-aged", "senior"].includes(body.ageGroup)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid ageGroup. Must be 'young-adult', 'adult', 'middle-aged', or 'senior'",
        },
        { status: 400 }
      );
    }

    // Build updates object (excluding id)
    const { id, ...updates } = body;

    // Update the preset
    const updatedPreset = await updateUserPreset(user.id, id, updates);

    if (!updatedPreset) {
      return NextResponse.json(
        { error: "Preset not found or you do not have permission to update it" },
        { status: 404 }
      );
    }

    // Handle default flag change
    if (body.isDefault === true) {
      await setDefaultPreset(user.id, id);
    }

    return NextResponse.json({
      success: true,
      preset: serializePreset(updatedPreset),
      message: "Actor preset updated successfully",
    });
  } catch (error) {
    console.error("Error updating actor preset:", error);
    return NextResponse.json(
      { error: "Failed to update actor preset" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE: Remove a preset
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const presetId = searchParams.get("id");

    if (!presetId) {
      return NextResponse.json(
        { error: "Preset ID is required" },
        { status: 400 }
      );
    }

    // Attempt to delete the preset
    const deleted = await deleteUserPreset(user.id, presetId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Preset not found or you do not have permission to delete it" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Actor preset deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting actor preset:", error);
    return NextResponse.json(
      { error: "Failed to delete actor preset" },
      { status: 500 }
    );
  }
}
