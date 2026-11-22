import { describe, expect, it } from "vitest";
import {
  createLeadAd, createLeadAdSet, createLeadCampaign, createLeadForm, fetchDailyAdInsights, GraphClient, isMetaAuthError, leadFormPayload, setSpendCap, setStatus,
} from "../core/team-graph";
import { MetaApiError } from "../core/types";

type Call = { method: string; path: string; params: Record<string, unknown> };
function fake(reply: (c: Call) => unknown = () => ({ id: "123" })) {
  const calls: Call[] = [];
  const f = async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const raw = init?.method === "POST" ? new URLSearchParams(String(init.body)) : u.searchParams;
    const params: Record<string, unknown> = {};
    for (const [k, v] of raw) { try { params[k] = JSON.parse(v); } catch { params[k] = v; } }
    const c = { method: init?.method ?? "GET", path: u.pathname.replace(/^\/v[\d.]+\//, ""), params };
    calls.push(c);
    return new Response(JSON.stringify(reply(c)), { status: 200 });
  };
  return { calls, graph: new GraphClient({ accessToken: "T", fetch: f }) };
}

describe("team graph payloads", () => {
  it("lead form uses only Meta-safe question types, ZIP as CUSTOM zip_code, privacy link", async () => {
    const { calls, graph } = fake();
    expect(await createLeadForm(graph, "555", { name: "Form", niche: "roofers", privacyUrl: "https://b.example/privacy" })).toBe("123");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.path).toBe("555/leadgen_forms");
    const qs = calls[0]!.params.questions as Array<{ type: string; key?: string }>;
    expect(qs.every((q) => ["CUSTOM", "EMAIL", "FIRST_NAME", "FULL_NAME", "LAST_NAME", "PHONE"].includes(q.type))).toBe(true);
    expect(qs).toContainEqual(expect.objectContaining({ type: "CUSTOM", key: "zip_code" }));
    expect(qs.map((q) => q.type)).toContain("FULL_NAME");
    expect(calls[0]!.params.privacy_policy).toEqual({ url: "https://b.example/privacy", link_text: "Privacy policy" });
    expect(leadFormPayload({ name: "x", niche: null, privacyUrl: "https://p", includePhone: true }).questions.map((q) => q.type)).toContain("PHONE");
  });

  it("campaign: OUTCOME_LEADS, PAUSED, spend_cap, no special category", async () => {
    const { calls, graph } = fake();
    await createLeadCampaign(graph, "1", { name: "C", spendCapMinor: 60000 });
    expect(calls[0]!.path).toBe("act_1/campaigns");
    expect(calls[0]!.params).toMatchObject({ objective: "OUTCOME_LEADS", status: "PAUSED", spend_cap: 60000, special_ad_categories: [], buying_type: "AUCTION" });
  });

  it("ad set: LEAD_GENERATION on ad, page promoted, ZIP targeting 18+", async () => {
    const { calls, graph } = fake();
    await createLeadAdSet(graph, "act_1", { name: "S", campaignId: "9", pageId: "555", dailyBudgetMinor: 1875, zips: ["94110", "94114"], group: "feed" });
    expect(calls[0]!.path).toBe("act_1/adsets");
    expect(calls[0]!.params).toMatchObject({
      campaign_id: 9, status: "PAUSED", daily_budget: 1875, billing_event: "IMPRESSIONS", optimization_goal: "LEAD_GENERATION", destination_type: "ON_AD",
      promoted_object: { page_id: "555" },
      targeting: { geo_locations: { zips: [{ key: "US:94110" }, { key: "US:94114" }] }, age_min: 18, publisher_platforms: ["facebook", "instagram"] },
    });
  });

  it("creative CTA carries lead_gen_form_id; ad is PAUSED", async () => {
    const { calls, graph } = fake((c) => ({ id: c.path.endsWith("adcreatives") ? "77" : "88" }));
    const r = await createLeadAd(graph, "act_1", { name: "A", adSetId: "5", pageId: "555", formId: "444", headline: "H", body: "B", cta: "Get a quote", media: { kind: "image", imageHash: "h" } });
    expect(r).toEqual({ adId: "88", creativeId: "77" });
    const spec = calls[0]!.params.object_story_spec as { link_data: { call_to_action: unknown; link: string } };
    expect(spec.link_data.call_to_action).toEqual({ type: "GET_QUOTE", value: { lead_gen_form_id: "444" } });
    expect(spec.link_data.link).toBe("https://fb.me/");
    expect(calls[1]!.params).toMatchObject({ adset_id: 5, creative: { creative_id: "77" }, status: "PAUSED" });
  });

  it("status / spend cap writes and insights query", async () => {
    const { calls, graph } = fake((c) => (c.path.endsWith("insights") ? { data: [{ ad_id: "1", date_start: "2026-11-20", spend: "12.34", impressions: "900", inline_link_clicks: "9", actions: [{ action_type: "onsite_conversion.lead_grouped", value: "2" }] }] } : { success: true }));
    await setStatus(graph, "42", "ACTIVE");
    await setSpendCap(graph, "42", 120000);
    expect(calls[0]!.params).toEqual({ status: "ACTIVE" });
    expect(calls[1]!.params).toEqual({ spend_cap: 120000 });
    await expect(setStatus(graph, "x/1", "PAUSED")).rejects.toThrow();
    const rows = await fetchDailyAdInsights(graph, "1", "42", "2026-11-09", "2026-11-22");
    expect(rows).toEqual([{ metaAdId: "1", day: "2026-11-20", spendMinor: 1234, impressions: 900, clicks: 9, leads: 2 }]);
    expect(calls[2]!.params).toMatchObject({ level: "ad", time_increment: 1, time_range: { since: "2026-11-09", until: "2026-11-22" } });
  });

  it("recognises token errors", () => {
    expect(isMetaAuthError(new MetaApiError("Error validating access token", 400, 190))).toBe(true);
    expect(isMetaAuthError(new MetaApiError("Invalid parameter", 400, 100))).toBe(false);
  });
});
