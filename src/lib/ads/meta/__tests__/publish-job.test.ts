import { describe, expect, it } from "vitest";
import { handlePublishMeta, prismaPublishStore } from "../../../../../engine/src/jobs/publish-meta";
import type { JobContext } from "../../../../../engine/src/jobs/context";
import type { MetaPublisher } from "../core/types";

type Row = { adId: string; ratio: string; jobId: string; status: string; metaAdId?: string | null; campaignId?: string | null; error?: string | null };

function fakeDb(rows: Row[]) {
  const qcPass = { pass: true };
  const ads = [
    { id: "a1", index: 0, headline: "H1", body: "B", cta: "Shop now", status: "ready", qcReport: qcPass, assets: [
      { ratio: "1:1", storageKey: "k1", mime: "image/png" }, { ratio: "9:16", storageKey: "k2", mime: "image/png" }] },
    { id: "a2", index: 1, headline: "H2", body: null, cta: null, status: "failed_qc", qcReport: { pass: false }, assets: [{ ratio: "1:1", storageKey: "k3", mime: "image/png" }] },
  ];
  const events: unknown[] = [];
  const db = {
    adRun: { findUniqueOrThrow: async () => ({ goal: "sales", resolvedGoal: null, url: "https://shop.com", extraction: { landingPage: "https://shop.com/p", brandName: "Shop" }, corrections: null }) },
    ad: { findMany: async () => ads },
    adAsset: { findFirst: async () => null },
    adsEvent: { create: async (x: unknown) => { events.push(x); return x; } },
    metaPublish: {
      updateMany: async ({ where, data }: { where: Row; data: Partial<Row> }) => {
        const hits = rows.filter((r) => r.jobId === where.jobId && r.adId === where.adId && r.ratio === where.ratio);
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      },
      create: async ({ data }: { data: Row }) => { rows.push(data); return data; },
    },
  };
  return { db, events };
}

describe("publish_meta job", () => {
  it("creates paused objects and writes MetaPublish rows", async () => {
    const rows: Row[] = [
      { adId: "a1", ratio: "1:1", jobId: "j1", status: "pending" },
      { adId: "a1", ratio: "9:16", jobId: "j1", status: "pending" },
    ];
    const { db, events } = fakeDb(rows);
    const groups: string[] = [];
    const publisher: MetaPublisher = {
      mode: "graph",
      listAdAccounts: async () => [], listPages: async () => [],
      uploadMedia: async () => ({ kind: "image", imageHash: "h" }),
      createCampaign: async (_a, i) => { expect(i.objective).toBe("OUTCOME_SALES"); return "c1"; },
      createAdSet: async (_a, i) => { groups.push(i.group); return `s-${i.group}`; },
      createAd: async (_a, i) => { expect(i.copy.link).toBe("https://shop.com/p"); return { adId: `ad-${i.adSetId}`, creativeId: "cr" }; },
      activate: async () => { throw new Error("publishing must never activate"); },
    };
    const storage = { get: async () => Buffer.from([1]), presignGet: async () => "https://s3/x" };
    const job = { id: "j1", type: "publish_meta" as const, runId: "r1", adId: null, workspaceId: "w1", attempts: 0, maxAttempts: 1,
      payload: { adIds: ["a1", "a2"], adAccountId: "act_1", pageId: "9", ratios: ["1:1", "9:16"], requestedBy: "u1" } };
    const ctx = { db, storage, job, signal: new AbortController().signal, now: () => new Date("2026-11-06T00:00:00Z") } as unknown as JobContext;
    const store = prismaPublishStore(ctx.db, ctx.storage, { runId: "r1", workspaceId: "w1", jobId: "j1" });

    const summary = await handlePublishMeta(ctx, { publisher, store });

    expect(summary).toMatchObject({ campaignId: "c1", published: 2, failed: 2 });
    expect(groups.sort()).toEqual(["feed", "stories_reels"]);
    expect(rows.find((r) => r.ratio === "9:16")).toMatchObject({ status: "published", metaAdId: "ad-s-stories_reels", campaignId: "c1" });
    expect(rows.find((r) => r.adId === "a1" && r.ratio === "1:1")).toMatchObject({ status: "published", metaAdId: "ad-s-feed" });
    expect(rows.filter((r) => r.adId === "a2").every((r) => r.status === "failed")).toBe(true);
    expect(events).toHaveLength(1);
  });
});

describe("publish goal override", () => {
  it("parses a known goal and drops unknown ones", async () => {
    const { parsePublishPayload } = await import("../core/publish");
    const base = { adIds: ["a1"], adAccountId: "act_1", pageId: "9", ratios: ["1:1"] };
    expect(parsePublishPayload({ ...base, goal: "leads" }).goal).toBe("leads");
    expect(parsePublishPayload({ ...base, goal: "app_installs" }).goal).toBeUndefined();
    expect(parsePublishPayload(base).goal).toBeUndefined();
  });

  it("uses the picked goal over the run goal, still PAUSED-only via the publisher", async () => {
    const { publishToMeta } = await import("../core/publish");
    let objective = "";
    const publisher: MetaPublisher = {
      mode: "graph",
      listAdAccounts: async () => [], listPages: async () => [],
      uploadMedia: async () => ({ kind: "image", imageHash: "h" }),
      createCampaign: async (_a, i) => { objective = i.objective; return "c1"; },
      createAdSet: async () => "s1",
      createAd: async () => ({ adId: "ad1", creativeId: "cr" }),
      activate: async () => { throw new Error("publishing must never activate"); },
    };
    const store = {
      loadRun: async () => ({ goal: "sales", landingPage: "https://shop.com", brandName: "Shop" }),
      loadAds: async () => [{ id: "a1", headline: "H", body: null, cta: null, eligible: true, assets: [{ ratio: "1:1", storageKey: "k", mime: "image/png" }] }],
      media: async () => ({ kind: "image" as const, bytes: Buffer.from([1]), mime: "image/png", filename: "a.png" }),
      setResult: async () => undefined,
    };
    await publishToMeta({ publisher, store, payload: { adIds: ["a1"], adAccountId: "act_1", pageId: "9", ratios: ["1:1"], goal: "leads" }, now: () => new Date() });
    expect(objective).toBe("OUTCOME_LEADS");
  });
});

describe("activate_meta job", () => {
  const base = {
    mode: "graph" as const, listAdAccounts: async () => [], listPages: async () => [],
    uploadMedia: async () => ({ kind: "image" as const, imageHash: "h" }),
    createCampaign: async () => "c", createAdSet: async () => "s", createAd: async () => ({ adId: "a", creativeId: "cr" }),
  };

  it("turns on our ads, then ad sets, then the campaign, and records meta_activated", async () => {
    const { handleActivateMeta } = await import("../../../../../engine/src/jobs/activate-meta");
    const order: string[][] = [];
    const publisher: MetaPublisher = { ...base, activate: async (ids) => { order.push(ids); } };
    const events: Array<{ data: { name: string } }> = [];
    let where: unknown;
    const db = {
      metaPublish: { findMany: async (q: { where: unknown }) => { where = q.where; return [
        { campaignId: "100", adSetId: "201", metaAdId: "301", status: "published" },
        { campaignId: "100", adSetId: "202", metaAdId: "302", status: "published" },
        { campaignId: "100", adSetId: "201", metaAdId: "303", status: "published" },
      ]; } },
      adsEvent: { create: async (x: { data: { name: string } }) => { events.push(x); return x; } },
    };
    const job = { id: "j2", type: "activate_meta", runId: "r1", adId: null, workspaceId: "w1", attempts: 0, maxAttempts: 2, payload: { campaignId: "100", requestedBy: "u1" } };
    const ctx = { db, job, signal: new AbortController().signal, now: () => new Date() } as unknown as JobContext;

    expect(await handleActivateMeta(ctx, { publisher })).toEqual({ campaignId: "100", adSets: 2, ads: 3 });
    expect(order).toEqual([["301", "302", "303", "201", "202", "100"]]);
    expect(where).toMatchObject({ campaignId: "100", status: "published", ad: { runId: "r1", workspaceId: "w1" } });
    expect(events[0]?.data.name).toBe("meta_activated");
  });

  it("refuses a campaign Komendly didn't publish", async () => {
    const { handleActivateMeta } = await import("../../../../../engine/src/jobs/activate-meta");
    const publisher: MetaPublisher = { ...base, activate: async () => { throw new Error("must not be called"); } };
    const db = { metaPublish: { findMany: async () => [] }, adsEvent: { create: async () => ({}) } };
    const job = { id: "j3", type: "activate_meta", runId: "r1", adId: null, workspaceId: "w1", attempts: 0, maxAttempts: 2, payload: { campaignId: "999" } };
    const ctx = { db, job, signal: new AbortController().signal, now: () => new Date() } as unknown as JobContext;
    await expect(handleActivateMeta(ctx, { publisher })).rejects.toThrow(/Nothing Komendly published/);
  });
});
