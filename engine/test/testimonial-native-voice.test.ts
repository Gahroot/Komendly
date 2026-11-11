// native_voice (default): Kling v4 speaks each take in an accent-matched voice; the voice is cloned
// from the first good take and locked on the actor; HeyGen/Boreal fallbacks; FAL resume. Mocked HTTP.
import { describe, expect, it } from "vitest";
import { createAdapters } from "../src/testimonial/adapters";
import type { FinishOptions } from "../src/testimonial/ffmpeg";
import { runTestimonial, type TestimonialDeps } from "../src/testimonial/job";
import type { MediaOps } from "../src/testimonial/media";
import { DEFAULT_PIPELINE as BASE, type PipelineConfig } from "../src/testimonial/models";
// Kling-primary chain with the per-actor voice lock (Happy Horse is the production default; this
// config covers the Kling fallback path and the voice-clone lock).
const DEFAULT_PIPELINE: PipelineConfig = {
  ...BASE,
  nativeVoice: { ...BASE.nativeVoice, order: ["kling", "heygen", "boreal"], voiceClone: { ...BASE.nativeVoice.voiceClone, enabled: true } },
};
import { buildTakePrompt, planTakes, takeInput } from "../src/testimonial/native-voice";
import { memStore, world, type World } from "./helpers/testimonial-mem";

const env = { FAL_API_KEY: "fk" } as NodeJS.ProcessEnv;
const KLING = "kling/v4/reference-to-video";
const HEYGEN = "heygen/heygen-video/image-to-video";
const VOICE = "fal-ai/kling-video/create-voice";
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

function fal(o: { failing?: Set<string>; onPoll?: (ep: string) => void } = {}) {
  const submits: Array<{ ep: string; body: Record<string, unknown> }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      const ep = url.replace("https://queue.fal.run/", "");
      submits.push({ ep, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      const n = submits.length;
      return ok({ request_id: `r${n}`, status_url: `https://q/${n}/status?ep=${ep}`, response_url: `https://q/${n}/result?ep=${ep}` });
    }
    const m = /^https:\/\/q\/(\d+)\/(status|result)\?ep=(.+)$/.exec(url);
    if (!m?.[3]) return new Response("nf", { status: 404 });
    const ep = m[3];
    if (m[2] === "status") {
      o.onPoll?.(ep);
      init?.signal?.throwIfAborted();
      return ok({ status: o.failing?.has(ep) ? "FAILED" : "COMPLETED", error: "boom" });
    }
    return ok(ep === VOICE ? { voice_id: "kv_1" } : { video: { url: `https://v/${m[1]}.mp4` } });
  }) as typeof fetch;
  return { impl, submits, takes: () => submits.filter((s) => s.ep !== VOICE) };
}

function media() {
  const calls = { finish: [] as FinishOptions[], slices: [] as Array<[number, number]>, concats: 0, uploads: 0 };
  const m: MediaOps = {
    async download() {},
    async upload(file) {
      calls.uploads++;
      return `https://up/${calls.uploads}/${file.split("/").at(-1)}`;
    },
    async probe() {
      return 30;
    },
    async silences() {
      return [];
    },
    async speechEnd() {
      return 28.6;
    },
    async slice(_f, a, b) {
      calls.slices.push([a, b]);
    },
    async pad() {},
    async concat() {
      calls.concats++;
    },
    async finish(o) {
      calls.finish.push(o);
    },
  };
  return { m, calls };
}

const sentence = (i: number) => `Sentence number ${i} is about the great service we got there today.`; // 12 words
const script = (sentences: number) => Array.from({ length: sentences }, (_, i) => sentence(i + 1)).join(" ");

function deps(w: World, impl: typeof fetch, m: MediaOps, signal?: AbortSignal): TestimonialDeps {
  return { store: memStore(w), adapters: createAdapters(DEFAULT_PIPELINE, { fetchImpl: impl, sleepImpl: async () => {}, env }), media: m, provider: null, config: DEFAULT_PIPELINE, scratchDir: "/tmp", usage: [], signal };
}
function unlocked(w: World): World {
  w.video.actor = { ...w.video.actor, voiceProvider: "kling", voiceId: null, voicePrompt: "a 24-year-old Latina woman with a light Mexican-American accent; bubbly" };
  return w;
}

describe("native_voice prompt + planning", () => {
  it("exact Kling prompt: visual, accent voice line, audio; no appearance; @Element1 only when locked", () => {
    const r = { text: 'Best tacos, "really".', voicePrompt: "a 24-year-old Latina woman with a light Mexican-American accent; bubbly", gender: "female" };
    expect(buildTakePrompt("kling", r)).toBe(
      "@Image1 is the opening frame. Handheld iPhone front-camera selfie video. She holds the phone at arm's length with natural small hand shake, looks into the lens and talks to the camera like filming a quick review for friends; natural blinking, small head tilts, an occasional small casual hand gesture, genuine expressions. She says, in the voice of a 24-year-old Latina woman with a light Mexican-American accent; bubbly: \"Best tacos, 'really'.\" Real phone microphone audio with light room tone. No music, no narrator, no subtitles, no on-screen text.",
    );
    expect(buildTakePrompt("kling", { ...r, klingVoiceId: "kv" })).toContain("The person is @Element1");
    expect(buildTakePrompt("boreal", r)).toMatch(/^\[VISUAL\][\s\S]*\[SPEECH\]\nSpeaker: a 24-year-old Latina[\s\S]*\[SOUNDS\][\s\S]*\[TEXT\]\nNone\.$/);
    const m = DEFAULT_PIPELINE.nativeVoice.models;
    const base = { imageUrl: "https://img", durationSec: 12, ...r };
    expect(takeInput(m.kling!, { ...base, klingVoiceId: "kv" })).toMatchObject({ start_image_url: "https://img", duration: 12, resolution: "720p", aspect_ratio: "9:16", elements: [{ frontal_image_url: "https://img", reference_image_urls: ["https://img"], voice_id: "kv" }] });
    expect(takeInput(m.kling!, base)).not.toHaveProperty("elements");
    expect(takeInput(m.heygen!, base)).toMatchObject({ image_url: "https://img", duration: 12, resolution: "1080p", prompt_enhancement: "disabled" });
    expect(takeInput(m.boreal!, base)).toMatchObject({ image_url: "https://img", aspect_ratio: "9:16" });
  });
  it("planTakes balances at sentence boundaries: 144 words / 75 max -> 2 takes, not 3", () => {
    const takes = planTakes([{ text: script(12), direction: "d" }], 75);
    expect(takes.map((t) => t.text.split(" ").length)).toEqual([72, 72]);
    expect(takes).toHaveLength(2);
    expect(takes.every((t) => t.text.split(" ").length <= 75 && /\.$/.test(t.text))).toBe(true);
    expect(takes.map((t) => t.text).join(" ")).toBe(script(12));
    // balanced, not greedy: 156 words / 100 max -> 84 + 72 instead of 96 + 60
    expect(planTakes([{ text: script(13), direction: "d" }], 100).map((t) => t.text.split(" ").length)).toEqual([84, 72]);
  });
});

describe("native_voice job (mocked FAL)", () => {
  it("60 s: two Kling takes; voice cloned from take 1, locked on the actor, bound to @Element1 in take 2", async () => {
    const w = unlocked(world(1));
    const f = fal();
    const md = media();
    const d = deps(w, f.impl, md.m);
    await runTestimonial(d, { compositeVideoId: "v1", useAIScript: false, customScript: script(12) });
    expect(f.submits.map((s) => s.ep)).toEqual([KLING, VOICE, KLING]);
    const [t1, clone, t2] = f.submits;
    expect(t1?.body).not.toHaveProperty("elements");
    expect(String(t1?.body.prompt)).toContain("light Mexican-American accent");
    expect(clone?.body).toEqual({ voice_url: "https://up/1/voice-src.mp3" });
    expect(md.calls.slices).toEqual([[0, 28.6]]);
    expect(t2?.body.elements).toEqual([{ frontal_image_url: "https://img/a1.png", reference_image_urls: ["https://img/a1.png"], voice_id: "kv_1" }]);
    expect(String(t2?.body.prompt)).toContain("@Element1");
    expect(w.video.actor).toMatchObject({ voiceProvider: "kling", voiceId: "kv_1" });
    expect(w.clips).toHaveLength(2);
    const fin = md.calls.finish[0];
    expect(fin).toMatchObject({ crossfade: 0, roomTone: false, shakePx: 0, normalizeEach: true, lufs: -16 });
    expect(fin?.inputs.map((i) => Math.round(i.duration * 100) / 100)).toEqual([28.95, 28.95]); // speech end + tail
    const durs = [t1, t2].map((t) => Number(t?.body.duration));
    expect(durs.every((x) => x > 25 && x <= 30)).toBe(true);
    const expected = 7_000 + (durs[0]! + durs[1]!) * 157_000;
    expect(w.video.costMicros).toBe(expected);
    expect(d.usage.reduce((a, u) => a + u.costMicros, 0)).toBe(expected);
    expect(w.video.status).toBe("completed");
  });

  it("already-locked actor: no clone, every take uses the stored voice", async () => {
    const w = world(1);
    w.video.actor = { ...w.video.actor, voiceProvider: "kling", voiceId: "kv_old" };
    const f = fal();
    await runTestimonial(deps(w, f.impl, media().m), { compositeVideoId: "v1", useAIScript: false, customScript: script(5) });
    expect(f.submits.map((s) => s.ep)).toEqual([KLING]);
    expect(f.submits[0]?.body.elements).toEqual([{ frontal_image_url: "https://img/a1.png", reference_image_urls: ["https://img/a1.png"], voice_id: "kv_old" }]);
  });

  it("lock is conditional: a voice locked concurrently by another job wins", async () => {
    const w = unlocked(world(1));
    const d = deps(w, fal().impl, media().m);
    const store = d.store;
    d.store = { ...store, lockActorVoice: async () => "kv_winner" };
    const f = fal();
    d.adapters = createAdapters(DEFAULT_PIPELINE, { fetchImpl: f.impl, sleepImpl: async () => {}, env });
    await runTestimonial(d, { compositeVideoId: "v1", useAIScript: false, customScript: script(12) });
    expect(f.takes()[1]?.body.elements).toEqual([{ frontal_image_url: "https://img/a1.png", reference_image_urls: ["https://img/a1.png"], voice_id: "kv_winner" }]);
  });

  it("Kling fails twice -> HeyGen with <= 15 s sub-takes joined by hard cut; failed attempts are billed", async () => {
    const w = world(1);
    w.video.actor = { ...w.video.actor, voiceProvider: "kling", voiceId: "kv_old" };
    const f = fal({ failing: new Set([KLING]) });
    const md = media();
    await runTestimonial(deps(w, f.impl, md.m), { compositeVideoId: "v1", useAIScript: false, customScript: script(6) });
    expect(f.submits.map((s) => s.ep)).toEqual([KLING, KLING, HEYGEN, HEYGEN]);
    const k = Number(f.submits[0]?.body.duration);
    const h = f.submits.slice(2).map((s) => Number(s.body.duration));
    expect(h.every((x) => x >= 5 && x <= 15)).toBe(true);
    expect(md.calls.concats).toBe(1);
    expect(w.clips[0]?.videoUrl).toMatch(/clip-0-joined\.mp4$/);
    expect(w.video.pipelineState.clipModels).toEqual({ "0": HEYGEN });
    expect(w.video.costMicros).toBe(2 * k * 157_000 + (h[0]! + h[1]!) * 60_000);
  });

  it("engine killed mid-Kling request: the retry resumes the same request_id (no second submit)", async () => {
    const w = world(1);
    w.video.actor = { ...w.video.actor, voiceProvider: "kling", voiceId: "kv_old" };
    const kill = new AbortController();
    const f = fal({ onPoll: (ep) => ep === KLING && kill.abort() });
    const md = media();
    await expect(runTestimonial(deps(w, f.impl, md.m, kill.signal), { compositeVideoId: "v1", useAIScript: false, customScript: script(5) })).rejects.toThrow();
    expect(w.video.pipelineState.pendingFal?.["0"]).toMatchObject({ model: "kling", requestId: "r1" });
    const f2 = fal();
    const d2 = deps(w, f2.impl, md.m);
    await runTestimonial(d2, { compositeVideoId: "v1", useAIScript: false, customScript: script(5) });
    expect(f2.submits).toEqual([]); // polled the stored status/response URLs only
    expect(w.video.status).toBe("completed");
    expect(w.video.pipelineState.pendingFal).toEqual({});
  });
});

describe("accentFromVoicePrompt (actor picker label)", () => {
  it("derives the accent for every cast voicePrompt", async () => {
    const { accentFromVoicePrompt } = await import("../../src/lib/testimonial/contracts");
    const { readFileSync } = await import("node:fs");
    const cast = JSON.parse(readFileSync(new URL("../../scripts/testimonial-actors/cast.json", import.meta.url), "utf8")) as Array<{ voicePrompt: string }>;
    const got = cast.map((a) => accentFromVoicePrompt(a.voicePrompt));
    expect(got.every((x) => typeof x === "string" && x.length > 2 && !/accent|light|with/i.test(x))).toBe(true);
    expect(accentFromVoicePrompt("a 29-year-old Indian-American woman with a light, natural Indian accent; bright")).toBe("Indian");
    expect(accentFromVoicePrompt("a 34-year-old white American woman, general American accent; warm")).toBe("General American");
    expect(accentFromVoicePrompt("a 45-year-old woman with a light Mandarin Chinese accent in English; warm")).toBe("Mandarin Chinese");
    expect(accentFromVoicePrompt("Warm alto")).toBeNull();
  });
});

import { isInputError } from "../src/testimonial/job";
describe("isInputError", () => {
  it("detects FAL 4xx input rejections (no same-model retry)", () => {
    expect(isInputError(new Error("FAL result failed: 422 {detail}"))).toBe(true);
    expect(isInputError(new Error("FAL submit kling failed: 400 bad"))).toBe(true);
    expect(isInputError(new Error("FAL request failed: timeout"))).toBe(false);
    expect(isInputError(new Error("FAL result failed: 500 oops"))).toBe(false);
  });
});

describe("native_voice default (Happy Horse)", () => {
  it("every take of one video: Happy Horse, same seed, same voice block, sent in parallel", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const p = await import("node:path");
    const { world: mk, memStore: ms } = await import("./helpers/testimonial-mem");
    const { runTestimonial: run } = await import("../src/testimonial/job");
    const { createAdapters: ca } = await import("../src/testimonial/adapters");
    const w = mk(1);
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        const n = posts.length;
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return ok({ request_id: `r${n}`, status_url: `https://q/${n}/status`, response_url: `https://q/${n}/result` });
      }
      const m = /^https:\/\/q\/(\d+)\/(status|result)$/.exec(url);
      if (!m) return new Response("nf", { status: 404 });
      if (m[2] === "status") {
        await new Promise((r) => setTimeout(r, 5));
        return ok({ status: "COMPLETED" });
      }
      inFlight--;
      return ok({ video: { url: `https://fal.media/t${m[1]}.mp4` } });
    }) as typeof fetch;
    const media = {
      async download() {},
      async upload() {
        return "https://fal.media/final.mp4";
      },
      async probe(f: string) {
        return f.endsWith("final.mp4") ? 30 : 15;
      },
      async silences() {
        return [];
      },
      async speechEnd() {
        return 12;
      },
      async slice() {},
      async pad() {},
      async concat() {},
      async finish() {},
    };
    const cfg = BASE;
    const res = await run(
      { store: ms(w), adapters: ca(cfg, { fetchImpl: impl, sleepImpl: async () => {}, env: { FAL_API_KEY: "k" } as NodeJS.ProcessEnv }), media: media as never, provider: null, config: cfg, scratchDir: mkdtempSync(p.join(tmpdir(), "hh-")), usage: [] },
      { compositeVideoId: "v1", useAIScript: false, customScript: Array.from({ length: 8 }, (_, i) => `This is sentence number ${i} of a longer testimonial script.`).join(" ") },
    );
    expect(res.status).toBe("completed");
    expect(posts.length).toBeGreaterThan(1);
    expect(posts.every((x) => x.url.endsWith("alibaba/happy-horse/v1.1/image-to-video"))).toBe(true);
    expect(new Set(posts.map((x) => x.body.seed)).size).toBe(1);
    expect(posts.every((x) => String(x.body.prompt).includes("Warm alto, light Texan accent"))).toBe(true);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});
