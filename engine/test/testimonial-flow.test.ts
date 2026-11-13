import { describe, expect, it } from "vitest";
import { evaluateEntitlement, minutesForDuration, type TestimonialJobPayload } from "../../src/lib/testimonial/contracts";
import { PermanentJobError } from "../src/jobs/context";
import type { Adapters } from "../src/testimonial/adapters";
import { onTestimonialDead, runTestimonial, type TestimonialDeps } from "../src/testimonial/job";
import type { MediaOps } from "../src/testimonial/media";
import { DEFAULT_PIPELINE, type PipelineConfig } from "../src/testimonial/models";
import { memStore, world, type World } from "./helpers/testimonial-mem";
import type { AIProvider } from "../src/providers/types";
import { mkdtempSync as __mkdtemp } from "node:fs";
import { tmpdir as __tmpdir } from "node:os";
import { join as __join } from "node:path";
// Own scratch dir per test file: parallel files shared /tmp/testimonial-<id> and deleted each other's work.
const SCRATCH = __mkdtemp(__join(__tmpdir(), "kmd-testimonial-"));

function fakes(opts: { failClipOnce?: number; finalSeconds?: number } = {}) {
  const calls = { speak: [] as string[], tts: 0, animate: 0, finish: 0 };
  let failed = false;
  const adapters: Adapters = {
    nativeVoice: {
      async take() {
        throw new Error("not used");
      },
      async cloneVoice() {
        throw new Error("not used");
      },
    },
    nativeFal: {
      model: "fake/native",
      estimateMicros: () => 0,
      async take() {
        throw new Error("not used");
      },
    },
    native: {
      async speak(r) {
        expect(r.voicePrompt).toBe("Warm alto, light Texan accent");
        if (opts.failClipOnce !== undefined && calls.speak.length === opts.failClipOnce && !failed) {
          failed = true;
          calls.speak.push("FAIL");
          throw new Error("vendor 500");
        }
        calls.speak.push(r.text);
        return { url: `https://vid/${calls.speak.length}.mp4`, requestId: "r", costMicros: 400_000 };
      },
    },
    tts: {
      async synthesize(r) {
        calls.tts++;
        expect(r.voiceId).toBe("voice-ana");
        return { url: "https://aud/full.mp3", requestId: "t", costMicros: 10_000 };
      },
    },
    avatarFallback: null,
    avatar: {
      model: "fake/avatar",
      async animate(r) {
        calls.animate++;
        expect(r.audioUrl).toMatch(/^https:\/\/up\//);
        return { url: `https://vid/av${calls.animate}.mp4`, requestId: "a", costMicros: 100_000 };
      },
    },
  };
  let uploads = 0;
  const media: MediaOps = {
    async download() {},
    async upload() {
      return `https://up/${uploads++}`;
    },
    async probe(file) {
      if (file.endsWith("final.mp4")) return opts.finalSeconds ?? 28;
      if (file.endsWith("voice-full")) return 20;
      return 7.5;
    },
    async silences() {
      return [{ start: 6, end: 6.5 }, { start: 13, end: 13.6 }];
    },
    async speechEnd() {
      return 7;
    },
    async slice() {},
    async concat() {},
    async pad() {},
    async finish(o) {
      calls.finish++;
      expect(o.inputs.length).toBeGreaterThan(0);
    },
  };
  return { adapters, media, calls };
}

const payload: TestimonialJobPayload = { compositeVideoId: "v1", useAIScript: true };

const NATIVE: PipelineConfig = { ...DEFAULT_PIPELINE, mode: "native_speech" };

function deps(w: World, f: ReturnType<typeof fakes>, cfg: PipelineConfig = NATIVE, provider: AIProvider | null = null): TestimonialDeps {
  return { store: memStore(w), adapters: f.adapters, media: f.media, provider, config: cfg, scratchDir: SCRATCH, usage: [] };
}

/** Minimal stand-in for the runner: claim -> handler -> retry until maxAttempts -> onDead. */
async function runQueued(d: TestimonialDeps, maxAttempts: number): Promise<"succeeded" | "dead"> {
  for (let attempt = 1; ; attempt++) {
    try {
      await runTestimonial(d, payload);
      return "succeeded";
    } catch (e) {
      if (e instanceof PermanentJobError || attempt >= maxAttempts) {
        await onTestimonialDead(d.store, { ...payload }, e instanceof Error ? e.message : String(e));
        return "dead";
      }
    }
  }
}

describe("testimonial job flow", () => {
  it("native speech: script -> per-clip progress -> stitch -> success, charges minutes once", async () => {
    const w = world(1);
    const f = fakes();
    const d = deps(w, f);
    expect(await runQueued(d, 3)).toBe("succeeded");
    expect(w.video.scriptSource).toBe("template");
    expect(w.clips.length).toBeGreaterThan(1);
    expect(w.clips.every((c) => c.status === "completed")).toBe(true);
    expect(w.video.progress[0]).toBe("generating_clips");
    expect(w.video.progress).toContain("0:generating_video");
    expect(w.video.progress.at(-1)).toBe("stitching");
    expect(w.video.status).toBe("completed");
    expect(w.video.finalVideoUrl).toMatch(/^https:\/\/up\//);
    expect(w.video.costMicros).toBe(400_000 * w.clips.length);
    expect(d.usage.reduce((a, u) => a + u.costMicros, 0)).toBe(400_000 * w.clips.length);
    expect(w.user.minutesUsed).toBe(1);
    // a re-delivered job after success is a no-op
    await runTestimonial(d, payload);
    expect(f.calls.finish).toBe(1);
  });

  it("refunds unused reserved minutes on success", async () => {
    const w = world(3);
    expect(await runQueued(deps(w, fakes({ finalSeconds: 50 })), 3)).toBe("succeeded");
    expect(w.user.minutesUsed).toBe(1);
  });

  it("retry does not regenerate finished clips or rewrite the script", async () => {
    const w = world(1);
    const f = fakes({ failClipOnce: 1 });
    expect(await runQueued(deps(w, f), 3)).toBe("succeeded");
    const texts = f.calls.speak.filter((t) => t !== "FAIL");
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.length).toBe(w.clips.length);
  });

  it("terminal failure marks failed and releases reserved minutes exactly once", async () => {
    const w = world(2);
    const f = fakes();
    f.adapters.native.speak = async () => {
      throw new Error("always down");
    };
    const d = deps(w, f);
    expect(await runQueued(d, 2)).toBe("dead");
    expect(w.video.status).toBe("failed");
    expect(w.user.minutesUsed).toBe(0);
    expect(await d.store.fail("v1", "again")).toBe(false);
    expect(w.user.minutesUsed).toBe(0);
    await expect(runTestimonial(d, payload)).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("audio-driven over the single-take limit: one TTS call, chunks cut at pauses", async () => {
    const w = world(1);
    const f = fakes();
    const cfg: PipelineConfig = { ...DEFAULT_PIPELINE, mode: "audio_driven", singleTakeMaxSeconds: 10, maxChunkSeconds: 8, minChunkSeconds: 2 };
    expect(await runQueued(deps(w, f, cfg), 3)).toBe("succeeded");
    expect(f.calls.tts).toBe(1);
    expect(w.clips.map((c) => [c.startMs, c.endMs])).toEqual([[0, 6250], [6250, 13300], [13300, 20000]]);
    expect(f.calls.animate).toBe(3);
    expect(w.video.costMicros).toBe(10_000 + 3 * 100_000);
  });

  it("uses Codex script when available and verbatim", async () => {
    const w = world(1);
    const review = w.video.reviewText;
    const provider: AIProvider = {
      name: "codex",
      async text() {
        const json = { hook: "Okay so.", testimonial: review, cta: "Go try it.", segments: [{ text: "Okay so, honestly?", direction: "curious" }, { text: review, direction: "warm" }, { text: "Go try it.", direction: "soft" }] };
        return { text: JSON.stringify(json), json, usage: { costMicros: 5, latencyMs: 1 } };
      },
      async image() {
        throw new Error("no");
      },
      async health() {
        return { ok: true };
      },
    };
    expect(await runQueued(deps(w, fakes(), NATIVE, provider), 3)).toBe("succeeded");
    expect(w.video.scriptSource).toBe("codex");
    expect(w.clips[0]?.deliveryDirection).toBe("curious");
  });
});

describe("entitlement", () => {
  const base = { subscriptionStatus: "active", minutesUsed: 0, minutesLimit: 3, bonusMinutes: 0 };
  it("active subscription with minutes", () => {
    expect(evaluateEntitlement(base, 1)).toEqual({ allowed: true, remainingMinutes: 3, via: "subscription" });
    expect(evaluateEntitlement({ ...base, subscriptionStatus: "trialing" }, 3).allowed).toBe(true);
  });
  it("insufficient minutes", () => {
    const e = evaluateEntitlement({ ...base, minutesUsed: 3 }, 1);
    expect(e.allowed).toBe(false);
    if (!e.allowed) expect(e.code).toBe("insufficient_minutes");
  });
  it("no subscription: only credit-pack minutes", () => {
    expect(evaluateEntitlement({ ...base, subscriptionStatus: "canceled" }, 1)).toMatchObject({ allowed: false, code: "no_entitlement" });
    expect(evaluateEntitlement({ subscriptionStatus: "incomplete", minutesUsed: 0, minutesLimit: 5, bonusMinutes: 5 }, 2)).toMatchObject({ allowed: true, via: "credits" });
    expect(evaluateEntitlement({ subscriptionStatus: "canceled", minutesUsed: 0, minutesLimit: 10, bonusMinutes: 1 }, 2)).toMatchObject({ allowed: false, code: "insufficient_minutes", remainingMinutes: 1 });
  });
  it("minutesForDuration rounds up, min 1", () => {
    expect([0, 30, 60, 61].map(minutesForDuration)).toEqual([1, 1, 1, 2]);
  });
});
