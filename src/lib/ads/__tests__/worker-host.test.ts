import { describe, expect, it } from "vitest";
import { workerHost } from "../worker-host";

describe("workerHost", () => {
  it("labels Railway containers, local workers, providers and explicit meta", () => {
    expect(workerHost("worker:7dbaac2f0979:1", "worker", {})).toBe("railway");
    expect(workerHost("worker:benchmark:1613", "worker", {})).toBe("local");
    expect(workerHost("worker:local-smoke", "worker", {})).toBe("local");
    expect(workerHost("seed-worker-1", "worker", {})).toBe("unknown");
    expect(workerHost("provider:codex", "provider", {})).toBe("provider");
    expect(workerHost("worker:abc:1", "worker", { host: "railway" })).toBe("railway");
  });
});
