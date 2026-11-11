import { describe, expect, it } from "vitest";
import { sseComment, sseEvent } from "../sse";

describe("sse", () => {
  it("frames id, event and JSON data with bigint as string", () => {
    expect(sseEvent("12", { n: BigInt(5), t: "a" }, "end")).toBe('id: 12\nevent: end\ndata: {"n":"5","t":"a"}\n\n');
    expect(sseEvent(null, { a: 1 })).toBe('data: {"a":1}\n\n');
  });
  it("comments are single-line", () => {
    expect(sseComment("pi\nng")).toBe(": pi ng\n\n");
  });
});
