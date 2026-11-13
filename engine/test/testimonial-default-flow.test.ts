// Default (bake-off) pipeline end to end with mocked FAL HTTP: ElevenLabs v3 TTS once ->
// OmniHuman v2 once (single take) -> iPhone finish -> upload; H3 Max fallback; cost.
import { describe, expect, it } from "vitest";
import { createAdapters } from "../src/testimonial/adapters";
import { runTestimonial } from "../src/testimonial/job";
import type { MediaOps } from "../src/testimonial/media";
import { DEFAULT_PIPELINE as BASE } from "../src/testimonial/models";
// Audio-driven pipeline (TTS + avatar), kept as a config option behind native_fal.
const DEFAULT_PIPELINE = { ...BASE, mode: "audio_driven" as const };
import type { FinishOptions } from "../src/testimonial/ffmpeg";
import { memStore, world } from "./helpers/testimonial-mem";
import { mkdtempSync as __mkdtemp } from "node:fs";
import { tmpdir as __tmpdir } from "node:os";
import { join as __join } from "node:path";
// Own scratch dir per test file: parallel files shared /tmp/testimonial-<id> and deleted each other's work.
const SCRATCH = __mkdtemp(__join(__tmpdir(), "kmd-testimonial-"));

const env = { FAL_API_KEY: "fk" } as NodeJS.ProcessEnv;
const TTS = "fal-ai/elevenlabs/tts/eleven-v3";
const OMNI = "bytedance/omnihuman/v2";
const H3 = "minimax/h3-max/lip-sync/image-to-video";

function falMock(o: { omniFails?: boolean; videoSeconds: number }) {
  const submits: Array<{ endpoint: string; body: Record<string, unknown> }> = [];
  const results: Record<string, unknown> = {
    [TTS]: { audio: { url: "https://fal.media/voice.mp3" }, timestamps: [] },
    [OMNI]: { video: { url: "https://fal.media/omni.mp4" }, duration: o.videoSeconds },
    [H3]: { video: { url: "https://fal.media/h3.mp4" }, seed: 7, duration: o.videoSeconds },
  };
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (init?.method === "POST") {
      const endpoint = url.replace("https://queue.fal.run/", "");
      submits.push({ endpoint, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return ok({ request_id: endpoint.replaceAll("/", "_"), status_url: `https://q/${endpoint}/status`, response_url: `https://q/${endpoint}/result` });
    }
    const m = /^https:\/\/q\/(.+)\/(status|result)$/.exec(url);
    if (!m?.[1]) return new Response("nf", { status: 404 });
    if (m[2] === "status") return ok({ status: m[1] === OMNI && o.omniFails ? "FAILED" : "COMPLETED", error: "capacity" });
    return ok(results[m[1]]);
  }) as typeof fetch;
  return { impl, submits };
}

function media(voiceSeconds: number, videoSeconds: number) {
  const calls = { finish: [] as FinishOptions[], uploads: [] as string[], slices: 0, downloads: [] as string[] };
  const m: MediaOps = {
    async download(url) {
      calls.downloads.push(url);
    },
    async upload(file) {
      calls.uploads.push(file);
      return `https://fal.media/up/${calls.uploads.length}`;
    },
    async probe(file) {
      if (file.endsWith("voice-full")) return voiceSeconds;
      return videoSeconds;
    },
    async silences() {
      return [];
    },
    async speechEnd() {
      return 0;
    },
    async slice() {
      calls.slices++;
    },
    async concat() {},
    async pad() {},
    async finish(o) {
      calls.finish.push(o);
    },
  };
  return { m, calls };
}

async function run(o: { omniFails?: boolean }) {
  const w = world(1);
  const http = falMock({ omniFails: o.omniFails, videoSeconds: 24 });
  const md = media(24, 24);
  const usage: Array<{ costMicros: number; latencyMs: number }> = [];
  const res = await runTestimonial(
    { store: memStore(w), adapters: createAdapters(DEFAULT_PIPELINE, { fetchImpl: http.impl, sleepImpl: async () => {}, env }), media: md.m, provider: null, config: DEFAULT_PIPELINE, scratchDir: SCRATCH, usage },
    { compositeVideoId: "v1", useAIScript: true },
  );
  return { w, http, md, res, usage };
}

describe("default pipeline (mocked FAL)", () => {
  it("TTS once with the actor's preset voice -> OmniHuman once on the full audio -> finish -> upload", async () => {
    const { w, http, md, res } = await run({});
    expect(http.submits.map((s) => s.endpoint)).toEqual([TTS, OMNI]);
    const tts = http.submits[0]?.body ?? {};
    expect(tts.voice).toBe("voice-ana");
    expect(tts.stability).toBe(0.45); // world's actor has no stability -> config default
    expect(String(tts.text)).toContain("[pause]"); // v3 audio tags go to TTS...
    expect(w.video.fullScript).not.toContain("["); // ...but not into the stored display script
    expect(String(tts.text)).toContain(w.video.reviewText);
    expect(http.submits[1]?.body).toMatchObject({ image_url: "https://img/a1.png", audio_url: "https://fal.media/voice.mp3" });
    expect(String(http.submits[1]?.body.prompt)).toMatch(/Handheld iPhone/);
    expect(w.clips).toHaveLength(1);
    expect(w.clips[0]).toMatchObject({ startMs: 0, endMs: 24_000, status: "completed", videoUrl: "https://fal.media/omni.mp4" });
    expect(md.calls.slices).toBe(0);
    expect(md.calls.finish).toHaveLength(1);
    expect(md.calls.finish[0]?.inputs).toHaveLength(1);
    expect(md.calls.finish[0]).toMatchObject({ shakePx: DEFAULT_PIPELINE.finish.shakePx, grain: DEFAULT_PIPELINE.finish.grain });
    expect(md.calls.uploads.at(-1)).toMatch(/final\.mp4$/);
    expect(res.finalVideoUrl).toBe("https://fal.media/up/1");
    expect(w.video.status).toBe("completed");
    expect(w.video.pipelineState.clipModels).toEqual({ "0": OMNI });
  });

  it("records real costs: ElevenLabs $0.10/1k chars + OmniHuman $0.105/s", async () => {
    const { w, http, usage } = await run({});
    const chars = String(http.submits[0]?.body.text).length;
    const expected = Math.round(100 * chars) + 24 * 105_000;
    expect(w.video.costMicros).toBe(expected);
    expect(usage.reduce((a, u) => a + u.costMicros, 0)).toBe(expected);
  });

  it("falls back to H3 Max once when OmniHuman fails, priced at $0.08/s x1.2 over 15 s", async () => {
    const { w, http } = await run({ omniFails: true });
    expect(http.submits.map((s) => s.endpoint)).toEqual([TTS, OMNI, H3]);
    expect(http.submits[2]?.body).toMatchObject({ image_url: "https://img/a1.png", audio_url: "https://fal.media/voice.mp3", resolution: "768P", enable_transcription: true });
    expect(typeof http.submits[2]?.body.seed).toBe("number");
    expect(w.clips[0]?.videoUrl).toBe("https://fal.media/h3.mp4");
    expect(w.video.pipelineState.clipModels).toEqual({ "0": H3 });
    const chars = String(http.submits[0]?.body.text).length;
    // the failed OmniHuman call is billed too
    expect(w.video.costMicros).toBe(Math.round(100 * chars) + 24 * 105_000 + Math.round(24 * 80_000 * 1.2));
  });

  it("long audio (> single-take limit) is chunked at pauses", async () => {
    const w = world(5);
    const http = falMock({ videoSeconds: 100 });
    const md = media(300, 100);
    await runTestimonial(
      { store: memStore(w), adapters: createAdapters(DEFAULT_PIPELINE, { fetchImpl: http.impl, sleepImpl: async () => {}, env }), media: md.m, provider: null, config: DEFAULT_PIPELINE, scratchDir: SCRATCH, usage: [] },
      { compositeVideoId: "v1", useAIScript: false },
    );
    expect(http.submits.filter((s) => s.endpoint === TTS)).toHaveLength(1);
    expect(w.clips.length).toBe(3);
    expect(w.clips.every((c) => (c.endMs ?? 0) - (c.startMs ?? 0) <= 120_000)).toBe(true);
    expect(md.calls.finish[0]?.inputs).toHaveLength(3);
  });
});
