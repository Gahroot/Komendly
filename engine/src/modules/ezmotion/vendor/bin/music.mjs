#!/usr/bin/env node
// Licensed music library (CC-BY / CC0 tracks, see tracks.json for each credit). No deps.
//   node kit/bin/music.mjs search <words> [--seconds N] [--energy N]   -> best 5 as JSON lines
//   node kit/bin/music.mjs use <id> <folder>                            -> copies to <folder>/audio/, prints file, bpm, hits, credit
// Finds the library at ../music (installed kit: kit/music) or ../music relative to vendor/bin.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export function libraryDir() {
  for (const d of [join(here, "..", "music"), join(here, "..", "..", "music")]) if (existsSync(join(d, "tracks.json"))) return d;
  throw new Error("music library not found (expected ../music/tracks.json next to this script)");
}
export function loadTracks(dir = libraryDir()) {
  return JSON.parse(readFileSync(join(dir, "tracks.json"), "utf8")).tracks;
}

const SYN = { coffee: "cafe", café: "cafe", bakery: "cafe", restaurant: "food", pizza: "food", gym: "fitness", workout: "fitness", app: "saas", software: "saas", startup: "saas", tech: "saas", property: "real estate", listing: "real estate", home: "real estate", luxury: "premium", discount: "sale", deal: "sale", "black": "sale", promo: "sale", lofi: "lofi", "lo-fi": "lofi", hype: "punchy", energetic: "upbeat", happy: "upbeat", fun: "playful", calm: "chill", relaxed: "chill", epic: "cinematic", plumber: "local service", plumbing: "local service", cleaning: "local service", salon: "beauty", spa: "wellness" };

/** Pure: score tracks for the words (+ optional length/energy wishes); highest first, ties by id. */
export function rank(tracks, words, o = {}) {
  const ws = words.map((w) => w.toLowerCase()).flatMap((w) => (SYN[w] ? [w, SYN[w]] : [w]));
  const scored = tracks.map((t) => {
    const tags = [...t.moods, ...t.goodFor].map((x) => x.toLowerCase());
    const hay = `${t.title} ${tags.join(" ")}`.toLowerCase();
    let s = 0;
    for (const w of ws) {
      if (tags.includes(w)) s += 3;
      else if (tags.some((x) => x.split(" ").includes(w))) s += 2;
      else if (w.length > 2 && hay.includes(w)) s += 1;
    }
    if (o.energy) s -= Math.abs(t.energy - o.energy) * 1.5;
    if (o.seconds && t.seconds < o.seconds) s -= 2;
    return { t, s };
  });
  return scored.sort((a, b) => b.s - a.s || (a.t.id < b.t.id ? -1 : 1)).map(({ t, s }) => ({ ...t, score: s }));
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "search") {
    const o = {}, words = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--seconds") o.seconds = Number(rest[++i]);
      else if (rest[i] === "--energy") o.energy = Number(rest[++i]);
      else words.push(...rest[i].split(/[\s,]+/).filter(Boolean));
    }
    for (const t of rank(loadTracks(), words, o).slice(0, 5)) console.log(JSON.stringify({ id: t.id, title: t.title, artist: t.artist, seconds: t.seconds, bpm: t.bpm, energy: t.energy, moods: t.moods, goodFor: t.goodFor, score: t.score }));
    return 0;
  }
  if (cmd === "use" && rest[0] && rest[1]) {
    const dir = libraryDir();
    const t = loadTracks(dir).find((x) => x.id === rest[0]);
    if (!t) { console.error(`unknown track: ${rest[0]} (try: node kit/bin/music.mjs search <words>)`); return 1; }
    const outDir = join(resolve(rest[1]), "audio");
    mkdirSync(outDir, { recursive: true });
    copyFileSync(join(dir, t.file), join(outDir, t.file));
    console.log(JSON.stringify({ file: `audio/${t.file}`, seconds: t.seconds, bpm: t.bpm, hits: t.hits, credit: t.credit, licence: t.licence }));
    if (t.credit) console.log(`Credit required (put it in the caption/description): ${t.credit}`);
    return 0;
  }
  console.error("usage: music.mjs search <words> [--seconds N] [--energy N] | music.mjs use <id> <folder>");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
