import { describe, expect, it } from "vitest";
import { studioDropTick } from "../src/lifecycle/studio-drop";
import type { Db } from "../src/db";

function db(flags: Record<string, boolean>) {
  let queried = false;
  const d = {
    adsFeatureFlag: { findUnique: async ({ where }: { where: { key: string } }) => (where.key in flags ? { key: where.key, enabled: flags[where.key], updatedAt: new Date("2026-11-12T00:00:00Z") } : null) },
    $queryRawUnsafe: async () => { queried = true; return []; },
  };
  return { d: d as unknown as Db, queried: () => queried };
}
const send = async () => undefined;
const env = { LIFECYCLE_EMAIL_SECRET: "s" } as NodeJS.ProcessEnv;

describe("studio drop flags", () => {
  it("does nothing unless lifecycle_email AND studio_drop are on", async () => {
    for (const flags of [{} as Record<string, boolean>, { lifecycle_email: true }, { studio_drop: true }, { lifecycle_email: false, studio_drop: true }]) {
      const x = db(flags);
      expect(await studioDropTick({ db: x.d, provider: null, send, env })).toEqual([]);
      expect(x.queried()).toBe(false);
    }
    const on = db({ lifecycle_email: true, studio_drop: true });
    expect(await studioDropTick({ db: on.d, provider: null, send, env, now: () => new Date("2026-11-13T00:00:00Z") })).toEqual([]);
    expect(on.queried()).toBe(true);
  });
  it("needs the email secret", async () => {
    const x = db({ lifecycle_email: true, studio_drop: true });
    expect(await studioDropTick({ db: x.d, provider: null, send, env: {} as NodeJS.ProcessEnv })).toEqual([]);
    expect(x.queried()).toBe(false);
  });
});
