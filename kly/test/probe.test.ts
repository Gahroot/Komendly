import { describe, expect, it } from "vitest";
import { pickSeed, PROBE_GMAIL_PER_DAY } from "../src/probe";
import type { StoredMailbox } from "../src/mailboxes";

const box = (address: string, provider: string) => ({ id: address, address, provider, domain: address.split("@")[1] ?? "", row: { warmupEnabled: true } }) as unknown as StoredMailbox;

describe("cold spam check seed", () => {
  const from = box("a@trykomendly.com", "maildoso");
  const boxes = [from, box("b@trykomendly.com", "maildoso"), box("c@usekomendly.com", "maildoso"), box("hello@getkomendly.com", "gmail")];
  it("prefers our Google inbox while under the daily cap", () => {
    expect(pickSeed(from, boxes, 0, 0.3)?.address).toBe("hello@getkomendly.com");
  });
  it("falls back to a peer on another domain, never the same domain", () => {
    expect(pickSeed(from, boxes, PROBE_GMAIL_PER_DAY, 0.9)?.address).toBe("c@usekomendly.com");
  });
});
