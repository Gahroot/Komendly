import { describe, expect, it } from "vitest";
import { HybridProvider, MimoTextProvider, stripThinking, withMimoText } from "../src/providers/mimo";
import { ProviderUnavailableError } from "../src/providers/errors";
import type { AIProvider } from "../src/providers/types";

const usage = { costMicros: 1, latencyMs: 1 };
const codex = (over: Partial<AIProvider> = {}): AIProvider => ({
  name: "codex",
  text: async () => ({ text: "codex", usage }),
  image: async () => ({ png: Buffer.from("png"), width: 1, height: 1, usage }),
  health: async () => ({ ok: true }),
  ...over,
});
const mimo = (text: AIProvider["text"]) => ({ model: "mimo-v2.6-pro", text }) as unknown as MimoTextProvider;

describe("MiMo hybrid provider", () => {
  it("text goes to MiMo, images to Codex", async () => {
    const h = new HybridProvider(mimo(async () => ({ text: "mimo", usage })), codex());
    expect((await h.text({ system: "", prompt: "hi" })).text).toBe("mimo");
    expect((await h.image({ prompt: "x", size: "16x16" })).png.toString()).toBe("png");
    expect(h.name).toBe("codex");
  });
  it("falls back to Codex for that call when MiMo fails", async () => {
    const h = new HybridProvider(mimo(async () => { throw new Error("502 bad gateway"); }), codex());
    expect((await h.text({ system: "", prompt: "hi" })).text).toBe("codex");
    expect(h.fallbacks).toBe(1);
  });
  it("keeps the Codex-unavailable error when both are down", async () => {
    const h = new HybridProvider(mimo(async () => { throw new Error("down"); }), codex({ text: async () => { throw new ProviderUnavailableError("Codex usage limit"); } }));
    await expect(h.text({ system: "", prompt: "hi" })).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
  it("only wraps with a key and unless TEXT_BRAIN=codex", () => {
    const c = codex();
    expect(withMimoText(c, {})).toBe(c);
    expect(withMimoText(c, { XIAOMI_API_KEY: "tp-x", TEXT_BRAIN: "codex" })).toBe(c);
    expect(withMimoText(c, { XIAOMI_API_KEY: "tp-x" })).toBeInstanceOf(HybridProvider);
  });
  it("strips leaked reasoning", () => {
    expect(stripThinking("<think>hmm</think>\n{\"a\":1}")).toBe("{\"a\":1}");
  });
});

describe("structured() harness for MiMo", () => {
  it("trims over-long strings instead of failing", async () => {
    const { parseLenient } = await import("../src/providers/structured");
    const { z } = await import("zod");
    const S = z.object({ score: z.number(), notes: z.string().max(10), tags: z.array(z.string()).max(2) });
    const r = parseLenient(S, { score: 9, notes: "x".repeat(50), tags: ["a", "b", "c"] });
    expect(r.success).toBe(true);
    expect(r.data?.notes.length).toBeLessThanOrEqual(10);
    expect(r.data?.tags).toEqual(["a", "b"]);
    expect(parseLenient(S, { score: "9", notes: "ok", tags: [] }).success).toBe(false);
  });
  it("uses Codex once when MiMo's JSON keeps failing the schema", async () => {
    const { structured } = await import("../src/providers/structured");
    const { z } = await import("zod");
    const h = new HybridProvider(mimo(async () => ({ text: "{}", json: { nope: 1 }, usage })), codex({ text: async () => ({ text: "", json: { ok: true }, usage }) }));
    expect(await structured(h, z.object({ ok: z.boolean() }), { system: "", prompt: "x" }, [])).toEqual({ ok: true });
    expect(h.fallbacks).toBe(1);
  });
});
