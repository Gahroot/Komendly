/**
 * Update script to populate voicePrompt for existing FalActors
 * Run with: npx tsx prisma/update-actor-voice-prompts.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Voice prompts keyed by actor slug
const voicePrompts: Record<string, string> = {
  "marcus-chen":
    "Deep, warm baritone male voice. Clear American accent with slight West Coast influence. Confident and measured pace, approximately 140 words per minute. Professional yet approachable tone. Resonant chest voice with smooth delivery. Slight upward inflection when making key points.",
  "david-williams":
    "Rich, authoritative male voice with executive presence. Neutral American accent, Midwest influence. Deliberate pacing around 130 words per minute. Warm undertones with occasional gravelly texture. Commands attention without being harsh. Natural pauses for emphasis.",
  "jake-thompson":
    "Friendly, youthful male voice with relaxed California surfer vibe. Casual American accent, slightly laid-back. Natural conversational pace around 150 words per minute. Genuine enthusiasm with easy-going delivery. Slightly higher register, clear and bright. Authentic and unpolished feel.",
  "carlos-rivera":
    "Warm, expressive male voice with natural charisma. Slight Latin American influence in pronunciation. Energetic pace around 155 words per minute. Rich mid-range tone with occasional passionate emphasis. Engaging storyteller quality. Friendly and animated without being over the top.",
  "michael-johnson":
    "Deep, soulful male voice with genuine warmth. Smooth American accent with Southern hospitality undertones. Unhurried pace around 135 words per minute. Rich bass tones with velvet-smooth delivery. Naturally reassuring and trustworthy. Occasional gentle chuckle quality.",
  "sarah-mitchell":
    "Clear, confident female voice with executive polish. Crisp American accent, East Coast professional. Articulate pace around 145 words per minute. Alto range with authoritative presence. Warm but businesslike delivery. Strategic pauses and emphasis on key points.",
  "jennifer-park":
    "Polished, sophisticated female voice with refined diction. Clear American accent with cosmopolitan influence. Measured pace around 140 words per minute. Smooth mezzo-soprano range. Poised and composed delivery with quiet confidence. Subtle emphasis through tone rather than volume.",
  "emma-davis":
    "Bright, youthful female voice with girl-next-door authenticity. Natural American accent, slightly Valley-influenced. Conversational pace around 155 words per minute. Clear soprano range with occasional upspeak. Genuine and relatable delivery. Easy smile in the voice.",
  "maria-santos":
    "Warm, melodic female voice with natural charm. American accent with subtle Latin warmth. Relaxed pace around 145 words per minute. Rich alto tones with expressive quality. Genuine and approachable delivery. Occasional passionate emphasis when excited.",
  "lisa-anderson":
    "Bright, enthusiastic female voice with infectious energy. Friendly Midwestern American accent. Upbeat pace around 160 words per minute. Clear mid-range with natural lift. Genuinely excited delivery without being over the top. Warm smile always audible in tone.",
  "rachel-kim":
    "Gentle, cheerful female voice with calm positivity. Soft American accent, Pacific Northwest influence. Balanced pace around 145 words per minute. Sweet soprano with soothing quality. Naturally optimistic delivery. Thoughtful pauses and genuine warmth.",
  "aisha-patel":
    "Elegant, articulate female voice with international sophistication. Clear American accent with subtle South Asian musicality. Refined pace around 140 words per minute. Smooth alto with cultured polish. Confident yet gracious delivery. Precise enunciation without being stiff.",
  "james-okonkwo":
    "Rich, charismatic male voice with natural storytelling ability. American accent with subtle West African musical influence. Engaging pace around 145 words per minute. Deep baritone with dynamic range. Captivating delivery that draws listeners in. Expressive emphasis and natural rhythm.",
  "sophie-laurent":
    "Refined, elegant female voice with subtle European sophistication. American accent with light French influence in certain vowels. Unhurried pace around 138 words per minute. Smooth mezzo-soprano with cultured quality. Effortlessly chic delivery. Understated confidence.",
  "kenji-tanaka":
    "Composed, professional male voice with international business presence. Clear American accent, neutral and cosmopolitan. Measured pace around 135 words per minute. Steady mid-range baritone with calm authority. Thoughtful, precise delivery. Reserved confidence with occasional warmth.",
};

async function main() {
  console.log("Updating FalActors with voice prompts...\n");

  let updated = 0;
  let notFound = 0;
  let alreadySet = 0;

  for (const [slug, voicePrompt] of Object.entries(voicePrompts)) {
    const actor = await prisma.falActor.findUnique({
      where: { slug },
    });

    if (!actor) {
      console.log(`  ⚠️  Actor "${slug}" not found in database`);
      notFound++;
      continue;
    }

    if (actor.voicePrompt) {
      console.log(`  ⏭️  "${actor.name}" already has voicePrompt set`);
      alreadySet++;
      continue;
    }

    await prisma.falActor.update({
      where: { slug },
      data: { voicePrompt },
    });

    console.log(`  ✅ Updated "${actor.name}"`);
    updated++;
  }

  console.log("\n--- Summary ---");
  console.log(`  Updated: ${updated}`);
  console.log(`  Already set: ${alreadySet}`);
  console.log(`  Not found: ${notFound}`);
  console.log("\nDone!");
}

main()
  .catch((e) => {
    console.error("Error updating actors:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
