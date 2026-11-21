// Zapier integration endpoints (/api/zapier/*): shapes, 7-day links, gating, utm_source=zapier. Prisma/S3 are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunView } from "@/lib/ads/run-types";

const state = vi.hoisted(() => ({
  user: { id: "u1", emailVerifiedAt: new Date() } as unknown as { id: string; emailVerifiedAt: Date | null } | null,
  member: true,
  paid: true,
  views: {} as Record<string, unknown>,
  recent: [] as { id: string; runId: string; updatedAt: Date }[],
  adWhere: null as unknown,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adAsset: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, storageKey: `k/${id}`, mime: id.startsWith("v") ? "video/mp4" : "image/png", ratio: "4:5", ad: { visualBrief: null } })) },
    adRun: { findUnique: async () => ({ brandProfile: { landingPage: "https://acme-hvac.com/book", url: "https://acme-hvac.com" } }) },
    ad: { findMany: async (args: { where: unknown }) => ((state.adWhere = args.where), state.recent) },
  },
}));
vi.mock("@/lib/ads/workspace", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ads/workspace")>();
  const requireUser = async () => {
    if (!state.user) throw new real.AdsHttpError(401, "unauthenticated", "Please sign in to continue.");
    return state.user;
  };
  return {
    ...real,
    requireUser,
    getOrCreateWorkspace: async () => ({ id: "w1" }),
    isPaidWorkspace: () => state.paid,
    requireWorkspaceMember: async ({ runId }: { runId: string }) => {
      const user = await requireUser();
      if (!state.member || !state.views[runId]) throw new real.AdsHttpError(404, "not_found", "Not found.");
      return { user, workspace: { id: "w1" } };
    },
  };
});
vi.mock("@/lib/ads/run-view", () => ({ loadRunView: async (id: string) => state.views[id] ?? null }));
vi.mock("@/lib/ads/storage", () => ({ presignShareable: async (key: string) => `https://s3.example.com/${key}?X-Amz-Expires=604800` }));
vi.mock("@/lib/ads/bonus-unlock", () => ({ isBonusUnlocked: async () => true }));
vi.mock("@/lib/ads/download-gate", () => ({
  DOWNLOAD_GATE_MESSAGE: "Confirm your email to download.",
  downloadNeedsVerifiedEmail: (a: { isTrial: boolean; isPaid: boolean; emailVerified: boolean }) => a.isTrial && !a.isPaid && !a.emailVerified,
}));

import { GET as runGET } from "@/app/api/zapier/runs/[id]/route";
import { GET as adsGET } from "@/app/api/zapier/ads/route";
import { systemForTouch } from "@/lib/growth/systems";
import { ZAPIER_UPGRADE_URL } from "../format";

const ORIGIN = "https://www.komendly.com";

function ad(id: string, over: Record<string, unknown> = {}) {
  return {
    id, index: 0, kind: "static", awareness: "problem", angle: "No AC in July", headline: "AC out? Fixed today", body: "Same-day repair.", cta: "Book now", status: "ready",
    assets: [
      { id: `${id}-sq`, ratio: "1:1", mime: "image/png", width: 1080, height: 1080, previewUrl: "", downloadUrl: "" },
      { id: `${id}-fd`, ratio: "4:5", mime: "image/png", width: 1080, height: 1350, previewUrl: "", downloadUrl: "" },
    ],
    ...over,
  };
}

function view(id: string, over: Partial<RunView> = {}): RunView {
  return {
    id, url: "https://acme-hvac.com", status: "completed", isTrial: false, staticCount: 3, motionCount: 0, createdAt: "2026-11-20T10:00:00.000Z", completedAt: "2026-11-20T10:05:00.000Z",
    error: null, bonusPending: false, ads: [ad("a1"), ad("a2", { status: "rendering", assets: [] }), ad("a3", { locked: true, assets: [] })],
    ...over,
  } as unknown as RunView;
}

const call = (path: string) => new Request(`${ORIGIN}${path}`, { headers: { authorization: "Bearer kmd_x" } });

beforeEach(() => {
  state.user = { id: "u1", emailVerifiedAt: new Date() };
  state.member = true;
  state.paid = true;
  state.views = { r1: view("r1") };
  state.recent = [];
});

describe("growth system", () => {
  it("attributes utm_source=zapier and every upgrade link carries it", () => {
    expect(systemForTouch({ utm_source: "zapier" })).toBe("zapier");
    expect(new URL(ZAPIER_UPGRADE_URL).searchParams.get("utm_source")).toBe("zapier");
  });
});

describe("GET /api/zapier/runs/:id", () => {
  it("returns the pack with flat fields, 4:5-first image links and upgrade link", async () => {
    const res = await runGET(call("/api/zapier/runs/r1"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "r1", run_id: "r1", status: "completed", done: true, ready_count: 2, total_count: 3, locked_count: 1, view_url: `${ORIGIN}/ads/runs/r1`, upgrade_url: ZAPIER_UPGRADE_URL });
    const [a1, a2, a3] = body.ads;
    expect(a1.image_url).toBe("https://s3.example.com/k/a1-fd?X-Amz-Expires=604800");
    expect(a1.image_urls).toHaveLength(2);
    expect(a1).toMatchObject({ landing_url: "https://acme-hvac.com/book", cta_type: "BOOK_NOW", upgrade_url: ZAPIER_UPGRADE_URL });
    expect(a2.image_url).toBeNull();
    expect(a3).toMatchObject({ status: "locked", image_url: null });
    expect(body.image_urls).toEqual(a1.image_urls);
    expect(Date.parse(body.links_expire_at) - Date.now()).toBeGreaterThan(6 * 86400_000);
  });

  it("gives no links while the email gate applies, with a note", async () => {
    state.paid = false;
    state.user = { id: "u1", emailVerifiedAt: null };
    state.views = { r1: view("r1", { isTrial: true }) };
    const body = await (await runGET(call("/api/zapier/runs/r1"), { params: Promise.resolve({ id: "r1" }) })).json();
    expect(body.image_urls).toEqual([]);
    expect(body.download_note).toMatch(/Confirm your email/);
  });

  it("keeps polling while a bonus is pending, 404s for other workspaces, 401s without a key", async () => {
    state.views = { r1: view("r1", { bonusPending: true }) };
    expect((await (await runGET(call("/api/zapier/runs/r1"), { params: Promise.resolve({ id: "r1" }) })).json()).done).toBe(false);
    state.member = false;
    expect((await runGET(call("/api/zapier/runs/r1"), { params: Promise.resolve({ id: "r1" }) })).status).toBe(404);
    state.user = null;
    expect((await runGET(call("/api/zapier/runs/r1"), { params: Promise.resolve({ id: "r1" }) })).status).toBe(401);
  });
});

describe("GET /api/zapier/ads", () => {
  it("lists only deliverable ready ads, newest first, scoped to the workspace", async () => {
    state.views = { r1: view("r1"), r2: view("r2", { ads: [ad("b1")] as unknown as RunView["ads"] }) };
    state.recent = [
      { id: "b1", runId: "r2", updatedAt: new Date("2026-11-21T09:00:00Z") },
      { id: "a3", runId: "r1", updatedAt: new Date("2026-11-20T10:04:00Z") },
      { id: "a1", runId: "r1", updatedAt: new Date("2026-11-20T10:03:00Z") },
    ];
    const res = await adsGET(call("/api/zapier/ads?limit=500&run_id="));
    expect(res.status).toBe(200);
    const { ads } = await res.json();
    expect(ads.map((a: { id: string }) => a.id)).toEqual(["b1", "a1"]);
    expect(ads[0]).toMatchObject({ run_id: "r2", created_at: "2026-11-21T09:00:00.000Z", upgrade_url: ZAPIER_UPGRADE_URL });
    expect(ads[0].image_url).toMatch(/^https:\/\/s3\.example\.com\//);
    expect(state.adWhere).toMatchObject({ workspaceId: "w1", status: "ready", run: { kind: { notIn: ["gift", "nurture"] } } });
  });

  it("401s without a key", async () => {
    state.user = null;
    expect((await adsGET(call("/api/zapier/ads"))).status).toBe(401);
  });
});
