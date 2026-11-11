import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundleOzzyWorker } from "../../../../scripts/build-ozzy-worker.mjs";
import { SDF_WORKER_VERSION } from "../sdf/worker-version";

describe("Ozzy SDF worker bundle", () => {
  it("public/ozzy/sdf-worker.js is up to date (run: node scripts/build-ozzy-worker.mjs)", async () => {
    const { code, version } = await bundleOzzyWorker();
    expect(readFileSync("public/ozzy/sdf-worker.js", "utf8")).toBe(code);
    expect(SDF_WORKER_VERSION).toBe(version);
  });
});
