import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { markDeliveredAssets, unbrandedFree } from "./viral-branding";

describe("viral branding health", () => {
  it("counts delivered free statics that should carry the mark but don't", () => {
    expect(unbrandedFree([
      { kind: "static", status: "ready", visualBrief: { branding: { required: true, applied: true } } },
      { kind: "static", status: "ready", visualBrief: { branding: { required: true, applied: false } } },
      { kind: "static", status: "qc", visualBrief: { branding: { required: true, applied: false } } },
      { kind: "static", status: "ready", visualBrief: { branding: { required: false, applied: false } } },
      { kind: "static", status: "ready", visualBrief: null },
      { kind: "motion", status: "ready", visualBrief: { branding: { required: true, applied: false } } },
    ])).toBe(1);
  });
});

async function fixture() {
  const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const store = new Map<string, Buffer>([["k/1x1.png", png], ["k/poster.png", png]]);
  let brief: Record<string, unknown> = { branding: { required: true, applied: false, code: "ab12cd34" } };
  const assets = [{ id: "a1", storageKey: "k/1x1.png", mime: "image/png", ratio: "1:1" }, { id: "a2", storageKey: "k/poster.png", mime: "image/png", ratio: "poster" }];
  let puts = 0;
  const db = {
    ad: { findUnique: async () => ({ visualBrief: brief, assets }), update: async (a: { data: { visualBrief: unknown } }) => { brief = a.data.visualBrief as Record<string, unknown>; } },
    adAsset: { update: async () => undefined },
  };
  const storage = { get: async (k: string) => store.get(k)!, put: async (k: string, b: Buffer) => { puts++; store.set(k, b); } };
  return { png, store, db, storage, brief: () => brief, setBrief: (b: Record<string, unknown>) => (brief = b), puts: () => puts };
}

describe("mark after QC", () => {
  it("render output (what QC reads) is unmarked until markDeliveredAssets runs after QC pass", async () => {
    const f = await fixture();
    // QC reads the stored render: identical to the unmarked render.
    expect(Buffer.compare(f.store.get("k/1x1.png")!, f.png)).toBe(0);
    expect(await markDeliveredAssets(f.db, f.storage, "ad1")).toBe(1);
    expect(Buffer.compare(f.store.get("k/1x1.png")!, f.png)).not.toBe(0);
    expect(Buffer.compare(f.store.get("k/poster.png")!, f.png)).toBe(0);
    expect((f.brief().branding as { applied: boolean }).applied).toBe(true);
  });
  it("never double-marks (QC retry / second pass)", async () => {
    const f = await fixture();
    await markDeliveredAssets(f.db, f.storage, "ad1");
    const once = f.store.get("k/1x1.png")!;
    expect(await markDeliveredAssets(f.db, f.storage, "ad1")).toBe(0);
    expect(f.store.get("k/1x1.png")).toBe(once);
    expect(f.puts()).toBe(1);
  });
  it("re-render (replace/revise) uploads fresh unmarked files with applied=false: marked exactly once again", async () => {
    const f = await fixture();
    await markDeliveredAssets(f.db, f.storage, "ad1");
    f.store.set("k/1x1.png", f.png); // new render's unmarked upload
    f.setBrief({ branding: { required: true, applied: false, code: "ab12cd34" } });
    expect(await markDeliveredAssets(f.db, f.storage, "ad1")).toBe(1);
    const reMarked = await sharp(f.store.get("k/1x1.png")!).raw().toBuffer();
    await markDeliveredAssets(f.db, f.storage, "ad1");
    expect(Buffer.compare(await sharp(f.store.get("k/1x1.png")!).raw().toBuffer(), reMarked)).toBe(0);
  });
  it("paid / not required: untouched", async () => {
    const f = await fixture();
    f.setBrief({ branding: { required: false, applied: false, code: "ab12cd34" } });
    expect(await markDeliveredAssets(f.db, f.storage, "ad1")).toBe(0);
    expect(f.puts()).toBe(0);
  });
});
