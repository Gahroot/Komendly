/**
 * Seed script for FAL Actors with placeholder images
 * Uses Unsplash for development - run seed-fal-actors.ts later to regenerate with FAL Flux
 *
 * Run with: npx tsx prisma/seed-fal-actors-placeholders.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ActorSeed {
  name: string;
  slug: string;
  gender: "male" | "female";
  style: string;
  description: string;
  voiceId: string;
  referenceImageUrl: string;
  thumbnailUrl: string;
}

// Actor seed data with Unsplash placeholder images
const actors: ActorSeed[] = [
  // Professional Male Actors
  {
    name: "Marcus Chen",
    slug: "marcus-chen",
    gender: "male",
    style: "professional",
    description: "Confident business professional with a warm, trustworthy presence",
    voiceId: "onyx",
    referenceImageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&h=256&fit=crop&crop=face",
  },
  {
    name: "David Williams",
    slug: "david-williams",
    gender: "male",
    style: "professional",
    description: "Polished executive with authoritative yet approachable demeanor",
    voiceId: "echo",
    referenceImageUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=256&h=256&fit=crop&crop=face",
  },

  // Casual Male Actors
  {
    name: "Jake Thompson",
    slug: "jake-thompson",
    gender: "male",
    style: "casual",
    description: "Relaxed and relatable everyday guy next door",
    voiceId: "alloy",
    referenceImageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256&h=256&fit=crop&crop=face",
  },
  {
    name: "Carlos Rivera",
    slug: "carlos-rivera",
    gender: "male",
    style: "casual",
    description: "Friendly and energetic with natural charisma",
    voiceId: "fable",
    referenceImageUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=256&h=256&fit=crop&crop=face",
  },

  // Friendly Male Actor
  {
    name: "Michael Johnson",
    slug: "michael-johnson",
    gender: "male",
    style: "friendly",
    description: "Warm and genuine with an inviting smile",
    voiceId: "echo",
    referenceImageUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=256&h=256&fit=crop&crop=face",
  },

  // Professional Female Actors
  {
    name: "Sarah Mitchell",
    slug: "sarah-mitchell",
    gender: "female",
    style: "professional",
    description: "Confident business leader with polished presentation",
    voiceId: "nova",
    referenceImageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=256&h=256&fit=crop&crop=face",
  },
  {
    name: "Jennifer Park",
    slug: "jennifer-park",
    gender: "female",
    style: "professional",
    description: "Sophisticated professional with commanding presence",
    voiceId: "shimmer",
    referenceImageUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=256&h=256&fit=crop&crop=face",
  },

  // Casual Female Actors
  {
    name: "Emma Davis",
    slug: "emma-davis",
    gender: "female",
    style: "casual",
    description: "Relaxed and authentic everyday person",
    voiceId: "nova",
    referenceImageUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=256&h=256&fit=crop&crop=face",
  },
  {
    name: "Maria Santos",
    slug: "maria-santos",
    gender: "female",
    style: "casual",
    description: "Approachable and down-to-earth personality",
    voiceId: "shimmer",
    referenceImageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=256&h=256&fit=crop&crop=face",
  },

  // Friendly Female Actors
  {
    name: "Lisa Anderson",
    slug: "lisa-anderson",
    gender: "female",
    style: "friendly",
    description: "Warm and welcoming with infectious enthusiasm",
    voiceId: "nova",
    referenceImageUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=256&h=256&fit=crop&crop=face",
  },
  {
    name: "Rachel Kim",
    slug: "rachel-kim",
    gender: "female",
    style: "friendly",
    description: "Bright and cheerful with natural warmth",
    voiceId: "shimmer",
    referenceImageUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=256&h=256&fit=crop&crop=face",
  },

  // Diverse Actors
  {
    name: "Aisha Patel",
    slug: "aisha-patel",
    gender: "female",
    style: "professional",
    description: "Elegant and articulate with global appeal",
    voiceId: "nova",
    referenceImageUrl: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=256&h=256&fit=crop&crop=face",
  },
  {
    name: "James Okonkwo",
    slug: "james-okonkwo",
    gender: "male",
    style: "friendly",
    description: "Charismatic and engaging storyteller",
    voiceId: "onyx",
    referenceImageUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=256&h=256&fit=crop&crop=face",
  },
  {
    name: "Sophie Laurent",
    slug: "sophie-laurent",
    gender: "female",
    style: "casual",
    description: "Sophisticated yet approachable European style",
    voiceId: "shimmer",
    referenceImageUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=256&h=256&fit=crop&crop=face",
  },
  {
    name: "Kenji Tanaka",
    slug: "kenji-tanaka",
    gender: "male",
    style: "professional",
    description: "Modern professional with global business experience",
    voiceId: "echo",
    referenceImageUrl: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=512&h=512&fit=crop&crop=face",
    thumbnailUrl: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=256&h=256&fit=crop&crop=face",
  },
];

async function main() {
  console.log("🎭 Seeding FAL Actors with placeholder images...\n");

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

    await prisma.falActor.create({
      data: {
        name: actor.name,
        slug: actor.slug,
        gender: actor.gender,
        style: actor.style,
        description: actor.description,
        voiceId: actor.voiceId,
        referenceImageUrl: actor.referenceImageUrl,
        thumbnailUrl: actor.thumbnailUrl,
        isActive: true,
        sortOrder: created,
      },
    });

    console.log(`✅ Created "${actor.name}" (${actor.gender}, ${actor.style})`);
    created++;
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
  console.log("\n💡 Tip: Run seed-fal-actors.ts after topping up FAL balance to regenerate with AI portraits");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding actors:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
