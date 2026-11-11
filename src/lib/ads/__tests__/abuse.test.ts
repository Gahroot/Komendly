import { describe, expect, it } from "vitest";
import {
  assertPublicHost, decideTrial, ipPrefix, isDisposableEmail, isPrivateAddress, normalizeEmail,
  parseTargetUrl, registrableDomain, UnsafeUrlError,
} from "../abuse";

describe("email normalization", () => {
  it("strips +tags and gmail dots", () => {
    expect(normalizeEmail("J.Doe+ads@Gmail.com")).toBe("jdoe@gmail.com");
    expect(normalizeEmail("j.doe@googlemail.com")).toBe("jdoe@gmail.com");
    expect(normalizeEmail("first.last+x@company.com")).toBe("first.last@company.com");
  });
  it("detects disposable domains", () => {
    expect(isDisposableEmail("a@mailinator.com")).toBe(true);
    expect(isDisposableEmail("a@sub.yopmail.com")).toBe(true);
    expect(isDisposableEmail("a@acme.com")).toBe(false);
  });
});

describe("identity helpers", () => {
  it("registrable domain", () => {
    expect(registrableDomain("www.shop.acme.com")).toBe("acme.com");
    expect(registrableDomain("blog.kettle.co.uk")).toBe("kettle.co.uk");
  });
  it("ip prefixes", () => {
    expect(ipPrefix("203.0.113.77")).toBe("203.0.113.0/24");
    expect(ipPrefix("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(ipPrefix("::ffff:198.51.100.9")).toBe("198.51.100.0/24");
  });
});

describe("trial decision", () => {
  const none = { domain: false, email: false, device: false, ip: false };
  it("allows a fresh claim", () => expect(decideTrial(none)).toEqual({ ok: true }));
  it("domain wins over other hits", () => expect(decideTrial({ domain: true, email: true, device: true, ip: true })).toEqual({ ok: false, reason: "domain_used" }));
  it("device and ip", () => {
    expect(decideTrial({ ...none, device: true })).toEqual({ ok: false, reason: "device_used" });
    expect(decideTrial({ ...none, ip: true })).toEqual({ ok: false, reason: "ip_used" });
    expect(decideTrial({ ...none, email: true })).toEqual({ ok: false, reason: "trial_used" });
  });
});

describe("SSRF guard", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "::1", "::", "fe80::1", "fc00::1", "fd00:ec2::254", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe", "ff02::1",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false));

  it.each([
    "ftp://acme.com", "file:///etc/passwd", "javascript:alert(1)", "http://user:pw@acme.com", "http://acme.com:8080",
    "http://localhost", "http://metadata.google.internal", "http://intranet", `https://acme.com/${"a".repeat(2100)}`,
  ])("rejects url %s", (u) => expect(() => parseTargetUrl(u)).toThrow(UnsafeUrlError));

  it("accepts bare domains and standard ports", () => {
    expect(parseTargetUrl("acme.com").href).toBe("https://acme.com/");
    expect(parseTargetUrl("http://acme.com:80/x").hostname).toBe("acme.com");
  });

  it("rejects literal private IP hosts and hostnames resolving to private IPs (DNS rebinding / redirect hops)", async () => {
    await expect(assertPublicHost(new URL("http://[::1]/"))).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHost(new URL("http://169.254.169.254/latest/meta-data"))).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHost(new URL("https://evil.example"), async () => ["93.184.216.34", "10.0.0.5"])).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHost(new URL("https://ok.example"), async () => ["93.184.216.34"])).resolves.toBeUndefined();
  });
});

describe("same website vs shared network", () => {
  const none = { domain: false, email: false, device: false, ip: false };
  it("the same website is always refused, whatever the network/email/device", () => {
    expect(decideTrial({ ...none, domain: true })).toEqual({ ok: false, reason: "domain_used" });
  });
  it("a different website on a shared network passes until the cap (caller passes ip = count >= IP_TRIAL_CAP)", () => {
    expect(decideTrial({ ...none, ip: false })).toEqual({ ok: true });
    expect(decideTrial({ ...none, ip: true })).toEqual({ ok: false, reason: "ip_used" });
  });
});
