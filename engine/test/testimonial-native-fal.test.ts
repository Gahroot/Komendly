// Default pipeline (Happy Horse native voice) end to end with mocked FAL HTTP: every take of one
// video uses the same seed + the same voice description; takes are sized to the words and trimmed
// after the last word before stitching.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
const scratch = () => mkdtempSync(path.join(tmpdir(), "hh-"));
import { buildNativeTakePrompt, createAdapters, takeSeconds } from "../src/testimonial/adapters";
import { speechEndFromSilenceDetect } from "../src/testimonial/chunking";
import { runTestimonial } from "../src/testimonial/job";
import type { MediaOps } from "../src/testimonial/media";
import { DEFAULT_PIPELINE as BASE } from "../src/testimonial/models";

// Happy Horse (native_fal) is a selectable alternative to the native_voice default.
const DEFAULT_PIPELINE = { ...BASE, mode: "native_fal" as const };
import type { FinishOptions } from "../src/testimonial/ffmpeg";
import { memStore, world } from "./helpers/testimonial-mem";

const env = { FAL_API_KEY: "fk" } as NodeJS.ProcessEnv;
const HH = "alibaba/happy-horse/v1.1/image-to-video";

function falMock(o: { failFirst?: boolean } = {}) {
  const submits: Array<Record<string, unknown>> = [];
  let failed = false;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (init?.method === "POST") {
      submits.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      const n = submits.length;
      return ok({ request_id: `r${n}`, status_url: `https://q/${n}/status`, response_url: `https://q/${n}/result` });
    }
    const m = /^https:\/\/q\/(\d+)\/(status|result)$/.exec(url);
    if (!m) return new Response("nf", { status: 404 });
    if (m[2] === "status") {
      if (o.failFirst && !failed) {
        failed = true;
        return ok({ status: "FAILED", error: "busy" });
      }
      return ok({ status: "COMPLETED" });
    }
    return ok({ video: { url: `https://fal.media/take${m[1]}.mp4` }, seed: 1 });
  }) as typeof fetch;
  return { impl, submits };
}

function media() {
  const calls = { finish: [] as FinishOptions[] };
  const m: MediaOps = {
    async download() {},
    async upload() {
      return "https://fal.media/final.mp4";
    },
    async probe(file) {
      return file.endsWith("final.mp4") ? 27 : 15;
    },
    async silences() {
      return [];
    },
    async speechEnd() {
      return 12.4;
    },
    async slice() {},
    async concat() {},
    async pad() {},
    async finish(o) {
      calls.finish.push(o);
    },
  };
  return { m, calls };
}

describe("native_fal (Happy Horse) pipeline", () => {
  it("is the default", () => {
    expect(DEFAULT_PIPELINE.nativeFal.endpointId).toBe(HH);
  });

  it("same seed + same voice block for every take of one video; takes trimmed after the last word", async () => {
    const w = world(1);
    const http = falMock();
    const md = media();
    const usage: Array<{ costMicros: number; latencyMs: number }> = [];
    const res = await runTestimonial(
      { store: memStore(w), adapters: createAdapters(DEFAULT_PIPELINE, { fetchImpl: http.impl, sleepImpl: async () => {}, env }), media: md.m, provider: null, config: DEFAULT_PIPELINE, scratchDir: scratch(), usage },
      { compositeVideoId: "v1", useAIScript: true },
    );
    expect(res.status).toBe("completed");
    expect(http.submits.length).toBe(w.clips.length);
    expect(http.submits.length).toBeGreaterThan(1);
    const seeds = new Set(http.submits.map((s) => s.seed));
    expect(seeds.size).toBe(1);
    for (const s of http.submits) {
      expect(s).toMatchObject({ image_url: "https://img/a1.png", resolution: "720p" });
      expect(String(s.prompt)).toContain("Warm alto, light Texan accent");
      expect(String(s.prompt)).not.toContain("[");
      expect(Number(s.duration)).toBeGreaterThanOrEqual(3);
      expect(Number(s.duration)).toBeLessThanOrEqual(15);
    }
    const f = md.calls.finish[0];
    expect(f?.inputs.every((i) => Math.abs(i.duration - (12.4 + DEFAULT_PIPELINE.nativeFal.tailSeconds)) < 1e-9)).toBe(true);
    expect(w.video.status).toBe("completed");
    expect(w.video.costMicros).toBe(http.submits.reduce((a, s) => a + Number(s.duration) * 140_000, 0));
  });

  it("a different video gets a different seed", async () => {
    const seedFor = async (id: string) => {
      const w = world(1);
      w.video.id = id;
      const http = falMock();
      await runTestimonial(
        { store: memStore(w), adapters: createAdapters(DEFAULT_PIPELINE, { fetchImpl: http.impl, sleepImpl: async () => {}, env }), media: media().m, provider: null, config: DEFAULT_PIPELINE, scratchDir: scratch(), usage: [] },
        { compositeVideoId: id, useAIScript: true },
      );
      return http.submits[0]?.seed;
    };
    expect(await seedFor("v1")).not.toBe(await seedFor("v2"));
  });

  it("a failed take is counted as spent and rethrown (runner retries)", async () => {
    const w = world(1);
    const http = falMock({ failFirst: true });
    const usage: Array<{ costMicros: number; latencyMs: number }> = [];
    await expect(
      runTestimonial(
        { store: memStore(w), adapters: createAdapters(DEFAULT_PIPELINE, { fetchImpl: http.impl, sleepImpl: async () => {}, env }), media: media().m, provider: null, config: DEFAULT_PIPELINE, scratchDir: scratch(), usage },
        { compositeVideoId: "v1", useAIScript: true },
      ),
    ).rejects.toThrow(/busy/);
    expect(usage.reduce((a, u) => a + u.costMicros, 0)).toBeGreaterThan(0);
    expect(w.video.pipelineState.pendingFal ?? {}).toEqual({});
  });

  it("take length follows the words, within 3-15 s", () => {
    const cfg = DEFAULT_PIPELINE.nativeFal;
    expect(takeSeconds("hi there", cfg)).toBe(3);
    expect(takeSeconds(Array(23).fill("word").join(" "), cfg)).toBe(11);
    expect(takeSeconds(Array(80).fill("word").join(" "), cfg)).toBe(15);
  });

  it("prompt never describes appearance beyond 'same as the image' and escapes quotes", () => {
    const p = buildNativeTakePrompt('He said "wow"', "a voice", "female", "upbeat");
    expect(p).toContain("She says, in the voice of a voice: \"He said 'wow'\"");
    expect(p).toContain("Delivery: upbeat");
  });

  it("speech end = start of the trailing silence", () => {
    const st = "[silencedetect] silence_start: 2.1\n[silencedetect] silence_end: 2.6 | silence_duration: 0.5\n[silencedetect] silence_start: 12.43\n";
    expect(speechEndFromSilenceDetect(st, 15)).toBe(12.43);
    expect(speechEndFromSilenceDetect("[silencedetect] silence_start: 1\n[silencedetect] silence_end: 2\n", 15)).toBe(15);
    expect(speechEndFromSilenceDetect("[silencedetect] silence_start: 13\n[silencedetect] silence_end: 15\n", 15)).toBe(13);
  });
});
