// Build: bundle TS -> build/ (load unpacked from here), then zip it -> dist/komendly-extension.zip (Chrome Web Store upload).
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { build } from "esbuild";
import { zipSync } from "fflate";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "build");
const dist = join(root, "dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "icons"), { recursive: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: { content: join(root, "src/content.ts"), popup: join(root, "src/popup.ts") },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome110",
  loader: { ".png": "dataurl" },
  minify: false, // readable code helps Chrome Web Store review
  legalComments: "none",
  logLevel: "warning",
});

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
if (manifest.version !== pkg.version) throw new Error(`manifest.json version ${manifest.version} != package.json ${pkg.version}`);
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
cpSync(join(root, "src/popup.html"), join(out, "popup.html"));
cpSync(join(root, "src/popup.css"), join(out, "popup.css"));
for (const s of [16, 32, 48, 128]) cpSync(join(root, `icons/icon-${s}.png`), join(out, `icons/icon-${s}.png`));

// Guard the "no remote code" promise: no http(s) script loads, eval or Function in the bundle.
for (const f of ["content.js", "popup.js"]) {
  const js = readFileSync(join(out, f), "utf8");
  if (/\beval\(|new Function\(|importScripts\(|<script[^>]+src=["']https?:/i.test(js)) throw new Error(`${f}: remote/dynamic code found`);
}

const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(out, p)] = [readFileSync(p), { mtime: new Date("2026-01-01T00:00:00Z") }];
  }
};
walk(out);
const zipPath = join(dist, "komendly-extension.zip");
writeFileSync(zipPath, zipSync(files, { level: 9 }));
console.log(`built ${Object.keys(files).length} files -> ${relative(root, zipPath)} (${statSync(zipPath).size} bytes)`);
