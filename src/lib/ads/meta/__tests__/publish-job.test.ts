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
