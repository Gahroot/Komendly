import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const s = vi.hoisted(() => ({ jobs: [] as Array<{ type: string; payload: Record<string, unknown> }>, events: [] as string[], uploads: [] as Array<{ id: string; status: string; mime: string; filename: string }>, safe: true }));

vi.mock("@/lib/prisma", () => {
  const tx = {
    studioSession: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "sess1", ...data, createdAt: new Date(), updatedAt: new Date() })) },
    studioUpload: { updateMany: vi.fn(async () => ({ count: 1 })) },
    studioMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: data.role === "user" ? "u1" : "a1", ...data, createdAt: new Date() })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "a1", role: "assistant", status: "queued", ...data, createdAt: new Date() })),
    },
    adJob: { create: vi.fn(async ({ data }: { data: { type: string; payload: Record<string, unknown> } }) => { s.jobs.push(data); return { id: `job${s.jobs.length}` }; }) },
  };
  return {
    prisma: {
      ...tx,
      studioUpload: { ...tx.studioUpload, findMany: vi.fn(async () => s.uploads) },
      studioSession: { ...tx.studioSession, count: vi.fn(async () => 0) },
      adsWorkspace: { findUniqueOrThrow: vi.fn(async () => ({ id: "w1", studioFreeVideos: 1, adsPlan: "trial" })) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("@/lib/studio/server", () => ({
  studioAccess: vi.fn(async () => ({ user: { id: "user1", email: "a@b.com" }, workspace: { id: "w1", suspendedAt: null, studioFreeVideos: 1 } })),
  sessionSummary: (x: { id: string; title: string }) => ({ id: x.id, title: x.title }),
  messageView: (x: { id: string; content?: string }) => ({ id: x.id, content: x.content ?? "" }),
}));
vi.mock("@/lib/ads/abuse", () => ({ rateLimit: vi.fn(async () => true), assertSafeTargetUrl: vi.fn(async () => { if (!s.safe) throw new Error("blocked"); }) }));
vi.mock("@/lib/ads/credits", () => ({ getBalance: vi.fn(async () => 0) }));
vi.mock("@/lib/ads/events", () => ({ trackAdsEvent: vi.fn(async (name: string) => { s.events.push(name); }) }));
vi.mock("@/lib/ads/run", () => ({ DEVICE_COOKIE: "kmd_dev", fingerprintFrom: () => ({}), PRIORITY: { paid: 10, trial: 0 } }));
vi.mock("@/lib/ads/workspace", async () => {
  class AdsHttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
  return {
    AdsHttpError,
    isPaidWorkspace: () => false,
    adsErrorResponse: (e: unknown) => e instanceof AdsHttpError ? Response.json({ error: e.message, code: e.code }, { status: e.status }) : Response.json({ error: String(e) }, { status: 500 }),
  };
});
vi.mock("@/lib/ads/billing-config", () => ({ concurrentLimit: () => 1, isUnlimitedPlan: () => false, UNLIMITED_BUSY_MESSAGE: "busy" }));
vi.mock("@/lib/studio/abuse", () => ({ claimStudioFreeVideo: vi.fn(async () => ({ ok: true })), revokeStudioFreeVideos: vi.fn() }));

const { POST } = await import("../route");
const { normalizeLaunchUrl } = await import("@/lib/studio/contracts");
const { isJobCreatingRoute } = await import("@/lib/agent-keys/policy");
const req = (body: unknown) => new NextRequest("http://x/api/studio/launch", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/studio/launch", () => {
  beforeEach(() => { s.jobs = []; s.events = []; s.uploads = []; s.safe = true; });

  it("queues a capture job for a public URL", async () => {
    const r = await POST(req({ url: "komendly.com", notes: "We launched Remix" }));
    expect(r.status).toBe(201);
    const j = (await r.json()) as { session: { title: string }; url: string };
    expect(j.session.title).toBe("Launch video · komendly.com");
    expect(j.url).toBe("/studio/sess1");
    expect(s.jobs).toHaveLength(1);
    expect(s.jobs[0]).toMatchObject({ type: "studio_capture", payload: { url: "https://komendly.com/", aspect: "16:9", notes: "We launched Remix", sessionId: "sess1", userMessageId: "u1", assistantMessageId: "a1" } });
    expect(s.events).toContain("studio_launch_started");
  });

  it("queues the launch turn directly with uploaded clips (local app)", async () => {
    s.uploads = [{ id: "up1", status: "uploaded", mime: "video/mp4", filename: "hero.mp4" }];
    const r = await POST(req({ url: "http://localhost:3000", aspect: "9:16", uploadIds: ["up1"], footage: [{ filename: "hero.mp4", shows: "landing page" }] }));
    expect(r.status).toBe(201);
    expect(s.jobs[0]).toMatchObject({ type: "studio_turn", payload: { launch: { url: "http://localhost:3000/", aspect: "9:16", footage: [{ filename: "hero.mp4", shows: "landing page" }] } } });
  });

  it("refuses private addresses without a local recording, and bad uploads", async () => {
    expect((await POST(req({ url: "http://localhost:3000" }))).status).toBe(400);
    s.safe = false;
    expect((await POST(req({ url: "https://internal.example.com" }))).status).toBe(400);
    s.uploads = [];
    expect((await POST(req({ url: "http://localhost:3000", uploadIds: ["nope"] }))).status).toBe(404);
    expect(s.jobs).toHaveLength(0);
  });
});

describe("launch helpers", () => {
  it("normalizes launch URLs", () => {
    expect(normalizeLaunchUrl("yourapp.com")).toBe("https://yourapp.com/");
    expect(normalizeLaunchUrl("localhost:3000")).toBeNull();
    expect(normalizeLaunchUrl("localhost:3000", { local: true })).toBe("http://localhost:3000/");
    expect(normalizeLaunchUrl("ftp://x.com")).toBeNull();
  });
  it("counts as a job-creating route for agent keys", () => {
    expect(isJobCreatingRoute("POST /api/studio/launch")).toBe(true);
  });
});
