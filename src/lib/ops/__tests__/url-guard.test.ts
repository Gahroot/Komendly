import { describe, expect, it } from "vitest";
import { assertPublicHttpsUrl, isBlockedIp, safeDownloadName } from "../security/url-guard";

const pub = async () => ["93.184.216.34"];
describe("url-guard", () => {
  it("blocks private, metadata and mapped addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.0.1", "172.16.5.5", "::1", "fd00::1", "::ffff:10.0.0.1", "100.64.0.1"]) expect(isBlockedIp(ip)).toBe(true);
    expect(isBlockedIp("93.184.216.34")).toBe(false);
  });
  it("accepts public https only", async () => {
    await expect(assertPublicHttpsUrl("https://cdn.example.com/a.mp4", pub)).resolves.toBeInstanceOf(URL);
    for (const bad of ["http://example.com/a", "file:///etc/passwd", "https://u:p@example.com/", "https://example.com:22/", "https://localhost/", "https://169.254.169.254/latest", "https://[::1]/", "nope"]) {
      await expect(assertPublicHttpsUrl(bad, pub)).rejects.toThrow();
    }
  });
  it("rejects hosts resolving to private space", async () => {
    await expect(assertPublicHttpsUrl("https://evil.example/", async () => ["10.0.0.5"])).rejects.toThrow();
    await expect(assertPublicHttpsUrl("https://evil.example/", async () => { throw new Error("x"); })).rejects.toThrow();
  });
  it("sanitises filenames", () => {
    expect(safeDownloadName('a"\r\nb/../c.mp4')).toBe("a-b-..-c.mp4");
    expect(safeDownloadName("")).toBe("video.mp4");
  });
});
