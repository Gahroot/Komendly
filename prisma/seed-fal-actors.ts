/**
 * Seed script for FAL Actors with AI-generated portraits
 * Uses FAL Flux to generate realistic headshots for each actor
 *
 * Run with: npx tsx prisma/seed-fal-actors.ts
 */

import { PrismaClient } from "@prisma/client";
import { fal } from "@fal-ai/client";

const prisma = new PrismaClient();

// Configure FAL client
fal.config({
  credentials: process.env.FAL_API_KEY || "",
});

const FLUX_MODEL = "fal-ai/flux/dev";

interface ActorSeed {
  name: string;
  slug: string;
  gender: "male" | "female";
  style: string;
  description: string;
  voiceId: string;
  imagePrompt: string;
}

// Actor seed data with prompts for image generation
const actors: ActorSeed[] = [
  // Professional Male Actors
  {
    name: "Marcus Chen",
    slug: "marcus-chen",
    gender: "male",
    style: "professional",
    description: "Confident business professional with a warm, trustworthy presence",
    voiceId: "onyx",
    imagePrompt: "Professional headshot of a 35 year old Asian American man, confident smile, wearing navy blue business suit, clean shaven, short black hair, studio lighting, neutral gray background, high quality portrait photography, sharp focus on face, 4k",
  },
  {
    name: "David Williams",
    slug: "david-williams",
    gender: "male",
    style: "professional",
    description: "Polished executive with authoritative yet approachable demeanor",
    voiceId: "echo",
    imagePrompt: "Professional headshot of a 45 year old Caucasian man, friendly executive appearance, wearing charcoal gray suit with tie, light stubble, brown hair with slight gray, studio lighting, neutral background, corporate portrait photography, sharp focus, 4k",
  },

  // Casual Male Actors
  {
    name: "Jake Thompson",
    slug: "jake-thompson",
    gender: "male",
    style: "casual",
    description: "Relaxed and relatable everyday guy next door",
    voiceId: "alloy",
    imagePrompt: "Casual headshot of a 28 year old Caucasian man, genuine friendly smile, wearing simple blue t-shirt, short blonde hair, natural daylight, soft neutral background, authentic lifestyle portrait, relaxed expression, 4k",
  },
  {
    name: "Carlos Rivera",
    slug: "carlos-rivera",
    gender: "male",
    style: "casual",
    description: "Friendly and energetic with natural charisma",
    voiceId: "fable",
    imagePrompt: "Casual headshot of a 32 year old Latino man, warm engaging smile, wearing casual button-up shirt, dark wavy hair, natural lighting, soft background, authentic portrait photography, approachable expression, 4k",
  },

  // Friendly Male Actor
  {
    name: "Michael Johnson",
    slug: "michael-johnson",
    gender: "male",
    style: "friendly",
    description: "Warm and genuine with an inviting smile",
    voiceId: "echo",
    imagePrompt: "Friendly headshot of a 38 year old African American man, warm genuine smile, wearing casual polo shirt, short hair, soft studio lighting, neutral background, welcoming expression, portrait photography, 4k",
  },

  // Professional Female Actors
  {
    name: "Sarah Mitchell",
    slug: "sarah-mitchell",
    gender: "female",
    style: "professional",
    description: "Confident business leader with polished presentation",
    voiceId: "nova",
    imagePrompt: "Professional headshot of a 36 year old Caucasian woman, confident smile, wearing elegant navy blazer, shoulder length brown hair, studio lighting, neutral gray background, corporate portrait photography, sharp focus, 4k",
  },
  {
    name: "Jennifer Park",
    slug: "jennifer-park",
    gender: "female",
    style: "professional",
    description: "Sophisticated professional with commanding presence",
    voiceId: "shimmer",
    imagePrompt: "Professional headshot of a 40 year old Korean American woman, poised confident expression, wearing black business attire, sleek dark hair, studio lighting, neutral background, executive portrait photography, 4k",
  },

  // Casual Female Actors
  {
    name: "Emma Davis",
    slug: "emma-davis",
    gender: "female",
    style: "casual",
    description: "Relaxed and authentic everyday person",
    voiceId: "nova",
    imagePrompt: "Casual headshot of a 26 year old Caucasian woman, natural genuine smile, wearing simple white blouse, long wavy blonde hair, soft natural lighting, neutral background, authentic lifestyle portrait, 4k",
  },
  {
    name: "Maria Santos",
    slug: "maria-santos",
    gender: "female",
    style: "casual",
    description: "Approachable and down-to-earth personality",
    voiceId: "shimmer",
    imagePrompt: "Casual headshot of a 30 year old Latina woman, warm friendly smile, wearing casual earth-tone top, dark curly hair, natural daylight, soft background, authentic portrait photography, 4k",
  },

  // Friendly Female Actors
  {
    name: "Lisa Anderson",
    slug: "lisa-anderson",
    gender: "female",
    style: "friendly",
    description: "Warm and welcoming with infectious enthusiasm",
    voiceId: "nova",
    imagePrompt: "Friendly headshot of a 34 year old Caucasian woman, bright warm smile, wearing colorful casual top, medium length auburn hair, soft studio lighting, neutral background, inviting expression, portrait photography, 4k",
  },
  {
    name: "Rachel Kim",
    slug: "rachel-kim",
    gender: "female",
    style: "friendly",
    description: "Bright and cheerful with natural warmth",
    voiceId: "shimmer",
    imagePrompt: "Friendly headshot of a 29 year old Asian American woman, cheerful genuine smile, wearing soft pastel sweater, long straight black hair, natural lighting, neutral background, warm approachable expression, 4k",
  },

  // Diverse Actors
  {
    name: "Aisha Patel",
    slug: "aisha-patel",
    gender: "female",
    style: "professional",
    description: "Elegant and articulate with global appeal",
    voiceId: "nova",
    imagePrompt: "Professional headshot of a 33 year old Indian woman, elegant confident smile, wearing sophisticated burgundy blazer, long dark hair, studio lighting, neutral background, polished executive portrait, 4k",
  },
  {
    name: "James Okonkwo",
    slug: "james-okonkwo",
    gender: "male",
    style: "friendly",
    description: "Charismatic and engaging storyteller",
    voiceId: "onyx",
    imagePrompt: "Friendly headshot of a 35 year old Nigerian man, charismatic warm smile, wearing smart casual blazer, short hair, soft studio lighting, neutral background, engaging expression, portrait photography, 4k",
  },
  {
    name: "Sophie Laurent",
    slug: "sophie-laurent",
    gender: "female",
    style: "casual",
    description: "Sophisticated yet approachable European style",
    voiceId: "shimmer",
    imagePrompt: "Casual headshot of a 31 year old French woman, subtle elegant smile, wearing chic simple top, shoulder length light brown hair, soft natural lighting, neutral background, effortlessly stylish portrait, 4k",
  },
  {
    name: "Kenji Tanaka",
    slug: "kenji-tanaka",
    gender: "male",
    style: "professional",
    description: "Modern professional with global business experience",
    voiceId: "echo",
    imagePrompt: "Professional headshot of a 42 year old Japanese man, confident composed expression, wearing modern dark suit, neat short black hair, studio lighting, neutral background, international executive portrait, 4k",
  },
];

interface FluxOutput {
  images: Array<{
    url: string;
    content_type?: string;
  }>;
}

async function generatePortrait(prompt: string, actorName: string): Promise<string> {
  console.log(`   🎨 Generating portrait for ${actorName}...`);

  try {
    const result = await fal.subscribe(FLUX_MODEL, {
      input: {
        prompt: prompt,
        image_size: "square_hd", // 1024x1024
        num_images: 1,
        enable_safety_checker: true,
      },
    });

    const output = result.data as FluxOutput;

    if (!output.images || output.images.length === 0) {
      throw new Error("No image generated");
    }

    console.log(`   ✅ Portrait generated for ${actorName}`);
    return output.images[0].url;
  } catch (error) {
    console.error(`   ❌ Failed to generate portrait for ${actorName}:`, error);
    throw error;
  }
}

async function main() {
  console.log("🎭 Seeding FAL Actors with AI-generated portraits...\n");

  if (!process.env.FAL_API_KEY) {
    console.error("❌ FAL_API_KEY environment variable is required");
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const actor of actors) {
    const existing = await prisma.falActor.findUnique({
      where: { slug: actor.slug },
    });

    if (existing) {
      console.log(`⏭️  Skipping "${actor.name}" (already exists)`);
      skipped++;
      continue;
    }

    console.log(`\n👤 Creating "${actor.name}" (${actor.gender}, ${actor.style})`);

    try {
      // Generate portrait using Flux
      const imageUrl = await generatePortrait(actor.imagePrompt, actor.name);

      // Create actor in database
      await prisma.falActor.create({
        data: {
          name: actor.name,
          slug: actor.slug,
          gender: actor.gender,
          style: actor.style,
          description: actor.description,
          voiceId: actor.voiceId,
          referenceImageUrl: imageUrl,
          thumbnailUrl: imageUrl, // Same image, Flux generates high quality
          isActive: true,
          sortOrder: created,
        },
      });

      console.log(`   💾 Saved to database`);
      created++;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`   ❌ Failed to create "${actor.name}":`, error);
      // Continue with next actor
    }
  }

  console.log(`\n🎉 Done! Created ${created} actors, skipped ${skipped} existing.\n`);

  // Summary
  const total = await prisma.falActor.count();
  const byGender = await prisma.falActor.groupBy({
    by: ["gender"],
    _count: true,
  });
  const byStyle = await prisma.falActor.groupBy({
    by: ["style"],
    _count: true,
  });

  console.log("📊 Summary:");
  console.log(`   Total actors: ${total}`);
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
