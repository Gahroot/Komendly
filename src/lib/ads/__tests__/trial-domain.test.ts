import { describe, expect, it } from "vitest";
import { trialDomainFor } from "../trial-domain";
import { decideTrial } from "../abuse";

describe("trialDomainFor", () => {
  it("collapses subdomains, paths and schemes to one registrable domain", () => {
    expect(trialDomainFor("acme.com")).toBe("acme.com");
    expect(trialDomainFor("https://www.acme.com/pricing?x=1")).toBe("acme.com");
    expect(trialDomainFor("http://shop.acme.com")).toBe("acme.com");
    expect(trialDomainFor("WWW.Bakery.co.uk/")).toBe("bakery.co.uk");
  });
  it("returns null for junk and private hosts", () => {
    expect(trialDomainFor("")).toBeNull();
    expect(trialDomainFor("localhost:3000")).toBeNull();
    expect(trialDomainFor("ftp://acme.com")).toBeNull();
  });
  it("a used domain blocks the trial before anything else", () => {
    expect(decideTrial({ domain: true, email: false, device: false, ip: false })).toEqual({ ok: false, reason: "domain_used" });
  });
});
