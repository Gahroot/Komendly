import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(), getCookieUser: vi.fn() }));
vi.mock("@/lib/ads/events", () => ({ trackAdsEvent: vi.fn() }));
vi.mock("@/lib/ads/meta/connection", () => ({ publisherForWorkspace: vi.fn() }));

import type { AdsWorkspace, PrismaClient, User } from "@prisma/client";
import { authorizationText, TEAM_PAUSE_JOB, TEAM_TERMS_VERSION } from "../contracts";
import { authorizeTeam, changeTeam, deleteLead, type TeamAccess, type TeamDeps } from "../server";
import { stopTeamFor } from "../stop";
import { adAccountNameFromText, hiresTeam, planOwnerChange, statusLine, teamNumbers } from "../rules";

const NOW = new Date("2026-11-22T17:00:00Z");
const ws = (over: Partial<AdsWorkspace> = {}) => ({ id: "ws1", name: "Joe's workspace", ownerId: "u1", adsPlan: "ad_department", subscriptionStatus: "active", suspendedAt: null, ...over }) as AdsWorkspace;
const access = (over: Partial<TeamAccess> = {}): TeamAccess => ({ user: { id: "u1", email: "joe@biz.com" } as User, workspace: ws(), role: "owner", ...over });
const body = { monthlyLimit: 600, zips: "94110", leadEmail: "joe@biz.com", agreed: true };

function fakeDb(o: { mandate?: Record<string, unknown> | null; conn?: { adAccountId: string | null; pageId: string | null } | null; mtd?: number } = {}) {
  const calls: Record<string, unknown[]> = { upsert: [], update: [], action: [], job: [], leadUpdate: [] };
  let mandate = o.mandate ?? null;
  const db = {
    marketingMandate: {
      findUnique: vi.fn(async () => mandate),
      upsert: vi.fn(async (a: { create: Record<string, unknown>; update: Record<string, unknown> }) => { calls.upsert.push(a); mandate = { ...(mandate ?? a.create), ...(mandate ? a.update : {}), launchedAt: null, campaignId: null, stateReason: null }; return mandate; }),
      update: vi.fn(async (a: { data: Record<string, unknown> }) => { calls.update.push(a.data); mandate = { ...mandate!, ...a.data }; return mandate; }),
    },
    metaConnection: { findUnique: vi.fn(async () => (o.conn === undefined ? { adAccountId: "act_1", pageId: "p1" } : o.conn)) },
    brandProfile: { findFirst: vi.fn(async () => ({ name: "Joe's Plumbing" })) },
    marketingAction: { create: vi.fn(async (a: { data: unknown }) => { calls.action.push(a.data); return a.data; }) },
    adPerformanceDay: { aggregate: vi.fn(async () => ({ _sum: { spendMinor: o.mtd ?? 0 } })) },
    adJob: { findFirst: vi.fn(async () => null), create: vi.fn(async (a: { data: unknown }) => { calls.job.push(a.data); return { id: "job1" }; }) },
    metaLead: { updateMany: vi.fn(async (a: unknown) => { calls.leadUpdate.push(a); return { count: (a as { where: { workspaceId: string } }).where.workspaceId === "ws1" ? 1 : 0 }; }) },
    adsEvent: { findFirst: vi.fn(async () => null) },
  };
  return { db: db as unknown as PrismaClient, calls, raw: db };
}

const deps = (db: PrismaClient, over: Partial<TeamDeps> = {}): Partial<TeamDeps> => ({
  db, now: () => NOW, track: vi.fn(async () => undefined),
  loadMetaAccounts: async () => ({ adAccounts: [{ id: "act_1", name: "Joe Ads", currency: "USD", status: 1, hasPayment: true }], pages: [{ id: "p1", name: "Joe's Plumbing" }] }),
  ...over,
});

const activeMandate = (over: Record<string, unknown> = {}) => ({
  status: "active", state: "live", stateReason: null, monthlyLimitMinor: 600_00, currency: "USD", zips: ["94110"], leadEmail: "joe@biz.com", privacyUrl: null,
  adAccountId: "act_1", pageId: "p1", authorizedAt: new Date("2026-11-01"), authorizedByUserId: "u1", termsVersion: TEAM_TERMS_VERSION, launchedAt: null, campaignId: "c1",
  authorizationText: authorizationText({ monthlyLimitMinor: 600_00, currency: "USD", adAccountName: "Joe Ads", businessName: "Joe's Plumbing" }), ...over,
});

describe("authorize gating", () => {
  it("stores the exact text, version, user and time, and starts pending", async () => {
    const { db, calls } = fakeDb();
    const d = deps(db);
    const m = await authorizeTeam(access(), body, d);
    const create = (calls.upsert[0] as { create: Record<string, unknown> }).create;
    expect(create).toMatchObject({ status: "active", state: "pending", monthlyLimitMinor: 600_00, zips: ["94110"], adAccountId: "act_1", pageId: "p1", authorizedByUserId: "u1", termsVersion: TEAM_TERMS_VERSION, authorizedAt: NOW });
    expect(m.authorizationText).toBe(authorizationText({ monthlyLimitMinor: 600_00, currency: "USD", adAccountName: "Joe Ads", businessName: "Joe's Plumbing" }));
    expect(calls.action[0]).toMatchObject({ kind: "authorized", role: "director" });
    expect(d.track).toHaveBeenCalledWith("team_authorized", expect.anything());
  });
  it("refuses non-owners, missing plan, suspension, missing Meta and an already active team", async () => {
    await expect(authorizeTeam(access({ role: "member" }), body, deps(fakeDb().db))).rejects.toMatchObject({ code: "owner_only" });
    await expect(authorizeTeam(access({ workspace: ws({ adsPlan: "starter" }) }), body, deps(fakeDb().db))).rejects.toMatchObject({ code: "needs_plan" });
    await expect(authorizeTeam(access({ workspace: ws({ suspendedAt: new Date() }) }), body, deps(fakeDb().db))).rejects.toMatchObject({ code: "needs_plan" });
    await expect(authorizeTeam(access(), body, deps(fakeDb({ conn: null }).db))).rejects.toMatchObject({ code: "meta_not_connected" });
    await expect(authorizeTeam(access(), body, deps(fakeDb({ conn: { adAccountId: "act_1", pageId: null } }).db))).rejects.toMatchObject({ code: "meta_selection" });
    await expect(authorizeTeam(access(), body, deps(fakeDb({ mandate: activeMandate() }).db))).rejects.toMatchObject({ code: "already_hired" });
  });
  it("needs the tick, a ready account, and the text the owner saw", async () => {
    await expect(authorizeTeam(access(), { ...body, agreed: false }, deps(fakeDb().db))).rejects.toMatchObject({ code: "invalid" });
    const noPay = deps(fakeDb().db, { loadMetaAccounts: async () => ({ adAccounts: [{ id: "act_1", name: "Joe Ads", status: 1, hasPayment: false }], pages: [{ id: "p1", name: "P" }] }) });
    await expect(authorizeTeam(access(), body, noPay)).rejects.toMatchObject({ code: "not_ready" });
    await expect(authorizeTeam(access(), { ...body, authorizationText: "something else" }, deps(fakeDb().db))).rejects.toMatchObject({ code: "text_changed" });
    const down = deps(fakeDb().db, { loadMetaAccounts: async () => { throw new Error("boom"); } });
    await expect(authorizeTeam(access(), body, down)).rejects.toMatchObject({ code: "meta_unreachable" });
  });
  it("Agency counts as hired; Starter checkouts don't land on the team page", () => {
    expect(hiresTeam("plan", "agency")).toBe(true);
    expect(hiresTeam("offer", "ad_department")).toBe(true);
    expect(hiresTeam("plan", "starter")).toBe(false);
    expect(hiresTeam("topup", "ad_department")).toBe(false);
  });
});

describe("owner changes (PATCH)", () => {
  const cur = { status: "active", monthlyLimitMinor: 600_00, currency: "USD", zips: ["94110"], leadEmail: "joe@biz.com", privacyUrl: null };
  it("pauses at once without re-authorizing, and enqueues the pause job", async () => {
    const { db, calls } = fakeDb({ mandate: activeMandate() });
    const m = await changeTeam(access({ role: "member" }), { action: "pause" }, deps(db));
    expect(m.status).toBe("paused");
    expect(calls.job[0]).toMatchObject({ type: TEAM_PAUSE_JOB, workspaceId: "ws1", payload: { workspaceId: "ws1", reason: "owner_paused" } });
    expect(calls.action[0]).toMatchObject({ kind: "owner_paused" });
    expect(planOwnerChange({ ...cur, status: "paused" }, { action: "pause" }, { monthToDateMinor: 0 })).toEqual({ ok: true, noop: true });
  });
  it("resume and limit changes need the tick and re-store the authorization", async () => {
    expect(planOwnerChange({ ...cur, status: "paused" }, { action: "resume" }, { monthToDateMinor: 0 })).toMatchObject({ ok: false, code: "invalid" });
    expect(planOwnerChange(cur, { action: "update", monthlyLimit: 800 }, { monthToDateMinor: 0 })).toMatchObject({ ok: false });
    expect(planOwnerChange(cur, { action: "resume", agreed: true }, { monthToDateMinor: 0 })).toMatchObject({ ok: false, code: "already_active" });
    const { db, calls } = fakeDb({ mandate: activeMandate({ status: "paused" }) });
    const m = await changeTeam(access(), { action: "resume", agreed: true, monthlyLimit: 500 }, deps(db));
    expect(m.status).toBe("active");
    expect(m.monthlyLimitMinor).toBe(500_00);
    expect(m.authorizationText).toContain("$500 per calendar month");
    expect(m.authorizationText).toContain('"Joe Ads"');
    expect(calls.update[0]).toMatchObject({ authorizedAt: NOW, authorizedByUserId: "u1", termsVersion: TEAM_TERMS_VERSION });
    expect(calls.job).toHaveLength(0);
  });
  it("only the owner can resume or change the limit; resuming needs a live plan", async () => {
    await expect(changeTeam(access({ role: "member" }), { action: "update", agreed: true, monthlyLimit: 400 }, deps(fakeDb({ mandate: activeMandate() }).db))).rejects.toMatchObject({ code: "owner_only" });
    await expect(changeTeam(access({ workspace: ws({ subscriptionStatus: "canceled" }) }), { action: "resume", agreed: true }, deps(fakeDb({ mandate: activeMandate({ status: "stopped" }) }).db))).rejects.toMatchObject({ code: "needs_plan" });
  });
  it("lowering below this month's spend pauses now; raising never does", async () => {
    const low = planOwnerChange(cur, { action: "update", agreed: true, monthlyLimit: 300 }, { monthToDateMinor: 350_00 });
    expect(low).toMatchObject({ ok: true, pauseReason: "limit_below_spend", update: { monthlyLimitMinor: 300_00 } });
    const up = planOwnerChange(cur, { action: "update", agreed: true, monthlyLimit: 900 }, { monthToDateMinor: 350_00 });
    expect(up).toMatchObject({ ok: true, pauseReason: null });
    expect(planOwnerChange(cur, { action: "update", agreed: true, zips: "94110 94114" }, { monthToDateMinor: 0 })).toMatchObject({ ok: true, update: { zips: ["94110", "94114"] } });
    expect(planOwnerChange(cur, { action: "update", agreed: true }, { monthToDateMinor: 0 })).toEqual({ ok: true, noop: true });
  });
  it("reads the agreed account name back from the stored text", () => {
    expect(adAccountNameFromText(activeMandate().authorizationText)).toBe("Joe Ads");
  });
});

describe("leads", () => {
  it("soft-deletes only inside the caller's workspace and wipes personal details", async () => {
    const { db, calls } = fakeDb();
    await deleteLead(access(), "lead1", deps(db));
    expect(calls.leadUpdate[0]).toMatchObject({ where: { id: "lead1", workspaceId: "ws1", deletedAt: null }, data: { deletedAt: NOW, name: null, email: null, phone: null } });
    await expect(deleteLead(access({ workspace: ws({ id: "other" }) }), "lead1", deps(db))).rejects.toMatchObject({ status: 404 });
  });
});

describe("stop paths", () => {
  it("stops once, never downgrades stopped to paused, always enqueues the pause", async () => {
    const a = fakeDb({ mandate: activeMandate() });
    expect(await stopTeamFor("ws1", { status: "stopped", reason: "refund", summary: "x" }, a.db)).toBe(true);
    expect(a.calls.update[0]).toEqual({ status: "stopped" });
    expect(a.calls.job[0]).toMatchObject({ type: TEAM_PAUSE_JOB, payload: { reason: "refund" } });
    const b = fakeDb({ mandate: activeMandate({ status: "stopped" }) });
    await stopTeamFor("ws1", { status: "paused", reason: "suspended", summary: "x" }, b.db);
    expect(b.calls.update).toHaveLength(0);
    expect(b.calls.action).toHaveLength(0);
    expect(await stopTeamFor("ws1", { status: "stopped", reason: "refund", summary: "x" }, fakeDb().db)).toBe(false);
  });
});

describe("dashboard view (honest labels)", () => {
  it("says unknown with no Meta data instead of zero", () => {
    const n = teamNumbers({ perfRows: [], leadsReceived: 0, now: NOW, monthlyLimitMinor: 600_00 });
    expect(n.spend).toMatchObject({ value: null, certainty: "unknown" });
    expect(n.projected.certainty).toBe("unknown");
    expect(n.costPerLead.certainty).toBe("unknown");
    expect(n.leadsReceived).toMatchObject({ value: 0, certainty: "measured" });
  });
  it("labels spend measured and projection estimated, capped at the limit", () => {
    const n = teamNumbers({ perfRows: [{ spendMinor: 500_00, leads: 3 }], leadsReceived: 4, now: NOW, monthlyLimitMinor: 600_00 });
    expect(n.spend).toMatchObject({ value: 500_00, certainty: "measured" });
    expect(n.projected).toMatchObject({ value: 600_00, certainty: "estimated" });
    expect(n.costPerLead).toMatchObject({ value: 125_00, certainty: "measured" });
    expect(n.metaLeads).toMatchObject({ value: 3, certainty: "measured" });
  });
  it("status line follows owner intent first, then the engine's state", () => {
    expect(statusLine({ status: "paused", state: "live", stateReason: null, launchedAt: null }, true)).toMatch(/Pausing/);
    expect(statusLine({ status: "active", state: "blocked", stateReason: "Add a payment method in Meta.", launchedAt: null }, true)).toBe("Add a payment method in Meta.");
    expect(statusLine(null, false)).toMatch(/Hire/);
  });
});
