// Ozzy Studio render guard: a mistyped library URL (e.g. "gsap@3.14.2/dist/gsap@3.14.2/dist/gsap.min.js") blocks the
// whole render ("sub_timeline_script_failure"). Before rendering, point every GSAP script/plugin at a known-good CDN URL.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const GSAP_VERSION = "3.14.2";
const GOOD = (file: string) => `https://cdn.jsdelivr.net/npm/gsap@${GSAP_VERSION}/dist/${file}`;

/** Pure: rewrite broken GSAP CDN URLs to the canonical one, keeping the plugin file name. */
export function fixGsapUrls(html: string): { html: string; fixed: number } {
  let fixed = 0;
  const out = html.replace(/https?:\/\/[^"'\s)]*gsap[^"'\s)]*?\/([A-Za-z0-9]+(?:\.min)?\.js)/g, (url, file: string) => {
    const good = GOOD(file);
    if (url === good) return url;
    const ok = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/gsap@[\d.]+\/dist|cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/[\d.]+|unpkg\.com\/gsap@[\d.]+\/dist)\/[A-Za-z0-9]+(\.min)?\.js$/.test(url);
    if (ok) return url;
    fixed++;
    return good;
  });
  return { html: out, fixed };
}

/** Fix every .html in the composition folder (top level + one level down). Returns how many URLs changed. */
export async function fixCompositionScripts(compDir: string): Promise<number> {
  let total = 0;
  const visit = async (dir: string, depth: number): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory() && depth < 1 && !["node_modules", "kit", "uploads", "brand", "audio", "renders"].includes(e.name)) await visit(join(dir, e.name), depth + 1);
      else if (e.isFile() && e.name.endsWith(".html")) {
        const p = join(dir, e.name);
        const src = await readFile(p, "utf8").catch(() => null);
        if (src === null) continue;
        const { html, fixed } = fixGsapUrls(src);
        if (fixed) { await writeFile(p, html); total += fixed; }
      }
    }
  };
  await visit(compDir, 0);
  return total;
}
