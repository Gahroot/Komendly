// Local-only: render sample reels with local ffmpeg, art read from public/ (no network). Usage: npx tsx engine/src/growth/reels-sample.ts <outDir>
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildScript, hookById } from "../../../src/lib/growth/reels-core";
import { renderReel } from "./reels";

const out = process.argv[2] ?? "/tmp/reels-samples";
const local = (async (url: string) => {
  const rel = new URL(url).pathname;
  try { return new Response(await readFile(path.join(process.cwd(), process.cwd().endsWith("engine") ? ".." : ".", "public", rel)), { headers: { "content-type": rel.endsWith(".jpg") ? "image/jpeg" : "image/png" } }); } catch { return new Response("", { status: 404 }); }
}) as typeof fetch;
for (const [id, cta] of [["roofers:tips", true], ["hvac:tips-first-line", false], ["plumbers:makeover", false], ["painters:makeover-skip", true], ["landscapers:how-i", false], ["electricians:how-i", true]] as const) {
  const buf = await renderReel(buildScript(hookById(id)!, cta), undefined, local);
  await writeFile(path.join(out, `${id.replace(/[:]/g, "_")}.mp4`), buf);
  console.log(id, buf.length);
}
