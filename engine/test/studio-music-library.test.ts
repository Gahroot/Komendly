import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type LibraryTrack, MUSIC_DIR, pickLibraryTrack } from "../src/studio/music-fallback";

const BIN = join(MUSIC_DIR, "..", "bin", "music.mjs");
const tracks = (JSON.parse(readFileSync(join(MUSIC_DIR, "tracks.json"), "utf8")) as { tracks: LibraryTrack[] }).tracks;
const ALLOWED = new Set(["CC0", "CC-BY-3.0", "CC-BY-4.0", "Pixabay", "Mixkit"]);
const search = (...a: string[]) => execFileSync("node", [BIN, "search", ...a], { encoding: "utf8" }).trim().split("\n").map((l) => JSON.parse(l) as LibraryTrack & { score: number });

describe("music library manifest", () => {
  it("has 40-60 tracks, all files present, <=90 s, under 100 MB", () => {
    expect(tracks.length).toBeGreaterThanOrEqual(40);
    expect(tracks.length).toBeLessThanOrEqual(60);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(tracks.length);
    let bytes = 0;
    for (const t of tracks) {
      expect(existsSync(join(MUSIC_DIR, t.file)), t.file).toBe(true);
      bytes += statSync(join(MUSIC_DIR, t.file)).size;
      expect(t.seconds).toBeLessThanOrEqual(90.5);
      expect(t.energy).toBeGreaterThanOrEqual(1);
      expect(t.energy).toBeLessThanOrEqual(5);
    }
    expect(bytes).toBeLessThan(100 * 1024 * 1024);
  });
  it("only allowed licences; CC-BY tracks carry a credit", () => {
    for (const t of tracks) {
      expect(ALLOWED.has(t.licence), `${t.id}: ${t.licence}`).toBe(true);
      if (t.licence.startsWith("CC-BY")) expect(t.credit, t.id).toMatch(/\S/);
    }
  });
});

describe("music.mjs", () => {
  it("search ranks matching tags first and respects energy", () => {
    const cafe = search("cozy", "cafe", "chill");
    expect(cafe).toHaveLength(5);
    expect(cafe[0]?.goodFor).toContain("cafe");
    const hype = search("gym", "hype", "--energy", "5");
    expect(hype[0]?.energy).toBeGreaterThanOrEqual(4);
    expect(hype[0]?.score).toBeGreaterThanOrEqual(hype[4]?.score ?? 0);
  });
  it("use copies the track into <folder>/audio and prints credit", () => {
    const dir = mkdtempSync(join(tmpdir(), "music-use-"));
    const t = tracks[0] as LibraryTrack;
    const out = execFileSync("node", [BIN, "use", t.id, dir], { encoding: "utf8" });
    const info = JSON.parse(out.split("\n")[0] ?? "{}") as { file: string; bpm: number; credit: string };
    expect(existsSync(join(dir, info.file))).toBe(true);
    expect(info.bpm).toBe(t.bpm);
    expect(info.credit).toBe(t.credit);
  });
});

describe("fallback library pick", () => {
  it("picks a fitting library track, varies by salt, null when nothing fits", () => {
    const a = pickLibraryTrack(tracks, "cozy coffee shop promo", 15, "s1");
    expect(a?.goodFor).toContain("cafe");
    const picks = new Set(["a", "b", "c", "d", "e", "f"].map((s) => pickLibraryTrack(tracks, "cozy coffee shop promo", 15, s)?.id));
    expect(picks.size).toBeGreaterThan(1);
    expect(pickLibraryTrack(tracks, "quarterly zxqv", 15, "s")).toBeNull();
    expect(pickLibraryTrack(tracks, "gym sale", 600, "s")).toBeNull();
  });
});

import { creditsFor, withMusicCredit } from "../src/studio/music-fallback";
describe("music credits", () => {
  const t = { id: "a", title: "A", artist: "K", file: "k-a.mp3", seconds: 90, bpm: 96, moods: [], energy: 3, goodFor: [], hits: [], licence: "CC-BY-4.0", credit: "\"A\" K (x) CC BY 4.0" };
  it("credits only tracks the composition uses, once", () => {
    expect(creditsFor([t], '<audio src="audio/k-a.mp3">')).toEqual([t.credit]);
    expect(creditsFor([t], "<audio src=\"audio/score.wav\">")).toEqual([]);
    expect(withMusicCredit("Ready.", [t.credit, t.credit])).toBe(`Ready.\n\nMusic: ${t.credit}`);
    expect(withMusicCredit(`Ready.\n\nMusic: ${t.credit}`, [t.credit])).toBe(`Ready.\n\nMusic: ${t.credit}`);
  });
});
