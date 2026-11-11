import { describe, expect, it } from "vitest";
import { coarseIpNet, isMetaIp } from "@/lib/ads/meta-ip";

describe("isMetaIp", () => {
  it("matches Meta IPv4/IPv6 ranges only", () => {
    expect(isMetaIp("173.252.83.12")).toBe(true);
    expect(isMetaIp("66.220.149.1")).toBe(true);
    expect(isMetaIp("::ffff:31.13.115.2")).toBe(true);
    expect(isMetaIp("2a03:2880:f12f:83::1")).toBe(true);
    expect(isMetaIp("2a03:83e0::5")).toBe(true);
    expect(isMetaIp("8.8.8.8")).toBe(false);
    expect(isMetaIp("173.252.128.1")).toBe(false);
    expect(isMetaIp("2a03:2881::1")).toBe(false);
    expect(isMetaIp("garbage")).toBe(false);
    expect(isMetaIp(undefined)).toBe(false);
  });
});

describe("coarseIpNet", () => {
  it("keeps only /24 or /48", () => {
    expect(coarseIpNet("173.252.83.12")).toBe("173.252.83.0/24");
    expect(coarseIpNet("2a03:2880:f12f:83::1")).toBe("2a03:2880:f12f::/48");
    expect(coarseIpNet("nope")).toBeUndefined();
  });
});
