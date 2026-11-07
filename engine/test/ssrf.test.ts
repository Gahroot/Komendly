import { describe, expect, it } from "vitest";
import { assertPublicUrl, BlockedUrlError, isBlockedIp } from "../src/net/ssrf";

const pub = async () => ["93.184.216.34"];
describe("ssrf guard", () => {
  it("blocks private/loopback/metadata ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isBlockedIp(ip), ip).toBe(false);
  });
  it("rejects bad schemes, ports, credentials and hosts", async () => {
    for (const u of ["file:///etc/passwd", "http://x.com:22/", "http://a:b@x.com/", "http://localhost/", "http://foo.railway.internal/", "http://169.254.169.254/latest"]) {
      await expect(assertPublicUrl(u, pub), u).rejects.toBeInstanceOf(BlockedUrlError);
    }
  });
  it("rejects hosts resolving to private IPs (DNS rebinding style)", async () => {
    await expect(assertPublicUrl("https://evil.example/", async () => ["93.184.216.34", "10.0.0.5"])).rejects.toBeInstanceOf(BlockedUrlError);
  });
  it("allows public hosts", async () => {
    await expect(assertPublicUrl("https://example.com/pricing", pub)).resolves.toBeInstanceOf(URL);
  });
});
