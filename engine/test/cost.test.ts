import { describe, expect, it } from "vitest";
import { retryDelayMs } from "../src/queue/backoff";
import { DEFAULT_PRICES, imageCostMicros, loadPrices, sumCost, textCostMicros } from "../src/providers/cost";
import { Limiter } from "../src/providers/limiter";
import { technicalChecks } from "../src/jobs/qc";

describe("cost meter", () => {
  it("prices text per token and images per quality", () => {
    expect(textCostMicros(DEFAULT_PRICES, "gpt-6.1-sol", 1_000_000, 100_000)).toBe(3_000_000);
    expect(textCostMicros(DEFAULT_PRICES, "unknown-model", 1000, 0)).toBe(2000);
    expect(imageCostMicros(DEFAULT_PRICES, "medium", 2)).toBe(84_000);
    expect(sumCost([{ costMicros: 1 }, { costMicros: 2 }])).toBe(3);
  });
  it("accepts overrides", () => {
    const p = loadPrices({ ENGINE_PRICES_JSON: JSON.stringify({ image: { low: 0.02 } }) });
    expect(imageCostMicros(p, "low")).toBe(20_000);
    expect(p.image.high).toBe(DEFAULT_PRICES.image.high);
  });
});

describe("backoff", () => {
  it("doubles and caps", () => {
    const r = () => 0.5;
    expect(retryDelayMs(1, { random: r })).toBe(10_000);
    expect(retryDelayMs(3, { random: r })).toBe(40_000);
    expect(retryDelayMs(30, { random: r })).toBe(15 * 60_000);
  });
});

describe("limiter", () => {
  it("never exceeds max concurrency", async () => {
    const l = new Limiter({ maxConcurrent: 2, maxPerWindow: 100, windowMs: 1000 });
    let cur = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        l.run(async () => {
          peak = Math.max(peak, ++cur);
          await new Promise((r) => setTimeout(r, 10));
          cur--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});

describe("qc technical checks", () => {
  it("checks exact ratio pixels and size", () => {
    const ok = technicalChecks([{ ratio: "1:1", mime: "image/png", width: 1080, height: 1080, bytes: 1000 }], ["1:1"]);
    expect(ok.every((c) => c.pass)).toBe(true);
    const bad = technicalChecks([{ ratio: "1:1", mime: "image/png", width: 1024, height: 1024, bytes: 1000 }], ["1:1", "9:16"]);
    expect(bad.filter((c) => !c.pass).map((c) => c.name)).toEqual(["dims_1:1", "file_9:16"]);
  });
});
