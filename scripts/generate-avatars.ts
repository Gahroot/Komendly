/**
 * Avatar Image Generator Script
 *
 * Generates realistic portrait images of diverse actors for video testimonials
 * using FAL AI's nano-banana-pro model.
 *
 * Usage:
 *   npx tsx scripts/generate-avatars.ts
 *   npx tsx scripts/generate-avatars.ts --count 5
 *   npx tsx scripts/generate-avatars.ts --output ./my-avatars
 */

import { fal } from "@fal-ai/client";
import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: ".env.local" });
config({ path: ".env" });

const FAL_API_KEY = process.env.FAL_API_KEY;

if (!FAL_API_KEY) {
  console.error("Error: FAL_API_KEY not found in environment variables");
  process.exit(1);
}

fal.config({ credentials: FAL_API_KEY });

// ============================================================================
// ACTOR DEFINITIONS
// ============================================================================

interface ActorDefinition {
  name: string;
  description: string;
  age: string;
  ethnicity: string;
  gender: string;
  features?: string;
}

const ACTORS: ActorDefinition[] = [
  // Young Adults (20s)
  { name: "Tyler", description: "young man with wavy brown hair", age: "early 30s", ethnicity: "Caucasian", gender: "male", features: "casual t-shirt" },
  { name: "Madison", description: "young woman with long blonde hair", age: "mid 30s", ethnicity: "Caucasian", gender: "female", features: "natural makeup" },
  { name: "Jamal", description: "young man with short fade haircut", age: "mid 30s", ethnicity: "African American", gender: "male", features: "trimmed beard" },
  { name: "Priya", description: "young woman with long dark hair", age: "early 30s", ethnicity: "South Asian", gender: "female", features: "elegant features" },
  { name: "Kevin", description: "young man with black hair", age: "late 20s", ethnicity: "East Asian", gender: "male", features: "clean shaven" },
  { name: "Sofia", description: "young woman with brown curly hair", age: "mid 30s", ethnicity: "Latina", gender: "female", features: "warm smile" },

  // Late 20s - Early 30s
  { name: "Marcus", description: "man with short dreadlocks", age: "late 30s", ethnicity: "African American", gender: "male", features: "stylish glasses" },
  { name: "Emma", description: "woman with auburn hair", age: "early 40s", ethnicity: "Caucasian", gender: "female", features: "freckles" },
  { name: "Hiroshi", description: "man with styled black hair", age: "early 40s", ethnicity: "Japanese", gender: "male", features: "designer stubble" },
  { name: "Aaliyah", description: "woman with natural curly hair", age: "late 30s", ethnicity: "Middle Eastern", gender: "female", features: "expressive eyes" },
  { name: "Diego", description: "man with dark wavy hair", age: "early 30s", ethnicity: "Latino", gender: "male", features: "friendly face" },
  { name: "Noemi", description: "woman with green-tinted hair", age: "late 20s", ethnicity: "Asian American", gender: "female", features: "creative style" },

  // Mid 30s - 40s
  { name: "Michael", description: "man with short brown hair", age: "late 30s", ethnicity: "Caucasian", gender: "male", features: "professional look" },
  { name: "Amara", description: "woman with braided hair", age: "mid 30s", ethnicity: "Nigerian", gender: "female", features: "confident expression" },
  { name: "Raj", description: "man with salt-and-pepper hair", age: "early 50s", ethnicity: "Indian", gender: "male", features: "well-groomed beard" },
  { name: "Linda", description: "woman with shoulder-length blonde hair", age: "mid 50s", ethnicity: "Caucasian", gender: "female", features: "warm demeanor" },
  { name: "Andre", description: "man with shaved head", age: "late 30s", ethnicity: "African American", gender: "male", features: "athletic build" },
  { name: "Mei", description: "woman with straight black hair", age: "early 40s", ethnicity: "Chinese", gender: "female", features: "silver earrings" },

  // Late 40s - 50s
  { name: "Douglas", description: "man with silver-gray hair", age: "mid 50s", ethnicity: "Caucasian", gender: "male", features: "distinguished look" },
  { name: "Claudia", description: "woman with red-brown hair", age: "late 40s", ethnicity: "Latina", gender: "female", features: "glasses" },
  { name: "Walter", description: "man with white beard", age: "late 50s", ethnicity: "Caucasian", gender: "male", features: "kind eyes" },
  { name: "Grace", description: "woman with short gray hair", age: "mid 50s", ethnicity: "African American", gender: "female", features: "elegant style" },
  { name: "Kenji", description: "man with graying temples", age: "early 50s", ethnicity: "Japanese", gender: "male", features: "reading glasses" },
  { name: "Patricia", description: "woman with silver streaks in dark hair", age: "late 40s", ethnicity: "Filipino", gender: "female", features: "warm smile" },

  // 60s+
  { name: "Graham", description: "man with full gray hair", age: "mid 60s", ethnicity: "Caucasian", gender: "male", features: "weathered face" },
  { name: "Eleanor", description: "woman with white bob haircut", age: "early 60s", ethnicity: "Caucasian", gender: "female", features: "pearl earrings" },
  { name: "Tobias", description: "man with white beard and hair", age: "late 60s", ethnicity: "Caucasian", gender: "male", features: "grandfatherly" },
];

// ============================================================================
// BACKGROUND/SETTING VARIATIONS - Authentic, casual, non-professional
// ============================================================================

const BACKGROUNDS = [
  // In the car (super common for real testimonials!)
  "sitting in car, car interior background, natural daylight through windows",
  "in parked car, steering wheel slightly visible, casual setting",
  "car interior with window light, everyday setting",

  // At home - casual, not styled
  "messy living room couch, natural home environment",
  "kitchen background with normal clutter, everyday home",
  "bedroom with unmade bed visible in background",
  "dining table at home, casual domestic setting",
  "home office with cluttered desk in background",
  "laundry room or hallway at home",

  // Outdoors - casual
  "backyard with fence and grass visible",
  "park bench with trees in background, natural daylight",
  "walking outside, street or sidewalk background",
  "porch or patio with outdoor furniture",
  "parking lot with cars in background",
  "outside a store or building entrance",

  // Work/everyday places
  "break room at work, basic office background",
  "warehouse or workshop background",
  "retail store backroom",
  "gym locker room or fitness area",
  "waiting room or lobby",

  // Other casual spots
  "coffee shop with other customers blurred",
  "fast food restaurant booth",
  "hotel room with generic decor",
  "airport or transit area",
];

// ============================================================================
// PROMPT GENERATION
// ============================================================================

function generatePrompt(actor: ActorDefinition): string {
  const background = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];

  // Casual, natural expressions - like real people filming testimonials
  const expressions = [
    "talking naturally, relaxed expression",
    "mid-sentence, casual friendly look",
    "speaking casually, genuine smile",
    "explaining something, normal everyday expression",
    "chatting naturally, relaxed and approachable",
    "talking to camera like talking to a friend",
  ];
  const expression = expressions[Math.floor(Math.random() * expressions.length)];

  // Regular everyday clothing - not professional or styled
  const clothing = [
    "casual t-shirt",
    "hoodie",
    "regular everyday clothes",
    "simple sweater",
    "basic shirt",
    "comfortable casual wear",
    "normal day-to-day outfit",
    "plain casual top",
  ];
  const outfit = clothing[Math.floor(Math.random() * clothing.length)];

  const prompt = `
Candid portrait photo of ONE single ${actor.age} ${actor.ethnicity} ${actor.gender} alone with ${actor.description}, ${expression}, ${actor.features || ""}, wearing ${outfit}, ${background}, looking directly at camera, eye contact with camera, natural lighting, authentic candid look, real person not a model, one person only in frame, solo portrait, no other people visible, no text, no watermarks, no timestamps, no UI elements, clean image
  `.trim().replace(/\s+/g, " ");

  return prompt;
}

// Note: nano-banana-pro doesn't support negative_prompt parameter
// Quality guidance is included in the main prompt instead

// ============================================================================
// IMAGE GENERATION
// ============================================================================

interface GenerationResult {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
}

async function generateImage(prompt: string): Promise<GenerationResult> {
  const result = await fal.subscribe("fal-ai/nano-banana-pro", {
    input: {
      prompt,
      aspect_ratio: "9:16",
      num_images: 1,
      resolution: "2K",
      output_format: "png",
    },
  });

  return result.data as GenerationResult;
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

interface GeneratedLook {
  actorName: string;
  lookIndex: number;
  prompt: string;
  imagePath: string;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let outputDir = "./generated-avatars";
  let actorCount = ACTORS.length;
  let looksPerActor = 4;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    } else if (args[i] === "--count" && args[i + 1]) {
      actorCount = Math.min(parseInt(args[i + 1], 10), ACTORS.length);
      i++;
    } else if (args[i] === "--looks" && args[i + 1]) {
      looksPerActor = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--help") {
      console.log(`
Avatar Image Generator

Usage:
  npx tsx scripts/generate-avatars.ts [options]

Options:
  --output <dir>   Output directory (default: ./generated-avatars)
  --count <n>      Number of actors to generate (default: all ${ACTORS.length})
  --looks <n>      Number of looks per actor (default: 4)
  --help           Show this help message

Examples:
  npx tsx scripts/generate-avatars.ts
  npx tsx scripts/generate-avatars.ts --count 5 --looks 2
  npx tsx scripts/generate-avatars.ts --output ./my-avatars
      `);
      process.exit(0);
    }
  }

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const selectedActors = ACTORS.slice(0, actorCount);
  const totalImages = selectedActors.length * looksPerActor;
  const results: GeneratedLook[] = [];

  console.log(`\n🎭 Avatar Image Generator`);
  console.log(`========================`);
  console.log(`Actors: ${selectedActors.length}`);
  console.log(`Looks per actor: ${looksPerActor}`);
  console.log(`Total images: ${totalImages}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Estimated cost: $${(totalImages * 0.15).toFixed(2)} (at $0.15/image)\n`);

  let completed = 0;

  for (const actor of selectedActors) {
    const actorDir = path.join(outputDir, actor.name.toLowerCase());
    if (!fs.existsSync(actorDir)) {
      fs.mkdirSync(actorDir, { recursive: true });
    }

    for (let lookIndex = 1; lookIndex <= looksPerActor; lookIndex++) {
      const prompt = generatePrompt(actor);
      const imagePath = path.join(actorDir, `look-${lookIndex}.png`);

      // Skip if already exists
      if (fs.existsSync(imagePath)) {
        console.log(`⏭️  [${completed + 1}/${totalImages}] ${actor.name} look ${lookIndex} - already exists, skipping`);
        completed++;
        continue;
      }

      try {
        console.log(`🎨 [${completed + 1}/${totalImages}] Generating ${actor.name} look ${lookIndex}...`);

        const result = await generateImage(prompt);

        if (result.images && result.images.length > 0) {
          await downloadImage(result.images[0].url, imagePath);

          results.push({
            actorName: actor.name,
            lookIndex,
            prompt,
            imagePath,
          });

          console.log(`✅ [${completed + 1}/${totalImages}] ${actor.name} look ${lookIndex} saved to ${imagePath}`);
        } else {
          console.error(`❌ [${completed + 1}/${totalImages}] ${actor.name} look ${lookIndex} - no image returned`);
        }
      } catch (error) {
        console.error(`❌ [${completed + 1}/${totalImages}] ${actor.name} look ${lookIndex} failed:`, error);
      }

      completed++;

      // Rate limiting - wait 500ms between requests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Write manifest file
  const manifest = {
    generatedAt: new Date().toISOString(),
    actors: selectedActors.map((actor) => ({
      ...actor,
      looks: Array.from({ length: looksPerActor }, (_, i) => ({
        index: i + 1,
        path: `${actor.name.toLowerCase()}/look-${i + 1}.png`,
      })),
    })),
  };

  fs.writeFileSync(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`\n✨ Generation complete!`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`📋 Manifest: ${path.join(outputDir, "manifest.json")}`);
  console.log(`🎭 Actors: ${selectedActors.length}`);
  console.log(`🖼️  Images: ${results.length} generated`);
}

main().catch(console.error);
