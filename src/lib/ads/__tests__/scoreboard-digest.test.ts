import { describe, expect, it } from "vitest";
import { buildScoreboard, checkpointRows, lastWeeks, type ScoreSignup } from "../scoreboard";
import { digestFlags, digestMessage } from "../scoreboard-digest";

const now = new Date("2026-11-23T14:00:00Z");
const weeks = lastWeeks(8, now);
const cps = (paying: number) => checkpointRows({ freePackWorkspaces: 36, freePackPaid: paying, verifiedLeadsAvailable: 507, emailsPerDay: 15, signupsLast7d: 30, channelsLast7d: 2, payingCustomers: paying, customersWithAdsLive: 0 });
const signups = (perWeek: number[]): ScoreSignup[] =>
  perWeek.flatMap((n, i) => Array.from({ length: n }, (_, j) => ({ workspaceId: `w${i}-${j}`, at: new Date(`${weeks[weeks.length - perWeek.length + i]}T12:00:00Z`), channel: "meta" as const })));

describe("weekly scoreboard digest", () => {
  it("flags rising sign-ups with zero payments", () => {
    const board = buildScoreboard(signups([5, 10, 20]), [], weeks);
    expect(digestFlags({ board, checkpoints: cps(0), klySendsTotal: 100, now })[0]).toMatch(/fix the offer/);
  });
  it("flags Kly after 500 sends with no sign-ups, and nothing when healthy", () => {
    const board = buildScoreboard(signups([3, 2, 1]), [{ workspaceId: "w0-0", at: now, amountCents: 9700, what: "plan" }], weeks);
    expect(digestFlags({ board, checkpoints: cps(1), klySendsTotal: 600, now })).toEqual([expect.stringMatching(/Kly cold email: 600/)]);
    expect(digestFlags({ board, checkpoints: cps(1), klySendsTotal: 100, now })).toEqual([]);
  });
  it("after 15 Dec, flags missed checkpoints", () => {
    const board = buildScoreboard([], [], weeks);
    expect(digestFlags({ board, checkpoints: cps(0), klySendsTotal: 0, now: new Date("2026-12-21T14:00:00Z") }).join(" ")).toMatch(/propose a new date/);
  });
  it("message shows paying count and the admin link", () => {
    const board = buildScoreboard(signups([1]), [], weeks);
    const m = digestMessage({ board, checkpoints: cps(0), klySendsTotal: 0, now }, "https://www.komendly.com/admin/ads/scoreboard");
    expect(m.subject).toMatch(/^Scoreboard: 0\/10 paying/);
    expect(m.text).toContain("https://www.komendly.com/admin/ads/scoreboard");
  });
});
