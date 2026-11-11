// Upserts the testimonial actor cast by slug and deactivates actors not in the cast.
// Voices: the video model (Kling v4) speaks natively in the accent from voicePrompt. Every actor is
// reset to voiceProvider "kling" with voiceId null; the engine clones and locks the voice lazily
// after the actor's first successful take (so re-running this seed resets all voice locks).
// npx tsx --env-file=.env.local scripts/testimonial-actors/seed.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

interface CastActor {
  name: string; slug: string; gender: string; style: string; ageRange: string; persona: string;
  occupation: string; setting: string; accent: string; voicePrompt: string;
  voiceSettings: { stability: number }; description: string; tags: string[]; industries: string[]; sortOrder: number;
}

const cast = JSON.parse(readFileSync(path.join(__dirname, "cast.json"), "utf8")) as CastActor[];
const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const a of cast) {
    const data = {
      name: a.name, gender: a.gender, style: a.style, ageRange: a.ageRange, persona: a.persona,
      occupation: a.occupation, setting: a.setting, voiceProvider: "kling", voiceId: null,
      voicePrompt: a.voicePrompt, voiceSettings: a.voiceSettings, description: a.description,
      tags: a.tags, industries: a.industries, sortOrder: a.sortOrder, isActive: true,
      referenceImageUrl: `https://www.komendly.com/actors/${a.slug}.jpg`,
      thumbnailUrl: `/actors/thumbs/${a.slug}.jpg`,
    };
    await prisma.falActor.upsert({ where: { slug: a.slug }, create: { slug: a.slug, ...data }, update: data });
  }
  const off = await prisma.falActor.updateMany({ where: { slug: { notIn: cast.map((a) => a.slug) }, isActive: true }, data: { isActive: false } });
  const active = await prisma.falActor.count({ where: { isActive: true } });
  console.log(`upserted ${cast.length}, deactivated ${off.count}, active ${active}`);
}

main().finally(() => prisma.$disconnect());
