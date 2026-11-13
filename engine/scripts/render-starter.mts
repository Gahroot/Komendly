// dev harness: npx tsx scripts/render-starter.mts <name> <WxH> [photo]
import { mkdtemp, copyFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os"; import { join } from "node:path";
import { installStudioKit } from "../src/studio/kit-install";
import { renderComposition } from "../src/modules/ezmotion/runtime";
// @ts-ignore
import { findBlankFrames } from "../src/modules/ezmotion/agent/blank-check.mjs";
(async () => {
  const [name, size, photo] = process.argv.slice(2);
  const [w, h] = size.split("x");
  const H = "/Users/groot/.ezcoder/goals/ezmotionkom/harness/starters";
  const dir = await mkdtemp(join(tmpdir(), "starter-"));
  const t0 = Date.now(); await installStudioKit(dir); const kitMs = Date.now() - t0;
  await mkdir(join(dir, "brand/photos"), { recursive: true });
  await copyFile(join(H, "photo-a.jpg"), join(dir, "brand/photos/a.jpg"));
  await copyFile(join(H, "photo-b.jpg"), join(dir, "brand/photos/b.jpg"));
  const src = name === "starter" ? "kit/starter.html" : `kit/starters/${name}.html`;
  let html = await readFile(join(dir, src), "utf8");
  html = html.replace(/width=1080, height=1920/, `width=${w}, height=${h}`).replace(/data-width="1080" data-height="1920"/, `data-width="${w}" data-height="${h}"`);
  let n = 0;
  if (photo) html = html.replace(/class="media([^"]*?) illus([^"]*)"><img src="[^"]+"/g, (_m, c1, c2) => { const c = c1 + c2; const f = /before/.test(c) ? "a" : /after/.test(c) ? "b" : n++ % 2 ? "b" : "a"; return `class="media${c}"><img src="brand/photos/${f}.jpg"`; });
  await writeFile(join(dir, "index.html"), html);
  const tag = `${name}-${w}x${h}${photo ? "-photo" : ""}`;
  const out = join(H, `${tag}.mp4`);
  const t1 = Date.now();
  const r = await renderComposition(dir, out, { fps: 30, timeoutMs: 300000 });
  const ms = Date.now() - t1;
  const blank = await findBlankFrames(dir);
  console.log(JSON.stringify({ tag, code: r.code, renderS: (ms / 1000).toFixed(1), kitMs, blank, dir, err: r.code ? r.stderr.slice(-800) : "" }));
})();
