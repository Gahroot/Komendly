import { describe, expect, it, vi } from "vitest";
import { GraphMetaPublisher } from "../core/graph-publisher";
import { McpMetaPublisher, type McpToolClient } from "../core/mcp-publisher";
import { publishModeFromEnv } from "../core/factory";

function fakeFetch() {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  let n = 0;
  const f = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: new URLSearchParams(String(init?.body ?? "")) });
    const json = url.includes("adimages") ? { images: { f: { hash: "HASH" } } } : { id: String(++n) };
    return new Response(JSON.stringify(json), { status: 200 });
  });
  return { f, calls };
}

describe("GraphMetaPublisher", () => {
  it("sends PAUSED payloads to the Marketing API", async () => {
    const { f, calls } = fakeFetch();
    const p = new GraphMetaPublisher({ accessToken: "t", fetch: f });
    const c = await p.createCampaign("123", { name: "c", objective: "OUTCOME_LEADS" });
    const s = await p.createAdSet("123", { name: "s", campaignId: c, objective: "OUTCOME_LEADS", group: "feed", dailyBudgetMinor: 500, countries: ["US"] });
    const media = await p.uploadMedia("123", { kind: "image", bytes: new Uint8Array([1]), mime: "image/png", filename: "x" });
    await p.createAd("123", { name: "a", adSetId: s, pageId: "9", objective: "OUTCOME_LEADS", copy: { headline: "h", body: null, cta: null, link: "https://x.com" }, media });
    expect(calls[0]?.url).toContain("/act_123/campaigns");
    expect(calls[0]?.body.get("objective")).toBe("OUTCOME_LEADS");
    for (const i of [0, 1, 4]) expect(calls[i]?.body.get("status")).toBe("PAUSED");
    expect(calls[3]?.body.get("object_story_spec")).toContain("HASH");
  });
});

describe("McpMetaPublisher", () => {
  it("calls the official tools with PAUSED args", async () => {
    const called: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const client: McpToolClient = {
      listTools: async () => ({ tools: ["ads_create_campaign", "ads_create_ad_set", "ads_create_ad", "ads_create_creative", "ads_get_ad_accounts", "ads_get_pages"].map((name) => ({ name })) }),
      callTool: async (req) => {
        called.push(req);
        const body = req.name === "ads_get_ad_accounts" ? { data: [{ id: "act_1", name: "A" }] } : { id: `${req.name}-id` };
        return { content: [{ type: "text", text: JSON.stringify(body) }] };
      },
      close: async () => undefined,
    };
    const p = new McpMetaPublisher({ accessToken: "t", client });
    expect(await p.listAdAccounts()).toEqual([{ id: "act_1", name: "A", currency: undefined }]);
    expect(await p.createCampaign("1", { name: "c", objective: "OUTCOME_SALES" })).toBe("ads_create_campaign-id");
    const r = await p.createAd("1", { name: "a", adSetId: "s", pageId: "9", objective: "OUTCOME_SALES", copy: { headline: "h", body: "b", cta: "Shop now", link: "https://x.com" }, media: { kind: "image", imageHash: "H" } });
    expect(r).toEqual({ adId: "ads_create_ad-id", creativeId: "ads_create_creative-id" });
    expect(called.find((c) => c.name === "ads_create_campaign")?.arguments.status).toBe("PAUSED");
    expect(called.find((c) => c.name === "ads_create_ad")?.arguments.status).toBe("PAUSED");
  });

  it("defaults to graph mode", () => {
    expect(publishModeFromEnv(undefined)).toBe("graph");
    expect(publishModeFromEnv("mcp")).toBe("mcp");
  });
});
