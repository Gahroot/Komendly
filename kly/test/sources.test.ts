import { describe, expect, it } from "vitest";
import { findLeads, isExhausted, planSources } from "../src/finder";
import { isLegalLead, isLegalName, isLegalNiche, qualifiedAsLegal } from "../src/legal";
import { codexCandidates, createSourceRuntime, hitsToCandidates, isExcludedDomain, parseBing, parseCodexSse, parseDuckDuckGo, searchBlocked, searchSource } from "../src/sources";
import { pushLeads } from "../src/voice";
import { outboundEnv } from "../src/sender";
import { fakeDb } from "./fakes";

const now = new Date("2026-11-12T15:00:00Z");

describe("legal exclusion", () => {
  it("flags legal niches, names and domains, not look-alikes", () => {
    for (const n of ["law firms", "personal injury lawyers", "attorneys", "notaries", "paralegal services", "legal services"]) expect(isLegalNiche(n), n).toBe(true);
    for (const n of ["roofers", "lawn care", "landscapers"]) expect(isLegalNiche(n), n).toBe(false);
    for (const [name, d] of [["Smith & Associates Law", "smith.com"], ["Jones Attorneys at Law", "j.com"], ["Mary Lee, Esq.", "ml.com"], ["Acme", "smithlaw.com"], ["Acme", "denverinjuryattorney.com"], ["Acme", "lawfirmdenver.com"], ["Mobile Notary Denver", "x.com"]]) expect(isLegalName(name, d), `${name} ${d}`).toBe(true);
    for (const [name, d] of [["Green Lawn Care", "greenlawncare.com"], ["Flawless Detailing", "flawlessdetailing.com"], ["Lawrence Roofing", "lawrenceroofing.com"], ["Outlaw Tattoo", "outlawtattoo.com"]]) expect(isLegalName(name, d), `${name} ${d}`).toBe(false);
    expect(qualifiedAsLegal({ isLegal: true })).toBe(true);
    expect(qualifiedAsLegal({ isLegal: false })).toBe(false);
    expect(isLegalLead({ niche: "roofers", businessName: "Acme", domain: "acme.com", qualification: { isLegal: true } })).toBe(true);
  });

  const base = { email: "", website: "https://x.com", city: "Denver", region: "CO", timezone: "America/Denver", phone: "+13035551234", claimToken: "c", unsubToken: "u", giftToken: null, status: "found", voiceStatus: null, armIds: [] };
  it("push never sends legal leads (niche, qualifier flag, keywords) and marks them rejected", async () => {
    const leads = [
      { ...base, id: "N", niche: "law firms", businessName: "Pat Co", domain: "patco.com", qualification: null },
      { ...base, id: "Q", niche: "roofers", businessName: "Roof Co", domain: "roofco.com", qualification: { isLegal: true } },
      { ...base, id: "K", niche: "roofers", businessName: "Denver Injury Help", domain: "dih.com", qualification: null },
      { ...base, id: "OK", niche: "roofers", businessName: "Acme Roofing", domain: "acme.com", qualification: { isLegal: false } },
    ];
    const f = fakeDb({ outboundLead: { findMany: (a) => ((a as { include?: unknown }).include ? [] : leads) } });
    const sent: string[] = [];
    const fetch = async (_u: string, init: { body?: string }) => {
      const ids = (JSON.parse(init.body ?? "{}") as { leads: Array<{ external_id: string }> }).leads.map((l) => l.external_id);
      sent.push(...ids);
      return { ok: true, status: 200, json: async () => ({ results: ids.map((external_id) => ({ external_id, accepted: true, reason: "" })) }) };
    };
    const settings = { enabled: true, voiceEnabled: true, dailyCallCap: 1000, hourlyCallCap: 100, voiceCursor: 0, minLeadScore: 55 } as never;
    await pushLeads({ db: f.db, settings, killSwitch: null, sendingLive: false, fetch }, { url: "https://t", token: "t" }, outboundEnv({}), now);
    expect(sent).toEqual(["OK"]);
    const upd = f.of("outboundLead", "update") as Array<{ where: { id: string }; data: { voiceStatus: string; voiceReason: string | null } }>;
    expect(upd.filter((u) => u.data.voiceReason === "legal").map((u) => u.where.id)).toEqual(["N", "Q", "K"]);
  });
});

const DDG = `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fy.js%3Fad_domain%3Dangi.com&amp;rut=1">Ad</a>
<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.yelp.com%2Fsearch%3Ffind_desc%3Droofers&amp;rut=2">Top 10 Roofers</a>
<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.cedur.com%2Fbest-roofers-in-denver-co%2F&amp;rut=3">Best roofers</a>
<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.acmeroofing.com%2Fdenver%2F&amp;rut=4">Acme Roofing &amp; Gutters | Denver Roofer</a>`;
const bingHref = (u: string) => `https://www.bing.com/ck/a?!&amp;&amp;p=x&amp;u=a1${Buffer.from(u).toString("base64url")}&amp;ntb=1`;
const BING = `<li class="b_algo"><h2><a href="${bingHref("https://peakroof.com/")}">Peak Roofing - Home</a></h2></li><li class="b_algo"><h2><a href="${bingHref("https://www.bbb.org/us/co/denver")}">BBB</a></h2></li>`;

describe("free search source", () => {
  it("parses DDG and Bing organic results, drops ads, directories and listicles", () => {
    const hits = [...parseDuckDuckGo(DDG), ...parseBing(BING)];
    expect(hits.map((h) => h.url)).toEqual(["https://www.yelp.com/search?find_desc=roofers", "https://www.cedur.com/best-roofers-in-denver-co/", "https://www.acmeroofing.com/denver/", "https://peakroof.com/", "https://www.bbb.org/us/co/denver"]);
    const c = hitsToCandidates(hits, "Denver, CO", "search");
    expect(c.map((x) => [x.name, x.website, x.state, x.source])).toEqual([["Acme Roofing & Gutters", "https://www.acmeroofing.com/", "CO", "search"], ["Peak Roofing", "https://peakroof.com/", "CO", "search"]]);
    for (const d of ["yelp.com", "angi.com", "homeadvisor.com", "bbb.org", "facebook.com", "yellowpages.com", "thumbtack.com", "nextdoor.com", "google.com", "denvergov.gov"]) expect(isExcludedDomain(d), d).toBe(true);
    expect(isExcludedDomain("acmeroofing.com")).toBe(false);
  });

  it("detects blocks and disables the engine with backoff, recording it", async () => {
    expect(searchBlocked("ddg", 202, "", 0)).toMatch(/DuckDuckGo/);
    expect(searchBlocked("bing", 200, "<div id=b_captcha>", 0)).toMatch(/CAPTCHA/);
    expect(searchBlocked("bing", 200, "challenges.cloudflare.com", 5)).toBeNull();
    let t = 1_000_000;
    const rt = createSourceRuntime({ now: () => t, sleep: async (ms) => void (t += ms) });
    const blocks: string[] = [];
    const urls: string[] = [];
    const fetchText = async (url: string) => (urls.push(url), url.includes("duckduckgo") ? { status: 403, text: "" } : { status: 200, text: BING });
    const c = await searchSource.find("roofers", "Denver, CO", { rt, fetchText, onBlock: (e) => blocks.push(e) });
    expect(c.map((x) => x.website)).toEqual(["https://peakroof.com/"]);
    expect(blocks).toEqual(["ddg"]);
    expect(urls.filter((u) => u.includes("duckduckgo")).length).toBe(1); // stopped after the block
    expect(urls.filter((u) => u.includes("bing")).length).toBe(2);
    expect(rt.blocks.get("ddg")?.until).toBeGreaterThan(t);
    urls.length = 0;
    await searchSource.find("roofers", "Denver, CO", { rt, fetchText });
    expect(urls.some((u) => u.includes("duckduckgo"))).toBe(false);
  });
});

describe("codex web search", () => {
  it("reads the SSE stream and validates candidates", () => {
    const sse = ['data: {"type":"response.web_search_call.completed"}', 'data: {"type":"response.output_text.delta","delta":"{\\"businesses\\":[{\\"name\\":\\"Acme\\","}', 'data: {"type":"response.output_text.delta","delta":"\\"website\\":\\"acme.com\\",\\"phone\\":\\"(303) 555-1234\\"}]}"}', 'data: {"type":"response.completed","response":{"usage":{"input_tokens":100,"output_tokens":20}}}'].join("\n");
    const r = parseCodexSse(sse);
    expect(r).toMatchObject({ inputTokens: 100, outputTokens: 20, searches: 1 });
    const c = codexCandidates(JSON.parse(r.text), "Denver, CO");
    expect(c).toEqual([{ name: "Acme", website: "https://acme.com/", city: "Denver", state: "CO", lon: null, phone: "+13035551234", phoneSource: "codex_search", source: "codex_search" }]);
    expect(codexCandidates({ businesses: [{ name: "Y", website: "https://yelp.com/biz/x" }] }, "Denver, CO")).toEqual([]);
    expect(codexCandidates({ nope: 1 }, "Denver, CO")).toEqual([]);
  });
});

describe("source planning and pipeline", () => {
  it("orders by yield, untried first, skips exhausted segments", () => {
    const row = (source: string, city: string, runs: number, leads: number, dry = 0) => ({ source, city, runs, leads, dry, lastRunAt: now });
    expect(planSources(["osm", "search", "codex_search"], [], "Denver, CO", now)).toEqual(["osm", "search", "codex_search"]);
    expect(planSources(["osm", "search", "codex_search"], [row("osm", "Austin, TX", 4, 2), row("search", "Austin, TX", 4, 20), row("codex_search", "Austin, TX", 3, 9)], "Denver, CO", now)).toEqual(["search", "codex_search", "osm"]);
    expect(planSources(["osm", "search"], [row("osm", "Denver, CO", 1, 5, 1), row("search", "Denver, CO", 3, 3, 2)], "Denver, CO", now)).toEqual(["search"]);
    expect(isExhausted({ source: "osm", dry: 1, lastRunAt: new Date(now.getTime() - 20 * 86_400_000) }, now)).toBe(false);
  });

  it("search candidates go through own-site fetch, record source and prefer the site phone", async () => {
    const f = fakeDb({ outboundLead: { create: () => ({ id: "N1" }) } });
    const fetchText = async (url: string) => ({ status: 200, text: url.includes("duckduckgo") ? DDG : "" });
    const fetchPage = async (url: string) => ({ url, html: '<a href="tel:303-555-9876">call</a>' });
    let t = 0;
    const rt = createSourceRuntime({ now: () => t, sleep: async (ms) => void (t += ms) });
    const r = await findLeads({ db: f.db, fetchText, fetchPage, rt, sources: ["search"], allowPhoneOnly: true }, { runId: null, niche: "roofers", cities: ["Denver, CO"], count: 5 });
    expect(r.created).toEqual(["N1"]);
    expect(f.of("outboundLead", "create")[0]).toMatchObject({ data: { domain: "acmeroofing.com", source: "search", phone: "+13035559876", phoneSource: "site", region: "CO" } });
    expect(f.of("klySourceYield", "upsert")[0]).toMatchObject({ where: { key: "search|roofers|Denver, CO" }, create: { leads: 1, fresh: 1 } });
  });
});
