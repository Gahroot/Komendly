import { describe, expect, it } from "vitest";
import { teamOpsTick, teamPause, type ActionInput, type MandatePatch, type PublishRow, type ReadyAd, type TeamMandate, type TeamStore } from "../src/jobs/team-ops";
import { dayKey } from "../../src/lib/ads/team/contracts";
import type { StoredMetaToken } from "../../src/lib/ads/meta/core/types";

const NOW = new Date("2026-11-22T17:00:00Z");
const TODAY = dayKey(NOW, "America/New_York");
const allPatches: MandatePatch[] = [];

type Call = { method: string; path: string; params: Record<string, unknown> };
class FakeMeta {
  n = 5000;
  calls: Call[] = [];
  campaigns = new Map<string, { status: string; spend_cap?: number; spend: number }>();
  adsets: Array<{ id: string; name: string; campaign_id: string; daily_budget: number; status: string }> = [];
  ads = new Map<string, string>();
  insights: unknown[] = [];
  fail: ((c: Call) => { status: number; code: number; message: string } | null) | null = null;
  id = () => String(this.n++);
  writes = (pred: (c: Call) => boolean) => this.calls.filter((c) => c.method === "POST" && pred(c));
  statusCalls = (s: string) => this.writes((c) => c.params.status === s && /^\d+$/.test(c.path)).map((c) => c.path);
  fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(input));
    const method = init?.method ?? "GET";
    const raw = method === "POST" ? new URLSearchParams(String(init?.body)) : u.searchParams;
    const params: Record<string, unknown> = {};
    for (const [k, v] of raw) { try { params[k] = typeof v === "string" && /^[\[{]/.test(v) ? JSON.parse(v) : v; } catch { params[k] = v; } }
    const c: Call = { method, path: u.pathname.replace(/^\/v[\d.]+\/?/, ""), params };
    this.calls.push(c);
    const err = this.fail?.(c);
    if (err) return new Response(JSON.stringify({ error: { message: err.message, code: err.code } }), { status: err.status });
    return new Response(JSON.stringify(this.route(c)), { status: 200 });
  };
  route(c: Call): unknown {
    const p = c.path;
    if (c.method === "GET") {
      if (p === "act_1") return { name: "Acct", timezone_name: "America/New_York", currency: "USD", account_status: 1, funding_source: "card" };
      if (p === "555") return { access_token: "PAGE" };
      if (p === "act_1/insights") return { data: this.insights };
      if (p === "") return Object.fromEntries(String(c.params.ids).split(",").map((id) => [id, { id, effective_status: this.ads.get(id) ?? "ACTIVE" }]));
      const [id, edge] = p.split("/");
      const camp = this.campaigns.get(id!);
      if (edge === "adsets") return { data: this.adsets.filter((a) => a.campaign_id === id).map((a) => ({ ...a, daily_budget: String(a.daily_budget) })) };
      if (edge === "insights") return { data: [{ spend: ((camp?.spend ?? 0) / 100).toFixed(2) }] };
      if (camp) return { status: camp.status, effective_status: camp.status, spend_cap: camp.spend_cap ? String(camp.spend_cap) : undefined };
      return {};
    }
    if (p === "555/leadgen_forms") return { id: this.id() };
    if (p === "555/subscribed_apps") return { success: true };
    if (p === "act_1/campaigns") { const id = this.id(); this.campaigns.set(id, { status: String(c.params.status), spend_cap: Number(c.params.spend_cap), spend: 0 }); return { id }; }
    if (p === "act_1/adsets") { const id = this.id(); this.adsets.push({ id, name: String(c.params.name), campaign_id: String(c.params.campaign_id), daily_budget: Number(c.params.daily_budget), status: "PAUSED" }); return { id }; }
    if (p === "act_1/adimages") return { images: { x: { hash: `h${this.id()}` } } };
    if (p === "act_1/adcreatives") return { id: this.id() };
    if (p === "act_1/ads") { const id = this.id(); this.ads.set(id, "PAUSED"); return { id }; }
    // POST {id}: status / spend_cap / daily_budget
    const camp = this.campaigns.get(p);
    if (camp && typeof c.params.status === "string") camp.status = c.params.status;
    if (camp && c.params.spend_cap) camp.spend_cap = Number(c.params.spend_cap);
    if (this.ads.has(p) && typeof c.params.status === "string") this.ads.set(p, c.params.status);
    return { success: true };
  }
}

function mandate(over: Partial<TeamMandate> = {}): TeamMandate {
  return {
    id: "m1", workspaceId: "w1", status: "active", state: "pending", stateReason: null, monthlyLimitMinor: 60000, currency: "USD",
    zips: ["94110", "94114"], privacyUrl: "https://roof.example/privacy", adAccountId: "act_1", pageId: "555", authorizedAt: new Date("2026-11-20T00:00:00Z"),
    leadFormId: null, campaignId: null, spendBeforeMonthMinor: null, capMonth: null, spendCapMinor: null, launchedAt: null, lastCheckedAt: null, lastAnalyzedOn: null,
    workspace: { ownerId: "u1", adsPlan: "ad_department", subscriptionStatus: "active", suspendedAt: null },
    ...over,
  };
}
const live = (over: Partial<TeamMandate> = {}) => mandate({ state: "live", campaignId: "2001", leadFormId: "1999", launchedAt: new Date("2026-11-01T00:00:00Z"), capMonth: "2026-11", spendBeforeMonthMinor: 0, spendCapMinor: 60000, lastAnalyzedOn: TODAY, ...over });

function world(m: TeamMandate, o: { kill?: boolean; token?: StoredMetaToken | null | "throw"; ready?: ReadyAd[]; rows?: Array<PublishRow & { campaignId: string }>; brandText?: string } = {}) {
  const meta = new FakeMeta();
  const actions = new Map<string, ActionInput>();
  const events: string[] = [];
  const rows = o.rows ?? [];
  const perf: string[] = [];
  const store: TeamStore = {
    killSwitch: async () => !!o.kill,
    mandates: async () => [m],
    mandate: async () => m,
    token: async () => { if (o.token === "throw") throw new Error("Meta connection expired; reconnect"); return o.token === undefined ? { mode: "graph", accessToken: "USER" } : o.token; },
    brand: async () => ({ name: "Roof Co", website: "https://roof.example", niche: "roofers", screenText: o.brandText ?? "Roof Co · roof repair and replacement" }),
    readyAds: async (_w, excl, limit) => (o.ready ?? []).filter((a) => !excl.includes(a.id) && !rows.some((r) => r.adId === a.id && r.status === "published")).slice(0, limit),
    media: async () => ({ kind: "image", bytes: new Uint8Array([1, 2]), mime: "image/png", filename: "x" }),
    updateMandate: async (_id, p) => { allPatches.push(p); },
    action: async (a) => { if (actions.has(a.dedupeKey)) return false; actions.set(a.dedupeKey, a); return true; },
    lastActionAt: async () => null,
    event: async (name) => { events.push(name); },
    publishRows: async (_w, cid) => rows.filter((r) => r.campaignId === cid),
    recordPublish: async (r) => { rows.push({ adId: r.adId, ratio: r.ratio, metaAdId: r.metaAdId, adSetId: r.adSetId, status: r.status, createdAt: NOW, headline: r.adId, campaignId: r.campaignId }); },
    upsertPerf: async (_w, rs) => { perf.push(...rs.map((r) => r.metaAdId)); },
    requestDrop: async () => true,
  };
  let t = 0;
  const tick = () => teamOpsTick({ store, fetch: meta.fetch, now: () => new Date(NOW.getTime() + t++ * 60_000), graphVersion: "v25.0", appUrl: "https://app.example" });
  return { meta, store, actions, events, rows, perf, tick, kinds: () => [...actions.values()].map((a) => a.kind) };
}

const asset = (ratio: string) => ({ ratio, storageKey: `k/${ratio}`, mime: "image/png" });
const READY: ReadyAd[] = [
  { id: "k1", headline: "Roof leak?", body: "Fixed this week.", cta: "Get a quote", assets: [asset("4:5"), asset("9:16")] },
  { id: "k2", headline: "Storm check", body: null, cta: null, assets: [asset("1:1")] },
];

describe("team ops: launch", () => {
  it("creates lead form, capped campaign, LEAD_GENERATION ZIP ad sets, ads, then activates ads -> ad sets -> campaign", async () => {
    const m = mandate();
    const w = world(m, { ready: READY });
    const r = await w.tick();
    expect(r.errors).toBe(0);
    const form = w.meta.writes((c) => c.path === "555/leadgen_forms");
    expect(form).toHaveLength(1);
    expect((form[0]!.params.privacy_policy as { url: string }).url).toBe("https://roof.example/privacy");
    expect(w.meta.writes((c) => c.path === "555/subscribed_apps")).toHaveLength(1);
    const camp = w.meta.writes((c) => c.path === "act_1/campaigns");
    expect(camp).toHaveLength(1);
    expect(camp[0]!.params).toMatchObject({ objective: "OUTCOME_LEADS", spend_cap: "60000", status: "PAUSED" });
    const sets = w.meta.writes((c) => c.path === "act_1/adsets");
    expect(sets).toHaveLength(2); // feed + stories/reels
    for (const s of sets) {
      expect(s.params).toMatchObject({ optimization_goal: "LEAD_GENERATION", destination_type: "ON_AD", promoted_object: { page_id: "555" }, status: "PAUSED" });
      expect((s.params.targeting as { geo_locations: unknown; age_min: number })).toMatchObject({ geo_locations: { zips: [{ key: "US:94110" }, { key: "US:94114" }] }, age_min: 18 });
    }
    expect(sets.reduce((t, s) => t + Number(s.params.daily_budget), 0)).toBeLessThanOrEqual(Math.floor((60000 * 0.95) / 30.4));
    const ads = w.meta.writes((c) => c.path === "act_1/ads");
    expect(ads).toHaveLength(3);
    const creative = w.meta.writes((c) => c.path === "act_1/adcreatives")[0]!;
    expect(JSON.stringify(creative.params.object_story_spec)).toContain(`"lead_gen_form_id":"${m.leadFormId}"`);
    // activation order
    const on = w.meta.statusCalls("ACTIVE");
    const campaignId = m.campaignId!;
    const adSetIds = w.meta.adsets.map((a) => a.id);
    expect(on[on.length - 1]).toBe(campaignId);
    const firstSet = Math.min(...adSetIds.map((id) => on.indexOf(id)));
    const adIds = w.rows.map((x) => x.metaAdId!);
    expect(Math.max(...adIds.map((id) => on.indexOf(id)))).toBeLessThan(firstSet);
    expect(m).toMatchObject({ state: "live", capMonth: "2026-11", spendCapMinor: 60000, spendBeforeMonthMinor: 0 });
    expect(m.launchedAt).toBeTruthy();
    expect(w.events).toContain("team_launched");
    expect(w.kinds()).toEqual(expect.arrayContaining(["lead_form_created", "spend_cap_set", "budget_set", "campaign_launched"]));
  });

  it("re-ticks idempotently: nothing is created twice and actions don't repeat", async () => {
    const m = mandate();
    const w = world(m, { ready: READY });
    await w.tick();
    const created = () => w.meta.writes((c) => /^(act_1\/(campaigns|adsets|ads)|555\/leadgen_forms)$/.test(c.path)).length;
    const n = created();
    await w.tick();
    const after2 = w.actions.size;
    await w.tick();
    await w.tick();
    expect(created()).toBe(n);
    expect(w.actions.size).toBe(after2);
    expect(w.kinds().filter((k) => k === "campaign_launched")).toHaveLength(1);
    expect(m.state).toBe("live");
  });

  it("blocks Special Ad Category businesses and requests ads when none are ready", async () => {
    const a = world(mandate(), { ready: READY, brandText: "Bay Realty · real estate agent" });
    await a.tick();
    expect(a.meta.writes(() => true)).toHaveLength(0);
    expect(a.kinds()).toEqual(["blocked"]);
    const m = mandate();
    const b = world(m, { ready: [] });
    await b.tick();
    expect(b.meta.writes(() => true)).toHaveLength(0);
    expect(m.state).toBe("blocked");
    expect(b.kinds()).toEqual(expect.arrayContaining(["drop_requested", "blocked"]));
  });
});

describe("team ops: stop conditions pause within one cycle", () => {
  const cases: Array<[string, Partial<TeamMandate>, { kill?: boolean; token?: null }, string]> = [
    ["kill switch", {}, { kill: true }, "paused"],
    ["owner paused", { status: "paused" }, {}, "paused"],
    ["owner stopped", { status: "stopped" }, {}, "stopped"],
    ["suspended", { workspace: { ownerId: "u1", adsPlan: "ad_department", subscriptionStatus: "active", suspendedAt: new Date() } }, {}, "paused"],
    ["subscription ended", { workspace: { ownerId: "u1", adsPlan: "ad_department", subscriptionStatus: "canceled", suspendedAt: null } }, {}, "stopped"],
    ["starter plan", { workspace: { ownerId: "u1", adsPlan: "starter", subscriptionStatus: "active", suspendedAt: null } }, {}, "stopped"],
  ];
  for (const [name, over, o, state] of cases) {
    it(name, async () => {
      const m = live(over);
      const w = world(m, o);
      w.meta.campaigns.set("2001", { status: "ACTIVE", spend: 1000, spend_cap: 60000 });
      await w.tick();
      expect(w.meta.statusCalls("PAUSED")).toEqual(["2001"]);
      expect(m.state).toBe(state);
      expect(w.events).toContain("team_paused");
      await w.tick(); // no repeat
      expect(w.meta.statusCalls("PAUSED")).toEqual(["2001"]);
    });
  }
  it("Meta disconnected -> needs_reconnect", async () => {
    const m = live();
    const w = world(m, { token: null });
    await w.tick();
    expect(m.state).toBe("needs_reconnect");
  });
  it("team_pause job pauses immediately", async () => {
    const m = live();
    const w = world(m);
    w.meta.campaigns.set("2001", { status: "ACTIVE", spend: 0 });
    const r = await teamPause({ store: w.store, fetch: w.meta.fetch, now: () => NOW, graphVersion: "v25.0" }, "w1", "Refund issued", "job1");
    expect(r.paused).toBe(true);
    expect(w.meta.statusCalls("PAUSED")).toEqual(["2001"]);
    expect(m).toMatchObject({ state: "paused", stateReason: "Refund issued" });
  });
});

describe("team ops: budget", () => {
  it("pauses at 98% of the monthly limit", async () => {
    const m = live();
    const w = world(m);
    w.meta.campaigns.set("2001", { status: "ACTIVE", spend: 58800, spend_cap: 60000 });
    await w.tick();
    expect(w.meta.statusCalls("PAUSED")).toEqual(["2001"]);
    expect(m.state).toBe("capped");
    expect(w.kinds()).toContain("capped");
  });
  it("keeps running below 98%", async () => {
    const m = live();
    const w = world(m);
    w.meta.campaigns.set("2001", { status: "ACTIVE", spend: 58700, spend_cap: 60000 });
    await w.tick();
    expect(w.meta.statusCalls("PAUSED")).toEqual([]);
    expect(m.state).toBe("live");
  });
  it("month rollover raises spend_cap by exactly one limit and resumes a capped campaign", async () => {
    const m = live({ state: "capped", capMonth: "2026-10", spendBeforeMonthMinor: 0, spendCapMinor: 60000 });
    const w = world(m);
    w.meta.campaigns.set("2001", { status: "PAUSED", spend: 60000, spend_cap: 60000 });
    await w.tick();
    const caps = w.meta.writes((c) => c.path === "2001" && c.params.spend_cap !== undefined).map((c) => Number(c.params.spend_cap));
    expect(caps).toEqual([120000]);
    expect(caps[0]! - 60000).toBe(m.monthlyLimitMinor);
    expect(m).toMatchObject({ capMonth: "2026-11", spendBeforeMonthMinor: 60000, spendCapMinor: 120000, state: "live" });
    expect(w.meta.statusCalls("ACTIVE")).toEqual(["2001"]);
    expect(w.kinds()).toEqual(expect.arrayContaining(["spend_cap_set", "uncapped"]));
  });
  it("owner-paused campaign in Ads Manager: marks paused and doesn't fight", async () => {
    const m = live();
    const w = world(m);
    w.meta.campaigns.set("2001", { status: "PAUSED", spend: 100, spend_cap: 60000 });
    await w.tick();
    await w.tick();
    expect(m.state).toBe("paused");
    expect(w.meta.statusCalls("ACTIVE")).toEqual([]);
  });
});

describe("team ops: analyst", () => {
  it("pauses a wasteful Komendly ad only, stores insights for our ads only", async () => {
    const old = new Date(NOW.getTime() - 10 * 86_400_000);
    const rows = ["k1", "k2", "k3"].map((k, i) => ({ adId: k, ratio: "4:5", metaAdId: String(3001 + i), adSetId: "2100", status: "published", createdAt: old, headline: k, campaignId: "2001" }));
    const m = live({ lastAnalyzedOn: null });
    const w = world(m, { rows });
    w.meta.campaigns.set("2001", { status: "ACTIVE", spend: 27000, spend_cap: 60000 });
    const row = (id: string, spend: string, leads: number) => ({ ad_id: id, date_start: "2026-11-20", spend, impressions: "5000", inline_link_clicks: "40", actions: leads ? [{ action_type: "lead", value: String(leads) }] : [] });
    w.meta.insights = [row("3001", "30.00", 3), row("3002", "40.00", 4), row("3003", "200.00", 0), row("3999", "500.00", 0)];
    await w.tick();
    expect(w.meta.statusCalls("PAUSED")).toEqual(["3003"]);
    expect(w.perf.sort()).toEqual(["3001", "3002", "3003"]);
    const pause = [...w.actions.values()].find((a) => a.kind === "ad_paused")!;
    expect(pause.evidence).toMatchObject({ spendMinor: 20000, leads: 0, windowDays: 14 });
    expect(m.lastAnalyzedOn).toBe(TODAY);
    await w.tick(); // once per day
    expect(w.meta.calls.filter((c) => c.path === "act_1/insights")).toHaveLength(1);
  });
});

describe("team ops: Meta errors", () => {
  it("unusable token -> needs_reconnect, no Meta calls", async () => {
    const m = live();
    const w = world(m, { token: "throw" });
    await w.tick();
    expect(m.state).toBe("needs_reconnect");
    expect(w.meta.calls).toHaveLength(0);
  });
  it("Graph token error mid-run -> needs_reconnect, stops changing things", async () => {
    const m = live();
    const w = world(m);
    w.meta.fail = () => ({ status: 400, code: 190, message: "Error validating access token" });
    await w.tick();
    expect(m.state).toBe("needs_reconnect");
    expect(w.meta.writes(() => true)).toHaveLength(0);
  });
});

describe("team ops: limit", () => {
  it("never writes monthlyLimitMinor", () => {
    expect(allPatches.length).toBeGreaterThan(0);
    expect(allPatches.some((p) => "monthlyLimitMinor" in p)).toBe(false);
  });
});

// ---- owner notices (Terms: we email you whenever we pause your ads) ----
import { teamNoticeMail } from "../src/jobs/team-notice";
import { teamPause as teamPauseForNotice } from "../src/jobs/team-ops";

describe("team owner notices", () => {
  it("builds a plain notice with the reason and team link, no unsubscribe", () => {
    const m = teamNoticeMail({ to: "joe@example.com", workspaceId: "w", state: "capped", reason: "You've reached your $600 limit.", teamUrl: "https://www.komendly.com/ads/team" });
    expect(m.subject).toMatch(/budget limit/);
    expect(m.text).toContain("You've reached your $600 limit.");
    expect(m.text).toContain("on the 1st");
    expect(m.html).toContain("https://www.komendly.com/ads/team");
    expect(m.headers["List-Unsubscribe"]).toBeUndefined();
  });

  it("emails on a billing pause but not on the owner's own pause, with human reason text", async () => {
    const sent: Array<{ state: string; reason: string; to: string }> = [];
    const mk = () => ({ id: "m1", workspaceId: "w1", status: "stopped", state: "live", stateReason: null, monthlyLimitMinor: 60000, currency: "USD", zips: ["94110"], leadEmail: "joe@example.com", privacyUrl: null, adAccountId: "act_1", pageId: "p1", authorizedAt: new Date(), leadFormId: null, campaignId: null, spendBeforeMonthMinor: null, capMonth: null, spendCapMinor: null, launchedAt: null, lastCheckedAt: null, lastAnalyzedOn: null, workspace: { ownerId: "u", adsPlan: "ad_department", subscriptionStatus: "canceled", suspendedAt: null } });
    const patches: Array<Record<string, unknown>> = [];
    const store = { mandate: async () => mk(), updateMandate: async (_: string, p: Record<string, unknown>) => { patches.push(p); }, action: async () => true, event: async () => undefined, token: async () => null } as never;
    const notify = async (n: { state: string; reason: string; to: string }) => { sent.push(n); };
    await teamPauseForNotice({ store, notify: notify as never }, "w1", "refund", "j1");
    await teamPauseForNotice({ store, notify: notify as never }, "w1", "owner_paused", "j2");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("joe@example.com");
    expect(sent[0]!.reason).toMatch(/refunded/);
    expect(patches[0]!.stateReason).toMatch(/refunded/);
  });
});
