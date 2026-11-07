import { describe, expect, it } from "vitest";
import { runStage } from "../run-stage";
import type { AdView } from "../run-types";

const ad = (status: AdView["status"]) => ({ status }) as AdView;

describe("runStage", () => {
  it("maps statuses to honest stages", () => {
    expect(runStage({ status: "extracting", ads: [], extraction: null }).stage).toBe("reading");
    expect(runStage({ status: "awaiting_confirm", ads: [], extraction: null }).stage).toBe("reading");
    expect(runStage({ status: "awaiting_confirm", ads: [], extraction: {} as never }).stage).toBe("review");
    expect(runStage({ status: "queued", ads: [], extraction: null }).stage).toBe("building");
    expect(runStage({ status: "failed", ads: [], extraction: null }).rail).toBe(0);
  });
  it("counts only real ad states", () => {
    const s = runStage({ status: "generating", ads: [ad("ready"), ad("rendering"), ad("failed_qc"), ad("planned")], extraction: null });
    expect(s).toMatchObject({ ready: 1, total: 4, failed: 1, rail: 2 });
    expect(runStage({ status: "generating", ads: [ad("ready")], extraction: null, staticCount: 10, motionCount: 1 }).total).toBe(11);
  });
});
