// Ozzy Studio kit: ready-made illustrations, a starter composition, a palette helper and craft notes,
// copied into every project as ./kit/ so cheaper models compose polished parts instead of drawing from scratch.
import { copyFile, cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VENDOR_DIR } from "../modules/ezmotion/fonts";

export const KIT_DIR = fileURLToPath(new URL("./kit/", import.meta.url));
/** Vendored OFL fonts the starter's @font-face rules point at (./kit/fonts/<file>). */
export const KIT_FONTS = ["fraunces/fraunces-normal.woff2", "fraunces/fraunces-italic.woff2", "bricolage-grotesque/bricolage-grotesque-normal.woff2", "host-grotesk/host-grotesk-normal.woff2"] as const;

/** Copy (or refresh) ./kit into a project. Overwrites kit files only; the agent's own files are untouched. */
export async function installStudioKit(project: string): Promise<void> {
  const dest = join(project, "kit");
  await cp(KIT_DIR, dest, { recursive: true, force: true });
  await mkdir(join(dest, "fonts"), { recursive: true });
  for (const f of KIT_FONTS) await copyFile(join(VENDOR_DIR, "fonts", f), join(dest, "fonts", f.split("/").pop() ?? f));
}
