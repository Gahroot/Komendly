// Production-hardening: FAL request resume across restarts (mocked HTTP), short-audio padding,
// and the script n-gram checker.
import { describe, expect, it } from "vitest";
import { createAdapters } from "../src/testimonial/adapters";
import { falQueueRun } from "../src/testimonial/fal-queue";
import { buildIphoneFinishArgs, type FinishOptions } from "../src/testimonial/ffmpeg";
import { PAD_TO_SECONDS, runTestimonial, type TestimonialDeps } from "../src/testimonial/job";
import type { MediaOps } from "../src/testimonial/media";
import { DEFAULT_PIPELINE as BASE } from "../src/testimonial/models";
// Audio-driven pipeline (TTS + avatar), kept as a config option behind native_fal.
const DEFAULT_PIPELINE = { ...BASE, mode: "audio_driven" as const };
import { scriptProblems, sharedNgrams, writeScript } from "../src/testimonial/script";
import type { AIProvider } from "../src/providers/types";
import { memStore, world, type World } from "./helpers/testimonial-mem";

const env = { FAL_API_KEY: "fk" } as NodeJS.ProcessEnv;
const TTS = "fal-ai/elevenlabs/tts/eleven-v3";
const OMNI = "bytedance/omnihuman/v2";
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

/** FAL mock; `onOmniPoll` can kill the "engine" mid-request. */
function fal(o: { onOmniPoll?: (n: number) => void; omniStatus?: () => string } = {}) {
  const submits: string[] = [];
  let omniPolls = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      const ep = url.replace("https://queue.fal.run/", "");
      submits.push(ep);
      return ok({ request_id: `${ep.replaceAll("/", "_")}_${submits.length}`, status_url: `https://q/${ep}/status`, response_url: `https://q/${ep}/result` });
    }
    const m = /^https:\/\/q\/(.+)\/(status|result)$/.exec(url);
    if (!m?.[1]) return new Response("nf", { status: 404 });
    if (m[2] === "status") {
      if (m[1] === OMNI) {
        o.onOmniPoll?.(++omniPolls);
        init?.signal?.throwIfAborted();
        return ok({ status: o.omniStatus?.() ?? "COMPLETED" });
      }
      return ok({ status: "COMPLETED" });
    }
    return ok(m[1] === TTS ? { audio: { url: "https://fal.media/voice.mp3" } } : { video: { url: "https://fal.media/omni.mp4" }, duration: 24 });
  }) as typeof fetch;
  return { impl, submits };
}

function media(voiceSeconds: number) {
  const calls = { finish: [] as FinishOptions[], pads: [] as number[] };
  let n = 0;
  const m: MediaOps = {
    async download() {},
    async upload() {
      return `https://fal.media/up/${++n}`;
    },
    async probe(file) {
      return file.endsWith("voice-full") ? voiceSeconds : 24;
    },
    async silences() {
      return [];
    },
    async speechEnd() {
      return 0;
    },
    async slice() {},
    async concat() {},
    async pad(_f, seconds) {
      calls.pads.push(seconds);
    },
    async finish(o) {
      calls.finish.push(o);
    },
  };
  return { m, calls };
}

function deps(w: World, impl: typeof fetch, m: MediaOps, signal?: AbortSignal): TestimonialDeps {
  return { store: memStore(w), adapters: createAdapters(DEFAULT_PIPELINE, { fetchImpl: impl, sleepImpl: async () => {}, env }), media: m, provider: null, config: DEFAULT_PIPELINE, scratchDir: "/tmp", usage: [], signal };
}
const payload = { compositeVideoId: "v1", useAIScript: false };

describe("FAL request resume", () => {
  it("falQueueRun with resume polls the stored request and never submits", async () => {
    const f = fal();
    const subs: string[] = [];
    const r = await falQueueRun(OMNI, {}, { pollMs: 1, timeoutMs: 1000, fetchImpl: f.impl, env, resume: { requestId: "old", statusUrl: `https://q/${OMNI}/status`, responseUrl: `https://q/${OMNI}/result` }, onSubmit: async (s) => void subs.push(s.requestId) });
    expect(r.requestId).toBe("old");
    expect(f.submits).toEqual([]);
    expect(subs).toEqual([]);
  });

  it("engine killed mid-OmniHuman: the retry resumes the same request_id and pays once", async () => {
    const w = world(1);
    const kill = new AbortController();
    const f = fal({ onOmniPoll: (n) => n === 1 && kill.abort() });
    const md = media(24);
    await expect(runTestimonial(deps(w, f.impl, md.m, kill.signal), payload)).rejects.toThrow();
    expect(w.video.pipelineState.pendingFal?.["0"]).toMatchObject({ model: OMNI, requestId: `${OMNI.replaceAll("/", "_")}_2` });
    expect(w.clips[0]?.status).toBe("failed");

    const d2 = deps(w, f.impl, md.m, new AbortController().signal);
    const res = await runTestimonial(d2, payload);
    expect(res.status).toBe("completed");
    expect(f.submits).toEqual([TTS, OMNI]); // no second OmniHuman submit
    expect(w.video.pipelineState.pendingFal).toEqual({});
    const omniCost = 24 * 105_000;
    expect(w.video.costMicros - (w.video.pipelineState.preCostMicros ?? 0)).toBe(omniCost);
  });

  it("a failed OmniHuman attempt is counted in costMicros", async () => {
    const w = world(1);
    const f = fal({ omniStatus: () => "FAILED" });
    const d = { ...deps(w, f.impl, media(24).m), adapters: { ...createAdapters(DEFAULT_PIPELINE, { fetchImpl: f.impl, sleepImpl: async () => {}, env }), avatarFallback: null } };
    await expect(runTestimonial(d, payload)).rejects.toThrow(/FAL request failed/);
    expect(d.usage.reduce((a, u) => a + u.costMicros, 0)).toBeGreaterThanOrEqual(24 * 105_000);
    expect(w.video.pipelineState.preCostMicros).toBeGreaterThanOrEqual(24 * 105_000);
    expect(w.video.pipelineState.pendingFal).toEqual({});
  });
});

describe("short audio", () => {
  it("pads < 5 s speech to 5.5 s for the avatar and trims it back in finish", async () => {
    const w = world(1);
    const f = fal();
    const md = media(2);
    await runTestimonial(deps(w, f.impl, md.m), payload);
    expect(md.calls.pads).toEqual([PAD_TO_SECONDS]);
    expect(w.video.pipelineState.audio).toMatchObject({ duration: PAD_TO_SECONDS, speechDuration: 2, url: "https://fal.media/up/1" });
    expect(w.clips[0]).toMatchObject({ audioUrl: "https://fal.media/up/1", endMs: 5500 });
    expect(md.calls.finish[0]?.trimTo).toBeCloseTo(2.4);
    const args = buildIphoneFinishArgs({ inputs: [{ path: "a.mp4", duration: 5.5 }], output: "o.mp4", trimTo: 2.4 });
    expect(args[args.indexOf("-t", args.indexOf("-shortest")) + 1]).toBe("2.4");
  });
  it("does not pad normal-length speech", async () => {
    const md = media(24);
    await runTestimonial(deps(world(1), fal().impl, md.m), payload);
    expect(md.calls.pads).toEqual([]);
    expect(md.calls.finish[0]?.trimTo).toBeUndefined();
  });
});

const REVIEW = "They came out the same day our AC died. Fixed it in about an hour, super friendly tech.";

describe("script n-gram checker", () => {
  it("finds maximal shared 3+ word phrases, ignoring case, punctuation and audio tags", () => {
    expect(sharedNgrams("When our AC died, I figured we'd be sweating", REVIEW)).toEqual(["our ac died"]); // the real E2E hook
    expect(sharedNgrams("Okay, this summer nearly broke me.", REVIEW)).toEqual([]);
    expect(sharedNgrams("When the same day our AC died, [sighs] wow", REVIEW)).toEqual(["the same day our ac died"]);
    expect(sharedNgrams("Honestly? Super friendly tech, call them.", REVIEW)).toEqual(["super friendly tech"]);
    expect(sharedNgrams("our AC", REVIEW)).toEqual([]);
  });
  it("scriptProblems flags hook/CTA echoes and non-verbatim reviews", () => {
    const good = { hook: "Okay, so this summer nearly broke me.", cta: "If you're local, give them a call.", fullScript: `Okay, so this summer nearly broke me. ${REVIEW} If you're local, give them a call.` };
    expect(scriptProblems(good, REVIEW)).toEqual([]);
    const bad = { ...good, hook: "So the same day our AC died...", fullScript: "So the same day our AC died... They came out." };
    const p = scriptProblems(bad, REVIEW);
    expect(p.some((x) => x.includes("hook") && x.includes('"the same day our ac died"'))).toBe(true);
    expect(p.some((x) => x.includes("verbatim"))).toBe(true);
  });
  it("writeScript re-asks Codex once with the problems, then accepts the fix", async () => {
    const prompts: string[] = [];
    const answers = [
      { hook: "So our AC died last week.", testimonial: REVIEW, cta: "Call them.", segments: [{ text: `So our AC died last week. ${REVIEW} Call them.`, direction: "d" }] },
      { hook: "Okay, this summer nearly broke me.", testimonial: REVIEW, cta: "Call them.", segments: [{ text: `Okay, this summer nearly broke me. ${REVIEW} Call them.`, direction: "d" }] },
    ];
    const provider = {
      name: "codex",
      text: async (r: { prompt: string }) => {
        prompts.push(r.prompt);
        return { text: "", json: answers[prompts.length - 1], usage: { costMicros: 5, latencyMs: 1 } };
      },
    } as unknown as AIProvider;
    const s = await writeScript(provider, { reviewText: REVIEW, targetSeconds: 20, maxWords: 50, useAI: true });
    expect(s.source).toBe("codex");
    expect(s.hook).toBe("Okay, this summer nearly broke me.");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/rejected[\s\S]*"our ac died"/);
    expect(s.usage?.costMicros).toBe(10);
  });
  it("falls back to the template after a second bad answer (no third call)", async () => {
    let n = 0;
    const bad = { hook: "Our AC died.", testimonial: REVIEW, cta: "c", segments: [{ text: `Our AC died. ${REVIEW} c`, direction: "d" }] };
    const provider = { name: "codex", text: async () => (n++, { text: "", json: bad, usage: { costMicros: 5, latencyMs: 1 } }) } as unknown as AIProvider;
    const s = await writeScript(provider, { reviewText: REVIEW, targetSeconds: 20, maxWords: 50, useAI: true });
    expect(s.source).toBe("template");
    expect(n).toBe(2);
  });
});
