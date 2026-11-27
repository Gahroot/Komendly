import { describe, expect, it } from "vitest";
import { parseViewBeacon } from "../gifts";

describe("parseViewBeacon (gift page view beacon body)", () => {
  it("is human only when the page says a person interacted", () => {
    expect(parseViewBeacon({ interacted: true, signal: "input" })).toEqual({ human: true, signal: "input" });
    expect(parseViewBeacon({ interacted: true, signal: "dwell" })).toEqual({ human: true, signal: "dwell" });
    expect(parseViewBeacon({ interacted: true })).toEqual({ human: true, signal: null });
  });
  it("is not human for an old cached page, an empty body or a direct POST", () => {
    for (const b of [null, undefined, "", "yes", 1, [], {}, { interacted: false }, { interacted: "true" }, { interacted: 1 }, { signal: "input" }]) {
      expect(parseViewBeacon(b)).toEqual({ human: false, signal: null });
    }
  });
  it("drops an unknown signal label", () => {
    expect(parseViewBeacon({ interacted: true, signal: "<script>" })).toEqual({ human: true, signal: null });
  });
});
