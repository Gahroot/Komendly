import { describe, expect, it } from "vitest";
import { pendingRunDomain, startHref } from "../url-submit";

describe("pendingRunDomain", () => {
  it("reads the site from a pending-run next path", () => {
    expect(pendingRunDomain("/ads/start?url=https%3A%2F%2Fwww.JoesPlumbing.com%2Fabout&goal=auto")).toBe("joesplumbing.com");
    expect(pendingRunDomain("/ads/start?url=maxteriors.com&goal=leads")).toBe("maxteriors.com");
  });

  it("round-trips what the landing form sends to sign-up", () => {
    const next = decodeURIComponent(startHref(" maxteriors.com ", "auto", false).split("next=")[1]);
    expect(pendingRunDomain(next)).toBe("maxteriors.com");
  });

  it("is null for anything that isn't a pending run", () => {
    expect(pendingRunDomain(null)).toBeNull();
    expect(pendingRunDomain("/dashboard")).toBeNull();
    expect(pendingRunDomain("/ads/start?goal=auto")).toBeNull();
    expect(pendingRunDomain("/ads/start?url=not a site")).toBeNull();
  });
});
