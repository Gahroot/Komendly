import { describe, expect, it } from "vitest";
import { imageMime } from "../src/storage/image-mime";

describe("imageMime", () => {
  it("labels by magic bytes, not by the stored label", () => {
    expect(imageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), "image/png")).toBe("image/jpeg");
    expect(imageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/jpeg")).toBe("image/png");
    expect(imageMime(Buffer.from("RIFF0000WEBPVP8 "), "image/png")).toBe("image/webp");
    expect(imageMime(Buffer.from([1, 2, 3]), "image/png")).toBe("image/png");
  });
});

describe("asPng", () => {
  it("re-encodes JPEG vision input as PNG and leaves PNG alone", async () => {
    const sharp = (await import("sharp")).default;
    const { asPng } = await import("../src/providers/codex");
    const jpg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#f00" } }).jpeg().toBuffer();
    const out = await asPng({ mediaType: "image/png", base64: jpg.toString("base64") });
    expect(out.mediaType).toBe("image/png");
    expect(imageMime(Buffer.from(out.base64, "base64"))).toBe("image/png");
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#0f0" } }).png().toBuffer();
    expect((await asPng({ mediaType: "image/png", base64: png.toString("base64") })).base64).toBe(png.toString("base64"));
  });
});
