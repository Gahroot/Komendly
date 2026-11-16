#!/usr/bin/env node
// Motion technique library: render-verified looks (art directions) and pieces
// (seek-safe techniques that read only the look's tokens), each with a preview.
// Adapted for Ozzy Studio projects; run from the project root:
//
//   node kit/bin/library.mjs list [looks|pieces] [--kind <kind>]
//   node kit/bin/library.mjs search <words...>
//   node kit/bin/library.mjs show <id>
//   node kit/bin/library.mjs look . brand          (the customer's brand: ./brand/look.css)
//   node kit/bin/library.mjs look . <look-id>
//   node kit/bin/library.mjs add . <piece-id> [<piece-id> ...] [--force]
//   node kit/bin/library.mjs kit .
//
// `look` writes ./assets/looks/<id>.css (tokens as CSS variables) and installs
// its fonts into ./assets/fonts. `add` copies pieces into ./compositions/<id>.html
// and records third-party credits in CREDITS.md. `kit` installs the move kit as
// ./assets/kit/moves.js. Every command prints one JSON line; paths are relative
// to the current folder.
import { appendFile, copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = dirname(fileURLToPath(import.meta.url));
const KIT = join(BIN, "..");
const LIBRARY = join(KIT, "library");
const FONTS = join(KIT, "fonts");

function done(result, code = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(code);
}
const fail = (error) => done({ ok: false, error }, 1);
const rel = (p) => relative(process.cwd(), p).split("\\").join("/") || ".";

/** @returns {Promise<{looks: any[], pieces: any[], kinds: string[]}>} */
async function index() {
  return JSON.parse(await readFile(join(LIBRARY, "library.json"), "utf8"));
}

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function projectDir(arg) {
  if (!arg) fail("Missing project folder (use . from the project root)");
  const dir = resolve(arg);
  const info = await stat(dir).catch(() => undefined);
  if (!info?.isDirectory()) fail(`Project folder not found: ${dir}`);
  return dir;
}

/** Copies bundled OFL families into <project>/assets/fonts/<dir>/; returns a page-ready <style>. */
async function installFonts(project, families) {
  if (families.length === 0) return { installed: [], head: [] };
  const manifest = JSON.parse(await readFile(join(FONTS, "fonts.json"), "utf8"));
  const installed = [];
  const rules = [];
  for (const family of [...new Set(families)].sort()) {
    const entry = manifest.find((f) => f.family.toLowerCase() === family.toLowerCase());
    if (!entry) continue; // not bundled: the stack's fallback font takes over
    const dest = join(project, "assets", "fonts", entry.dir);
    await mkdir(dest, { recursive: true });
    for (const file of entry.files) {
      await copyFile(join(FONTS, entry.dir, file.file), join(dest, file.file));
      rules.push(
        `@font-face { font-family: "${entry.family}"; src: url("assets/fonts/${entry.dir}/${file.file}") format("woff2"); font-style: ${file.style}; font-weight: ${file.weight};${file.stretch ? ` font-stretch: ${file.stretch};` : ""} font-display: block; }`,
      );
    }
    await copyFile(join(FONTS, entry.dir, "OFL.txt"), join(dest, "OFL.txt")).catch(() => {});
    installed.push(entry.family);
  }
  // Inline, not a linked fonts.css: the checker only sees @font-face written in the page.
  return { installed, head: rules.length ? [`<style>\n${rules.join("\n")}\n</style>`] : [] };
}

const KIT_HEAD = '<script src="assets/kit/moves.js"></script>';

async function installKit(project) {
  await mkdir(join(project, "assets", "kit"), { recursive: true });
  await copyFile(join(LIBRARY, "kit", "moves.js"), join(project, "assets", "kit", "moves.js"));
  return KIT_HEAD;
}

const summary = (entry, type) => ({
  id: entry.id,
  type,
  name: entry.name,
  ...(type === "piece" ? { kind: entry.kind, duration: entry.duration } : {}),
  description: entry.description,
  tags: entry.tags,
  preview: rel(join(LIBRARY, type === "look" ? "looks" : "pieces", entry.id, "preview.jpg")),
});

const [command, ...rest] = process.argv.slice(2);
const lib = await index().catch(() => fail(`Library missing at ${rel(LIBRARY)}`));

if (command === "list") {
  const which = rest[0] === "looks" || rest[0] === "pieces" ? rest[0] : undefined;
  const kindIndex = rest.indexOf("--kind");
  const kind = kindIndex >= 0 ? rest[kindIndex + 1] : undefined;
  if (kind && !lib.kinds.includes(kind)) fail(`Unknown kind "${kind}". Kinds: ${lib.kinds.join(", ")}`);
  const looks = which === "pieces" || kind ? [] : lib.looks.map((l) => summary(l, "look"));
  const pieces = which === "looks" ? [] : lib.pieces.filter((p) => !kind || p.kind === kind).map((p) => summary(p, "piece"));
  // Contact sheets show many previews in one image read.
  const sheets = {};
  if (looks.length > 0) sheets.looks = rel(join(LIBRARY, "sheets", "looks.jpg"));
  for (const k of new Set(pieces.map((p) => p.kind))) sheets[k] = rel(join(LIBRARY, "sheets", `${k}.jpg`));
  done({ ok: true, kinds: lib.kinds, sheets, looks, pieces });
}

if (command === "search") {
  const words = rest.join(" ").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) fail("usage: library.mjs search <words...>");
  const score = (entry) => {
    const hay = [entry.id, entry.name, entry.kind ?? "", entry.description, ...(entry.tags ?? [])].join(" ").toLowerCase();
    return words.reduce((sum, w) => sum + (hay.includes(w) ? 1 : 0), 0);
  };
  const results = [
    ...lib.looks.map((l) => ({ ...summary(l, "look"), score: score(l) })),
    ...lib.pieces.map((p) => ({ ...summary(p, "piece"), score: score(p) })),
  ]
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 15);
  done({ ok: true, results });
}

if (command === "show") {
  const id = rest[0];
  const look = lib.looks.find((l) => l.id === id);
  const piece = lib.pieces.find((p) => p.id === id);
  if (!look && !piece) fail(`No look or piece named "${id}"`);
  const dir = join(LIBRARY, look ? "looks" : "pieces", id ?? "");
  done({
    ok: true,
    type: look ? "look" : "piece",
    ...(look ?? piece),
    preview: rel(join(dir, "preview.jpg")),
    files: look
      ? { spec: rel(join(dir, "look.md")), tokens: rel(join(dir, "tokens.css")), sample: rel(join(dir, "sample.html")) }
      : { source: rel(join(dir, "piece.html")) },
  });
}

if (command === "look") {
  const project = await projectDir(rest[0]);
  const id = rest[1];
  let tokens;
  let fonts;
  let spec;
  if (id === "brand") {
    tokens = join(project, "brand", "look.css");
    if (!(await exists(tokens))) fail("No brand look in this project (./brand/look.css). Pick a library look or write tokens yourself.");
    fonts = JSON.parse(await readFile(join(project, "brand", "look.json"), "utf8").catch(() => "{}")).fonts ?? [];
  } else {
    const look = lib.looks.find((l) => l.id === id);
    if (!look) fail(`Unknown look "${id}". Looks: brand, ${lib.looks.map((l) => l.id).join(", ")}`);
    tokens = join(LIBRARY, "looks", look.id, "tokens.css");
    fonts = look.fonts;
    spec = rel(join(LIBRARY, "looks", look.id, "look.md"));
  }
  await mkdir(join(project, "assets", "looks"), { recursive: true });
  const css = join(project, "assets", "looks", `${id}.css`);
  await copyFile(tokens, css);
  const f = await installFonts(project, fonts);
  done({
    ok: true,
    look: id,
    tokens: rel(css),
    fonts: f.installed,
    head: [...f.head, `<link rel="stylesheet" href="assets/looks/${id}.css" />`],
    use: "Paste head into the composition <head>, replacing any earlier fonts block.",
    root: `add class="look-${id}" to the root composition element`,
    ...(spec ? { spec } : {}),
  });
}

if (command === "kit") {
  const project = await projectDir(rest[0]);
  const kit = await installKit(project);
  done({
    ok: true,
    installed: rel(join(project, "assets", "kit", "moves.js")),
    kit,
    use: "Put kit in the root index.html <head> after GSAP; scripts then use window.MotionKit.",
    reference: rel(join(LIBRARY, "build-sheet.md")),
  });
}

if (command === "add") {
  const force = rest.includes("--force");
  const [projectArg, ...ids] = rest.filter((a) => a !== "--force");
  const project = await projectDir(projectArg);
  if (ids.length === 0) fail("usage: library.mjs add . <piece-id> [...] [--force]");
  const pieces = ids.map((id) => {
    const piece = lib.pieces.find((p) => p.id === id);
    if (!piece) fail(`Unknown piece "${id}". Try: node kit/bin/library.mjs search <words>`);
    return piece;
  });
  await mkdir(join(project, "compositions"), { recursive: true });
  const added = [];
  const kept = [];
  for (const piece of pieces) {
    const target = join(project, "compositions", `${piece.id}.html`);
    // Never clobber a piece already restyled for this video.
    if (!force && (await exists(target))) {
      kept.push(piece.id);
      continue;
    }
    await copyFile(join(LIBRARY, "pieces", piece.id, "piece.html"), target);
    added.push(piece.id);
    // MIT requires the upstream notice to travel with the code.
    if (piece.license === "MIT") {
      await mkdir(join(project, "compositions", "licenses"), { recursive: true });
      await copyFile(join(LIBRARY, "pieces", piece.id, "LICENSE"), join(project, "compositions", "licenses", `${piece.id}.txt`));
    }
    if (piece.source) {
      await appendFile(join(project, "CREDITS.md"), `- ${piece.name}: adapted from ${piece.source.url} by ${piece.source.author} (${piece.license})\n`);
    }
  }
  const fonts = await installFonts(project, [...new Set(pieces.flatMap((p) => p.fonts))]);
  const kit = pieces.some((p) => (p.requires ?? []).includes("kit")) ? await installKit(project) : undefined;
  done({
    ok: true,
    added,
    kept,
    fonts: fonts.installed,
    ...(fonts.head.length ? { fontsHead: fonts.head } : {}),
    ...(kit ? { kit, kitNote: "put kit in index.html <head> after GSAP" } : {}),
    mount: pieces.map(
      (p) =>
        `<div id="${p.id}-clip" data-composition-id="${p.id}" data-composition-src="compositions/${p.id}.html" data-start="0" data-duration="${p.duration}" data-width="1920" data-height="1080" data-track-index="0"></div>`,
    ),
    note: "Pieces are 1920x1080; set data-width/data-height (and the piece's own root) to the video size. They read the root's look tokens.",
  });
}

fail("usage: library.mjs list [looks|pieces] [--kind k] | search <words> | show <id> | look . <brand|look-id> | add . <piece-id>... [--force] | kit .");
