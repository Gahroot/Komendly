// Generates actor portraits via Codex gpt-image-2 (ChatGPT subscription). Re-runnable: skips existing files.
// Run from engine/: npx tsx ../scripts/testimonial-actors/generate-portraits.mts [slug...]
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { CodexAuth } from "../../engine/src/providers/codex-auth";
import { codexImage, ImageLimitError } from "../../engine/src/providers/codex-images";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../..");
const outDir = path.join(root, "public/actors");
mkdirSync(path.join(outDir, "thumbs"), { recursive: true });
const cast = JSON.parse(readFileSync(path.join(here, "cast.json"), "utf8")) as Array<{ slug: string; prompt: string }>;
const only = process.argv.slice(2);
const todo = cast.filter((a) => (only.length ? only.includes(a.slug) : true) && !existsSync(path.join(outDir, `${a.slug}.jpg`)));
const auth = new CodexAuth({ authFile: os.homedir() + "/.ezcoder/auth.json" });

async function one(a: { slug: string; prompt: string }): Promise<void> {
  for (;;) {
    try {
      const { accessToken, accountId } = await auth.resolve();
      const png = await codexImage({ prompt: a.prompt, size: "1024x1536", quality: "high", background: "opaque", token: accessToken, accountId });
      const tmp = path.join(os.tmpdir(), `${a.slug}.png`);
      writeFileSync(tmp, png);
      const jpg = path.join(outDir, `${a.slug}.jpg`);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-vf", "scale=1024:1536:force_original_aspect_ratio=increase:flags=lanczos,crop=1024:1536", "-q:v", "3", jpg]);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", jpg, "-vf", "scale=384:-2", "-q:v", "3", path.join(outDir, "thumbs", `${a.slug}.jpg`)]);
      unlinkSync(tmp);
      console.log("ok", a.slug);
      return;
    } catch (e) {
      if (e instanceof ImageLimitError) {
        const wait = Math.max(60_000, (e.resetsAt ? (e.resetsAt < 1e12 ? e.resetsAt * 1000 : e.resetsAt) : Date.now() + 600_000) - Date.now() + 5_000);
        console.log("limit; waiting", Math.round(wait / 1000), "s");
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      console.error("fail", a.slug, (e as Error).message);
      return;
    }
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => { for (let a = queue.shift(); a; a = queue.shift()) await one(a); }));
