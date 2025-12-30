/**
 * Seed script for Generated Avatars
 * Seeds the database with pre-generated avatar images from the generated-avatars/ folder
 *
 * These avatars have consistent looks and are optimized for VEO 3.1 video generation.
 * Each avatar has multiple "looks" (poses/outfits) that users can choose from.
 *
 * Run with: npx tsx prisma/seed-generated-avatars.ts
 */

import { PrismaClient } from "@prisma/client";
import { fal } from "@fal-ai/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// Configure FAL client for image upload
fal.config({
  credentials: process.env.FAL_API_KEY || "",
});

interface AvatarLook {
  index: number;
  path: string;
  description: string;
}

interface AvatarManifest {
  name: string;
  slug: string;
  description: string;
  age: string;
  ethnicity: string;
  gender: "male" | "female";
  style: string;
  voiceId: string;
  voicePrompt?: string;
  looks: AvatarLook[];
}

interface Manifest {
  generatedAt: string;
  version: string;
  actors: AvatarManifest[];
}

/**
 * Upload a local image file to FAL storage
 */
async function uploadImageToFal(imagePath: string): Promise<string> {
  const absolutePath = path.resolve(imagePath);
  const imageBuffer = fs.readFileSync(absolutePath);
  const uint8Array = new Uint8Array(imageBuffer);
  const blob = new Blob([uint8Array], { type: "image/png" });
  const url = await fal.storage.upload(blob);
  return url;
}

async function main() {
  console.log("🎭 Seeding Generated Avatars...\n");

  if (!process.env.FAL_API_KEY) {
    console.error("❌ FAL_API_KEY environment variable is required");
    process.exit(1);
  }

  // Read manifest
  const manifestPath = path.join(process.cwd(), "generated-avatars", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("❌ Manifest file not found:", manifestPath);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`📋 Found ${manifest.actors.length} actors in manifest\n`);

  // First, deactivate all existing FAL actors
  console.log("🔄 Deactivating existing actors...");
  await prisma.falActor.updateMany({
    data: { isActive: false },
  });

  let created = 0;
  let updated = 0;

  for (const actor of manifest.actors) {
    console.log(`\n👤 Processing "${actor.name}" (${actor.gender}, ${actor.style})`);

    // We'll create one actor entry per look for better user selection
    for (const look of actor.looks) {
      const lookSlug = `${actor.slug}-look-${look.index}`;
      const lookName = `${actor.name} - Look ${look.index}`;
      const imagePath = path.join(process.cwd(), "generated-avatars", look.path);

      if (!fs.existsSync(imagePath)) {
        console.log(`   ⚠️  Image not found: ${imagePath}, skipping`);
        continue;
      }

      console.log(`   📸 Uploading look ${look.index}...`);

      try {
        // Upload image to FAL storage
        const imageUrl = await uploadImageToFal(imagePath);
        console.log(`   ✅ Uploaded: ${imageUrl.substring(0, 50)}...`);

        // Check if actor already exists
        const existing = await prisma.falActor.findUnique({
          where: { slug: lookSlug },
        });

        if (existing) {
          // Update existing actor
          await prisma.falActor.update({
            where: { slug: lookSlug },
            data: {
              name: lookName,
              gender: actor.gender,
              style: actor.style,
              description: `${actor.description}. ${look.description}`,
              voiceId: actor.voiceId,
              voicePrompt: actor.voicePrompt,
              referenceImageUrl: imageUrl,
              thumbnailUrl: imageUrl,
              isActive: true,
              sortOrder: created,
            },
          });
          console.log(`   🔄 Updated actor: ${lookName}`);
          updated++;
        } else {
          // Create new actor
          await prisma.falActor.create({
            data: {
              name: lookName,
              slug: lookSlug,
              gender: actor.gender,
              style: actor.style,
              description: `${actor.description}. ${look.description}`,
              voiceId: actor.voiceId,
              voicePrompt: actor.voicePrompt,
              referenceImageUrl: imageUrl,
              thumbnailUrl: imageUrl,
              isActive: true,
              sortOrder: created,
            },
          });
          console.log(`   ✅ Created actor: ${lookName}`);
          created++;
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`   ❌ Failed to process look ${look.index}:`, error);
      }
    }
  }

  console.log(`\n🎉 Done! Created ${created} actors, updated ${updated} existing.\n`);

  // Summary
  const total = await prisma.falActor.count({ where: { isActive: true } });
  const byGender = await prisma.falActor.groupBy({
    by: ["gender"],
    where: { isActive: true },
    _count: true,
  });
  const byStyle = await prisma.falActor.groupBy({
    by: ["style"],
    where: { isActive: true },
    _count: true,
  });

  console.log("📊 Summary:");
  console.log(`   Active actors: ${total}`);
  console.log(`   By gender: ${byGender.map((g) => `${g.gender}=${g._count}`).join(", ")}`);
  console.log(`   By style: ${byStyle.map((s) => `${s.style}=${s._count}`).join(", ")}`);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding actors:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
