import { describe, expect, it } from "vitest";
import { buildScript, hookLibrary } from "../../../src/lib/growth/reels-core";
import { reelFrames, reelKey, reelsCycle } from "./reels";

describe("reels render + cycle", () => {
  it("frames: one per scene, caption + AI label burned in, 1080x1920", () => {
    const s = buildScript(hookLibrary()[0]!, true);
    const f = reelFrames(s);
    expect(f).toHaveLength(s.scenes.length);
    for (const fr of f) {
      expect(fr.svg).toContain('width="1080" height="1920"');
      expect(fr.svg).toContain("Made by Ozzy, AI");
    }
    expect(f[0]!.svg).toContain("Roofers:");
    expect(reelKey("a", "silent.mp4")).toBe("reels/a/silent.mp4");
  });

  const mkDb = (spend = 0, rejected = false) => {
    const created: Array<{ name: string; props: Record<string, unknown> }> = [];
    const db = { adsEvent: {
      findMany: async (a: { where: { name: string } }) => (a.where.name === "reel_spend" ? [{ props: { micros: spend } }] : []),
      create: async (a: { data: { name: string; props: Record<string, unknown> } }) => { created.push(a.data); return {}; },
    } } as never;
    const provider = { text: async () => ({ text: "", json: rejected ? { approved: false, reasons: ["no"], fix: "" } : { approved: true, reasons: [], fix: "" } }) } as never;
    return { db, provider, created };
  };
  it("creates a reel_ready + queue rows, stores silent.mp4 and script.txt", async () => {
    const { db, provider, created } = mkDb();
    const puts: string[] = [];
    const storage = { put: async (k: string) => { puts.push(k); } } as never;
    const r = await reelsCycle({ db, provider, storage, env: {}, now: new Date("2026-11-26T15:00:00Z"), render: async () => Buffer.from("mp4") });
    expect(r.created).toHaveLength(1);
    expect(puts.sort()).toEqual([`reels/${r.created[0]}/script.txt`, `reels/${r.created[0]}/silent.mp4`].sort());
    expect(created.filter((c) => c.name === "reel_ready")).toHaveLength(1);
    expect(created.filter((c) => c.name === "social_queue").length).toBe(6);
  });
  it("stops at the daily cost cap and when the gate rejects", async () => {
    const storage = { put: async () => { throw new Error("must not store"); } } as never;
    const a = mkDb(900_000);
    expect(await reelsCycle({ db: a.db, provider: a.provider, storage, env: {}, now: new Date(), render: async () => Buffer.from("x") })).toEqual({ created: [], skipped: "daily cost cap" });
    const b = mkDb(0, true);
    expect((await reelsCycle({ db: b.db, provider: b.provider, storage, env: {}, now: new Date(), render: async () => Buffer.from("x") })).skipped).toBe("review gate rejected");
  });
});
