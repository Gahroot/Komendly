import { describe, expect, it } from "vitest";
import { chooseStudioBrain, codexWeeklyPctSeen, isCodexLimitError, mimoAuth } from "../src/studio/brain";

describe("studio brain", () => {
  const base = { forced: null, atPct: 90, hasMimo: true, hasCodex: true };
  it("uses Codex until the weekly window reaches the threshold, then MiMo", () => {
    expect(chooseStudioBrain({ ...base, codexPct: 82 })).toBe("codex");
    expect(chooseStudioBrain({ ...base, codexPct: 90 })).toBe("mimo");
    expect(chooseStudioBrain({ ...base, codexPct: null })).toBe("codex");
  });
  it("never picks MiMo without its key; forcing works", () => {
    expect(chooseStudioBrain({ ...base, codexPct: 99, hasMimo: false })).toBe("codex");
    expect(chooseStudioBrain({ ...base, codexPct: 10, forced: "mimo" })).toBe("mimo");
    expect(chooseStudioBrain({ ...base, codexPct: 99, forced: "codex" })).toBe("codex");
    expect(chooseStudioBrain({ ...base, codexPct: 10, hasCodex: false })).toBe("mimo");
  });
  it("spots Codex plan-limit failures only", () => {
    expect(isCodexLimitError("You've hit your usage limit. Try again in 3 days.")).toBe(true);
    expect(isCodexLimitError("429 Too Many Requests")).toBe(true);
    expect(isCodexLimitError("render failed: ffmpeg exited 1")).toBe(false);
    expect(isCodexLimitError(undefined)).toBe(false);
  });
  it("reads the key from env and Kly's fresh heartbeat only", async () => {
    expect(mimoAuth({})).toBeNull();
    expect(mimoAuth({ XIAOMI_API_KEY: "tp-x" })?.baseUrl).toContain("token-plan");
    const db = (updatedAt: Date, pct: unknown) => ({ engineHeartbeat: { findUnique: async () => ({ meta: { codexWeeklyPct: pct }, updatedAt }) } });
    const now = Date.now();
    expect(await codexWeeklyPctSeen(db(new Date(now - 60_000), 91), now)).toBe(91);
    expect(await codexWeeklyPctSeen(db(new Date(now - 2 * 3600_000), 91), now)).toBeNull();
  });
});
