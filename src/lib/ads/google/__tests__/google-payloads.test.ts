import { describe, expect, it } from "vitest";
import { buildGoogleActivatePayload, buildGoogleSyncPayload, parseGoogleActivatePayload, parseGooglePublishPayload, parseGoogleSyncPayload } from "../core/publish";
import { googleJobView, jobStatusOf, plainGoogleError } from "../job-view";
import { googlePublishPayloadFor, publishRequestErrors, type GooglePublishRequest } from "../publish-request";

const conn = { mode: "manager", customerId: "1234567890", loginCustomerId: null, currency: "USD", userId: "u1" };
const req = (campaigns: GooglePublishRequest["campaigns"], over: Partial<GooglePublishRequest> = {}): GooglePublishRequest => ({
  runId: "r1", adIds: campaigns.includes("demand_gen") ? ["a1", "a1", "a2"] : [], customerId: "123-456-7890", campaigns, dailyBudget: 12.5,
  geo: [{ kind: "location", id: "200623", name: "Dallas-Ft. Worth, TX,Texas,United States", type: "DMA Region", countryCode: "US" }],
  keywords: [{ text: "replacement windows", match: "PHRASE" }, { text: "door installation dallas", match: "EXACT" }],
  search: { headlines: [" Fidelity Windows ", "Replacement Windows", "Free Estimates Available"], descriptions: ["Professional installation of energy-efficient windows.", "Locally owned and serving the Dallas-Fort Worth Metroplex."], path1: "windows", path2: "dallas" },
  finalUrl: "https://fidelityhi.com/", ...over,
});

describe("publish_google payload round trip (web route builder -> engine parser)", () => {
  for (const campaigns of [["search"], ["demand_gen"], ["search", "demand_gen"]] as const) {
    it(campaigns.join("+"), () => {
      const r = req([...campaigns]);
      expect(publishRequestErrors(r, "USD")).toEqual([]);
      const payload = googlePublishPayloadFor(r, conn);
      const parsed = parseGooglePublishPayload(JSON.parse(JSON.stringify(payload))); // through the jsonb column
      expect(parsed.dailyBudget).toBe(12.5);
      expect(parsed.campaigns).toEqual([...campaigns]);
      expect(parsed.customerId).toBe("1234567890");
      expect(parsed.adIds).toEqual((campaigns as readonly string[]).includes("demand_gen") ? ["a1", "a2"] : []);
      expect(parsed.geo).toHaveLength(1);
      expect(parsed.search.headlines[0]).toBe("Fidelity Windows");
      expect(payload).not.toHaveProperty("dailyBudgetMicros");
      expect(payload.requestedBy).toBe("u1");
    });
  }
  it("keeps a YouTube link and refuses what the engine would refuse", () => {
    const p = googlePublishPayloadFor(req(["search", "demand_gen"], { youtubeVideoUrl: "https://youtu.be/dQw4w9WgXcQ" }), conn);
    expect(parseGooglePublishPayload(p).youtubeVideoUrl).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(() => googlePublishPayloadFor(req(["search"], { keywords: [] }), conn)).toThrow();
  });
});

describe("activate_google / sync_google payloads", () => {
  it("round trip", () => {
    const a = buildGoogleActivatePayload({ publishId: "p1", action: "enable", requestedBy: "u1", customerId: "1234567890", campaignResource: "customers/1/campaigns/2" });
    expect(parseGoogleActivatePayload(JSON.parse(JSON.stringify(a)))).toEqual({ publishId: "p1", action: "enable", requestedBy: "u1" });
    expect(() => parseGoogleActivatePayload({ publishId: "p1", action: "start" })).toThrow(/activate_google/);
    expect(parseGoogleSyncPayload(buildGoogleSyncPayload({ runId: "r1" }))).toEqual({ publishIds: null });
    expect(parseGoogleSyncPayload(buildGoogleSyncPayload({ publishIds: ["a", "a", "b"] }))).toEqual({ publishIds: ["a", "b"] });
    expect(parseGoogleSyncPayload({})).toEqual({ publishIds: null });
  });
});

describe("job view for the dialog", () => {
  const job = (status: string, over = {}) => ({ id: "j1", type: "publish_google", status, attempts: 1, maxAttempts: 1, lastError: "Invalid publish_google payload: dailyBudget", ...over });
  it("maps AdJob statuses", () => {
    expect(jobStatusOf(job("dead"))).toBe("failed");
    expect(jobStatusOf(job("canceled"))).toBe("failed");
    expect(jobStatusOf(job("failed"))).toBe("failed");
    expect(jobStatusOf(job("failed", { attempts: 1, maxAttempts: 2 }))).toBe("queued");
    expect(jobStatusOf(job("running"))).toBe("running");
  });
  it("dead publish: plain error, retry allowed only when nothing reached published", () => {
    const failedRows = [{ jobId: "j1", status: "failed", error: "Invalid publish_google payload: dailyBudget" }];
    const v = googleJobView(job("dead"), failedRows);
    expect(v).toMatchObject({ id: "j1", status: "failed", canRetry: true });
    expect(v.error).not.toMatch(/payload|dailyBudget/);
    const partial = googleJobView(job("dead"), [...failedRows, { jobId: "j1", status: "published", error: "The other campaign failed and we couldn't remove this one. It is paused; remove it in Google Ads before publishing again." }]);
    expect(partial.canRetry).toBe(false);
    expect(partial.error).toMatch(/remove it in Google Ads/);
    expect(googleJobView(job("succeeded"), []).error).toBeUndefined();
    expect(plainGoogleError("publish_google needs runId and workspaceId")).toBeNull();
  });
});
