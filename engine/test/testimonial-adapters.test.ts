import { describe, expect, it } from "vitest";
import { buildVeoPrompt, falAvatarAdapter, falTtsAdapter, kieVeoAdapter } from "../src/testimonial/adapters";
import { applyTemplate, falQueueRun, falUpload, getPath } from "../src/testimonial/fal-queue";
import { DEFAULT_PIPELINE, OMNIHUMAN_PROMPT, estimateMicros, loadPipelineConfig } from "../src/testimonial/models";

type Call = { url: string; method: string; body?: unknown; auth?: string };

function mockFetch(routes: Array<(c: Call) => unknown | undefined>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    const c: Call = { url: String(input), method: init?.method ?? "GET", auth: h.get("authorization") ?? undefined, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
    calls.push(c);
    for (const r of routes) {
      const out = r(c);
      if (out !== undefined) return new Response(JSON.stringify(out), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

const env = { FAL_API_KEY: "fk", KIE_API_KEY: "kk" } as NodeJS.ProcessEnv;
const noSleep = async () => {};

function falRoutes(result: unknown, pendingPolls = 1) {
  let polls = 0;
  return [
    (c: Call) => (c.method === "POST" && c.url.startsWith("https://queue.fal.run/") ? { request_id: "req1" } : undefined),
    (c: Call) => (c.url.endsWith("/requests/req1/status") ? { status: polls++ < pendingPolls ? "IN_PROGRESS" : "COMPLETED" } : undefined),
    (c: Call) => (c.url.endsWith("/requests/req1") ? result : undefined),
  ];
}

describe("FAL queue", () => {
  it("submits, polls until COMPLETED, fetches result with Key auth", async () => {
    const m = mockFetch(falRoutes({ video: { url: "https://v.mp4" } }, 2));
    const r = await falQueueRun("fal-ai/foo/bar", { a: 1 }, { pollMs: 1, timeoutMs: 1000, fetchImpl: m.impl, sleepImpl: noSleep, env });
    expect(r).toEqual({ requestId: "req1", output: { video: { url: "https://v.mp4" } } });
    expect(m.calls[0]).toMatchObject({ url: "https://queue.fal.run/fal-ai/foo/bar", method: "POST", body: { a: 1 }, auth: "Key fk" });
    expect(m.calls.filter((c) => c.url.includes("/status"))).toHaveLength(3);
    expect(m.calls.at(-1)?.url).toBe("https://queue.fal.run/fal-ai/foo/requests/req1");
  });
  it("throws on FAILED and on missing key", async () => {
    const m = mockFetch([(c) => (c.method === "POST" ? { request_id: "req1" } : undefined), (c) => (c.url.endsWith("/status") ? { status: "FAILED", error: "nsfw" } : undefined)]);
    await expect(falQueueRun("a/b", {}, { pollMs: 1, timeoutMs: 1000, fetchImpl: m.impl, sleepImpl: noSleep, env })).rejects.toThrow(/nsfw/);
    await expect(falQueueRun("a/b", {}, { pollMs: 1, timeoutMs: 1000, fetchImpl: m.impl, env: {} })).rejects.toThrow(/FAL_API_KEY/);
  });
  it("templates keep types and drop undefined", () => {
    expect(applyTemplate({ t: "{text}", n: { v: "{voiceId}", x: "{missing}" }, k: "lit", arr: ["{n}"] }, { text: "hi", voiceId: "v", n: 3 })).toEqual({ t: "hi", n: { v: "v" }, k: "lit", arr: [3] });
    expect(getPath({ a: { b: "c" } }, "a.b")).toBe("c");
  });
  it("uploads via initiate + PUT", async () => {
    const m = mockFetch([(c) => (c.url.includes("/storage/upload/initiate") ? { upload_url: "https://put/x", file_url: "https://cdn/x.mp4" } : undefined), (c) => (c.method === "PUT" ? {} : undefined)]);
    expect(await falUpload(Buffer.from("x"), "video/mp4", "x.mp4", { fetchImpl: m.impl, env })).toBe("https://cdn/x.mp4");
    expect(m.calls[0]?.body).toEqual({ content_type: "video/mp4", file_name: "x.mp4" });
  });
});

describe("adapters", () => {
  it("TTS adapter maps config input, merges actor voice settings, prices by chars", async () => {
    const m = mockFetch(falRoutes({ audio: { url: "https://a.mp3" } }, 0));
    const tts = falTtsAdapter(DEFAULT_PIPELINE.tts, { fetchImpl: m.impl, sleepImpl: noSleep, env });
    const r = await tts.synthesize({ text: "x".repeat(2000), voiceId: "Jessica", voiceSettings: { stability: 0.3 } });
    expect(r.url).toBe("https://a.mp3");
    expect(m.calls[0]?.url).toBe("https://queue.fal.run/fal-ai/elevenlabs/tts/eleven-v3");
    expect(m.calls[0]?.body).toEqual({ text: "x".repeat(2000), voice: "Jessica", stability: 0.3, apply_text_normalization: "auto" });
    await tts.synthesize({ text: "hi", voiceId: "Roger", defaultStability: 0.45 });
    expect((m.calls.find((c, i) => i > 0 && c.method === "POST")?.body as Record<string, unknown>).stability).toBe(0.45);
    expect(r.costMicros).toBe(200_000);
  });
  it("avatar adapter maps image+audio and prices by seconds", async () => {
    const m = mockFetch(falRoutes({ video: { url: "https://v.mp4" } }, 0));
    const av = falAvatarAdapter(DEFAULT_PIPELINE.avatar, { fetchImpl: m.impl, sleepImpl: noSleep, env });
    const r = await av.animate({ imageUrl: "https://i.png", audioUrl: "https://a.mp3", durationSec: 2 });
    expect(m.calls[0]?.url).toBe("https://queue.fal.run/bytedance/omnihuman/v2");
    expect(m.calls[0]?.body).toEqual({ image_url: "https://i.png", audio_url: "https://a.mp3", prompt: OMNIHUMAN_PROMPT });
    expect(r).toMatchObject({ url: "https://v.mp4", costMicros: 210_000 });
  });
  it("KIE Veo adapter: REFERENCE_2_VIDEO, polls successFlag, prompt has no appearance", async () => {
    let polls = 0;
    const m = mockFetch([
      (c) => (c.url.endsWith("/veo/generate") ? { code: 200, data: { taskId: "t1" } } : undefined),
      (c) => (c.url.includes("record-info?taskId=t1") ? { data: polls++ ? { successFlag: 1, response: { originUrls: ["https://k.mp4"] } } : { successFlag: 0 } } : undefined),
    ]);
    const k = kieVeoAdapter(DEFAULT_PIPELINE.nativeSpeech, { fetchImpl: m.impl, sleepImpl: noSleep, env });
    const r = await k.speak({ imageUrl: "https://i.png", text: "I love it", voicePrompt: "Warm alto", direction: "excited" });
    expect(r).toEqual({ url: "https://k.mp4", requestId: "t1", costMicros: 400_000 });
    const body = m.calls[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({ model: "veo3_fast", generationType: "REFERENCE_2_VIDEO", aspect_ratio: "9:16", imageUrls: ["https://i.png"] });
    expect(m.calls[0]?.auth).toBe("Bearer kk");
    expect(String(body.prompt)).toContain("Warm alto");
    expect(String(body.prompt)).toContain("DELIVERY: excited");
    expect(buildVeoPrompt("hi")).not.toMatch(/wearing|hair|lighting|background|kitchen/i);
  });
  it("KIE failure flag throws", async () => {
    const m = mockFetch([(c) => (c.url.endsWith("/generate") ? { code: 200, data: { taskId: "t" } } : undefined), () => ({ data: { successFlag: 3, errorMessage: "policy" } })]);
    await expect(kieVeoAdapter(DEFAULT_PIPELINE.nativeSpeech, { fetchImpl: m.impl, sleepImpl: noSleep, env }).speak({ imageUrl: "i", text: "t" })).rejects.toThrow(/policy/);
  });
});

describe("pipeline config", () => {
  it("defaults, env override merges and validates", () => {
    expect(loadPipelineConfig({})).toBe(DEFAULT_PIPELINE);
    expect(DEFAULT_PIPELINE.mode).toBe("native_voice");
    expect(DEFAULT_PIPELINE.nativeVoice.order).toEqual(["happy_horse", "kling"]);
    expect(DEFAULT_PIPELINE.nativeVoice.models.happy_horse?.endpointId).toBe("alibaba/happy-horse/v1.1/image-to-video");
    expect(DEFAULT_PIPELINE.nativeVoice.voiceClone.enabled).toBe(false);
    expect(DEFAULT_PIPELINE.nativeFal.endpointId).toBe("alibaba/happy-horse/v1.1/image-to-video");
    const c = loadPipelineConfig({ TESTIMONIAL_PIPELINE_JSON: JSON.stringify({ mode: "native_speech", avatar: { endpointId: "fal-ai/new-model" }, avatarFallback: null }) });
    expect(c.mode).toBe("native_speech");
    expect(c.avatarFallback).toBeNull();
    expect(c.avatar.endpointId).toBe("fal-ai/new-model");
    expect(c.avatar.outputPath).toBe("video.url");
    expect(() => loadPipelineConfig({ TESTIMONIAL_PIPELINE_JSON: JSON.stringify({ mode: "bogus" }) })).toThrow();
  });
  it("estimateMicros", () => {
    expect(estimateMicros({ perCallMicros: 10, perSecondMicros: 2, perThousandCharsMicros: 1000, longMultiplier: 1, longOverSeconds: 1e9 }, { seconds: 5, chars: 500 })).toBe(520);
    const h3 = DEFAULT_PIPELINE.avatarFallback?.price;
    if (!h3) throw new Error("fallback missing");
    expect(estimateMicros(h3, { seconds: 10 })).toBe(800_000);
    expect(estimateMicros(h3, { seconds: 20 })).toBe(1_920_000);
    expect(estimateMicros(DEFAULT_PIPELINE.avatar.price, { seconds: 30 })).toBe(3_150_000);
    expect(estimateMicros(DEFAULT_PIPELINE.tts.price, { chars: 450 })).toBe(45_000);
  });
});
