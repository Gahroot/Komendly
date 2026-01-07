/**
 * Blog Image Generator Script
 *
 * Generates images for blog posts that don't have images using
 * FAL AI's nano-banana-pro model (Google's image generation).
 *
 * Usage:
 *   npx tsx scripts/generate-blog-images.ts --all
 *   npx tsx scripts/generate-blog-images.ts --slug=my-blog-post
 *   npx tsx scripts/generate-blog-images.ts --dry-run
 */

import { fal } from "@fal-ai/client";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import { config } from "dotenv";

// Load environment variables
config({ path: ".env.local" });
config({ path: ".env" });

const FAL_API_KEY = process.env.FAL_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!FAL_API_KEY) {
  console.error("Error: FAL_API_KEY not found in environment variables");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY not found in environment variables");
  process.exit(1);
}

fal.config({ credentials: FAL_API_KEY });

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ============================================================================
// CONFIGURATION
// ============================================================================

const BLOG_DIR = path.join(process.cwd(), "content/blog");
const OUTPUT_DIR = path.join(process.cwd(), "public/blog");

interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  image?: string;
  filePath: string;
}

// ============================================================================
// BLOG POST UTILITIES
// ============================================================================

function getBlogPostsWithoutImages(): BlogPostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BLOG_DIR).filter(
    (file) => file.endsWith(".mdx") || file.endsWith(".md")
  );

  const posts: BlogPostMeta[] = [];

  for (const file of files) {
    const filePath = path.join(BLOG_DIR, file);
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const { data } = matter(fileContent);

    // Skip if already has an image
    if (data.image) {
      continue;
    }

    // Skip unpublished posts
    if (data.published === false) {
      continue;
    }

    const slug = file.replace(/\.(mdx|md)$/, "");

    posts.push({
      slug,
      title: data.title || slug,
      description: data.description || "",
      image: data.image,
      filePath,
    });
  }

  return posts;
}

function getBlogPostBySlug(slug: string): BlogPostMeta | null {
  if (!fs.existsSync(BLOG_DIR)) {
    return null;
  }

  // Try both .mdx and .md extensions
  const extensions = [".mdx", ".md"];

  for (const ext of extensions) {
    const filePath = path.join(BLOG_DIR, `${slug}${ext}`);

    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(fileContent);

      return {
        slug,
        title: data.title || slug,
        description: data.description || "",
        image: data.image,
        filePath,
      };
    }
  }

  return null;
}

// ============================================================================
// IMAGE PROMPT GENERATION
// ============================================================================

async function generateImagePrompt(
  title: string,
  description: string
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are an expert at creating image prompts for blog header images.
Generate a single, detailed image prompt that would make an engaging 16:9 blog header image.

Rules:
- Create a visually striking, professional image concept
- Focus on abstract concepts, metaphors, or symbolic imagery related to the topic
- Do NOT include text, words, or typography in the image
- Avoid generic stock photo looks - be creative and specific
- Include lighting, mood, color palette, and style details
- Keep it under 200 characters
- Do NOT include any people or faces
- Focus on objects, environments, abstract concepts, or technology visuals`,
      },
      {
        role: "user",
        content: `Create an image prompt for a blog post with:
Title: "${title}"
Description: "${description}"

Return ONLY the image prompt, nothing else.`,
      },
    ],
    max_tokens: 100,
    temperature: 0.8,
  });

  return completion.choices[0]?.message?.content?.trim() || title;
}

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
      aspect_ratio: "16:9",
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
// MDX UPDATE
// ============================================================================

function updateMdxFrontmatter(filePath: string, imagePath: string): void {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(fileContent);

  // Update the image field
  data.image = imagePath;

  // Reconstruct the file with updated frontmatter
  const updatedContent = matter.stringify(content, data);
  fs.writeFileSync(filePath, updatedContent);
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

interface GenerationStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

async function processPost(
  post: BlogPostMeta,
  dryRun: boolean
): Promise<"success" | "failed" | "skipped"> {
  const outputPath = path.join(OUTPUT_DIR, `${post.slug}.png`);
  const webPath = `/blog/${post.slug}.png`;

  // Skip if image already exists locally
  if (fs.existsSync(outputPath)) {
    console.log(`  Skipping: Image already exists at ${outputPath}`);
    return "skipped";
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would generate image for: ${post.title}`);
    console.log(`  [DRY RUN] Output path: ${outputPath}`);
    return "skipped";
  }

  try {
    // Generate image prompt using OpenAI
    console.log(`  Generating image prompt...`);
    const imagePrompt = await generateImagePrompt(post.title, post.description);
    console.log(`  Prompt: "${imagePrompt}"`);

    // Generate image using FAL AI
    console.log(`  Generating image with FAL AI...`);
    const result = await generateImage(imagePrompt);

    if (!result.images || result.images.length === 0) {
      console.error(`  Error: No image returned from FAL AI`);
      return "failed";
    }

    // Download and save the image
    console.log(`  Downloading image...`);
    await downloadImage(result.images[0].url, outputPath);
    console.log(`  Saved image to: ${outputPath}`);

    // Update MDX frontmatter
    console.log(`  Updating frontmatter...`);
    updateMdxFrontmatter(post.filePath, webPath);
    console.log(`  Updated ${post.filePath} with image: ${webPath}`);

    return "success";
  } catch (error) {
    console.error(`  Error processing ${post.slug}:`, error);
    return "failed";
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let processAll = false;
  let targetSlug: string | null = null;
  let dryRun = false;

  for (const arg of args) {
    if (arg === "--all") {
      processAll = true;
    } else if (arg.startsWith("--slug=")) {
      targetSlug = arg.replace("--slug=", "");
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help") {
      console.log(`
Blog Image Generator

Usage:
  npx tsx scripts/generate-blog-images.ts [options]

Options:
  --all            Process all blog posts without images
  --slug=<slug>    Process a specific blog post by slug
  --dry-run        Show what would be done without making changes
  --help           Show this help message

Examples:
  npx tsx scripts/generate-blog-images.ts --all
  npx tsx scripts/generate-blog-images.ts --slug=my-blog-post
  npx tsx scripts/generate-blog-images.ts --all --dry-run
      `);
      process.exit(0);
    }
  }

  if (!processAll && !targetSlug) {
    console.error("Error: Must specify --all or --slug=<slug>");
    console.log("Use --help for usage information");
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`\n📷 Blog Image Generator`);
  console.log(`========================`);
  if (dryRun) {
    console.log(`Mode: DRY RUN (no changes will be made)`);
  }
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  const stats: GenerationStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
  };

  if (targetSlug) {
    // Process single post
    const post = getBlogPostBySlug(targetSlug);

    if (!post) {
      console.error(`Error: Blog post not found: ${targetSlug}`);
      process.exit(1);
    }

    console.log(`Processing: ${post.title}`);
    stats.total = 1;

    const result = await processPost(post, dryRun);
    stats[result]++;
  } else {
    // Process all posts without images
    const posts = getBlogPostsWithoutImages();

    if (posts.length === 0) {
      console.log("No blog posts without images found.");
      process.exit(0);
    }

    console.log(`Found ${posts.length} posts without images:\n`);
    posts.forEach((p, i) => console.log(`  ${i + 1}. ${p.title}`));
    console.log("");

    stats.total = posts.length;

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      console.log(`\n[${i + 1}/${posts.length}] ${post.title}`);

      const result = await processPost(post, dryRun);
      stats[result]++;

      // Rate limiting - wait 1s between requests
      if (i < posts.length - 1 && result === "success") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // Summary
  console.log(`\n========================`);
  console.log(`Summary:`);
  console.log(`  Total: ${stats.total}`);
  console.log(`  Success: ${stats.success}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Skipped: ${stats.skipped}`);

  if (!dryRun && stats.success > 0) {
    console.log(`\nEstimated cost: $${(stats.success * 0.15).toFixed(2)} (at $0.15/image)`);
  }

  console.log(`\nDone!`);
}

main().catch(console.error);
