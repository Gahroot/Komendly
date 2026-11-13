// Ozzy Studio kit: ready-made illustrations, a starter composition, a palette helper and craft notes,
// copied into every project as ./kit/ so cheaper models compose polished parts instead of drawing from scratch.
import { copyFile, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VENDOR_DIR } from "../modules/ezmotion/fonts";

export const KIT_DIR = fileURLToPath(new URL("./kit/", import.meta.url));
/** Vendored OFL fonts the starters' @font-face rules point at (./kit/fonts/<file>). */
export const KIT_FONTS = ["fraunces/fraunces-normal.woff2", "fraunces/fraunces-italic.woff2", "bricolage-grotesque/bricolage-grotesque-normal.woff2", "host-grotesk/host-grotesk-normal.woff2",
  // starters/*.html
  "unbounded/unbounded-normal.woff2", "big-shoulders/big-shoulders-normal.woff2", "gloock/gloock-normal.woff2", "newsreader/newsreader-normal.woff2", "newsreader/newsreader-italic.woff2", "mona-sans/mona-sans-normal.woff2", "archivo/archivo-normal.woff2"] as const;

/** Lucide (ISC) icon package root: icons/*.svg (stroke="currentColor") + tags.json. */
export const LUCIDE_DIR = dirname(createRequire(import.meta.url).resolve("lucide-static/package.json"));

/** ./kit/icons/INDEX.txt: one "name: tag, tag" line per icon, sorted, so the agent can grep by trade (tooth, paw, car...). */
export function iconIndex(names: string[], tags: Record<string, string[]>): string {
  return `${[...names].sort().map((n) => `${n}${tags[n]?.length ? `: ${tags[n].join(", ")}` : ""}`).join("\n")}\n`;
}

async function installIcons(dest: string): Promise<void> {
  const src = join(LUCIDE_DIR, "icons");
  await mkdir(dest, { recursive: true });
  const names = (await readdir(src)).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4));
  // Parallel copies in chunks (fs.cp walks files one by one: ~0.5 s for 2k icons).
  for (let i = 0; i < names.length; i += 512) await Promise.all(names.slice(i, i + 512).map((n) => copyFile(join(src, `${n}.svg`), join(dest, `${n}.svg`))));
  const tags = JSON.parse(await readFile(join(LUCIDE_DIR, "tags.json"), "utf8")) as Record<string, string[]>;
  await writeFile(join(dest, "INDEX.txt"), iconIndex(names, tags));
  await copyFile(join(LUCIDE_DIR, "LICENSE"), join(dest, "LICENSE.txt"));
}

/** Copy (or refresh) ./kit into a project. Overwrites kit files only; the agent's own files are untouched. */
export async function installStudioKit(project: string): Promise<void> {
  const dest = join(project, "kit");
  await cp(KIT_DIR, dest, { recursive: true, force: true });
  await mkdir(join(dest, "fonts"), { recursive: true });
  await mkdir(join(dest, "bin"), { recursive: true });
  await Promise.all([
    // Music + sound effects maker (offline, no licensing questions): node kit/bin/score-synth.mjs score.json audio/
    copyFile(join(VENDOR_DIR, "bin", "score-synth.mjs"), join(dest, "bin", "score-synth.mjs")),
    ...KIT_FONTS.map((f) => copyFile(join(VENDOR_DIR, "fonts", f), join(dest, "fonts", f.split("/").pop() ?? f))),
    installIcons(join(dest, "icons")),
  ]);
}
