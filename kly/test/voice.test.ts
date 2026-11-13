import { describe, expect, it } from "vitest";
import { extractSitePhone, findLeads, normalizeUsPhone, osmPhone } from "../src/finder";
import { ingestEvent, nextVoiceStatus, pullEvents, pushLeads, pushRoom, sendVoiceGifts, syncSuppressions, voiceTick, type FetchFn } from "../src/voice";
import { outboundEnv } from "../src/sender";
import { fakeDb } from "./fakes";

const NO_EVENT = { findUnique: () => null };
const now = new Date("2026-11-12T15:00:00Z");
const b = { url: "https://tribunal.test/api/v1/komendly-bridge", token: "t" };
const settings = { enabled: true, voiceEnabled: true, dailyCallCap: 1000, hourlyCallCap: 100, voiceCursor: 0, minLeadScore: 55 } as never;
const mbx = JSON.stringify([{ address: "ozzy@getkomendly.com", name: "Ozzy", appPassword: "xxxxxxxx" }]);
const env = { OUTBOUND_ENABLED: "1", OUTBOUND_MAILBOXES: mbx, TRIBUNAL_BRIDGE_URL: b.url, KOMENDLY_BRIDGE_TOKEN: "t" };

function fakeFetch(reply: (url: string, body: unknown) => unknown) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const f: FetchFn = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method, body });
    return { ok: true, status: 200, json: async () => reply(url, body) };
  };
  return { f, calls };
}

const lead = (o: Record<string, unknown> = {}) => ({ id: "L1", businessName: "Acme Roofing", email: "owner@acme.com", domain: "acme.com", website: "https://acme.com", niche: "roofers", city: "Denver", region: "CO", timezone: "America/Denver", phone: "+13035551234", claimToken: "c", unsubToken: "u", giftToken: null as string | null, giftId: null as string | null, adId: null as string | null, qualityNotes: null, status: "found", voiceStatus: null as string | null, mailboxId: null, armIds: [], ...o });

describe("phones", () => {
  it("normalizes US numbers to E.164 and drops invalid/toll-free/foreign", () => {
    expect(normalizeUsPhone("(303) 555-1234")).toBe("+13035551234");
    expect(normalizeUsPhone("tel:+1-303-555-1234")).toBe("+13035551234");
    expect(normalizeUsPhone("1 800 555 1234")).toBeNull();
    expect(normalizeUsPhone("+44 20 7946 0958")).toBeNull();
    expect(normalizeUsPhone("123-456-7890")).toBeNull();
    expect(normalizeUsPhone("555-1234")).toBeNull();
  });
  it("reads OSM tags and site pages; ambiguous = null", () => {
    expect(osmPhone({ phone: "+1 303 555 1234" })).toBe("+13035551234");
    expect(osmPhone({ phone: "+1 303 555 1234;+1 720 555 9876" })).toBeNull();
    expect(extractSitePhone('<a href="tel:3035551234">Call</a> 720-555-9876')).toBe("+13035551234");
    expect(extractSitePhone("<p>Call us: (303) 555-1234</p>")).toBe("+13035551234");
    expect(extractSitePhone("<p>303-555-1234 or 720-555-9876</p>")).toBeNull();
  });
});

describe("phone-only discovery", () => {
  const fetchJson = async (url: string) => (url.includes("nominatim") ? [{ boundingbox: ["1", "2", "3", "4"], address: { "ISO3166-2-lvl4": "US-CO" } }] : { elements: [{ tags: { name: "Acme", website: "https://acme.com", phone: "303-555-1234" }, lon: -105 }] });
  const fetchPage = async (url: string) => ({ url, html: "<p>No email here</p>" });
  it("keeps a phone lead without email only when allowed", async () => {
    const f = fakeDb({ outboundLead: { create: () => ({ id: "N1" }) } });
    const off = await findLeads({ db: f.db, fetchJson, fetchPage }, { runId: null, niche: "roofers", cities: ["Denver, CO"], count: 1 });
    expect(off.created).toEqual([]);
    const on = await findLeads({ db: f.db, fetchJson, fetchPage, allowPhoneOnly: true }, { runId: null, niche: "roofers", cities: ["Denver, CO"], count: 1 });
    expect(on.created).toEqual(["N1"]);
    expect(f.of("outboundLead", "create")[0]).toMatchObject({ data: { email: "", phone: "+13035551234", phoneSource: "osm" } });
  });
});

describe("push", () => {
  it("caps by daily cap and ~1.5x hourly queued ahead, one batch per tick", () => {
    expect(pushRoom({ dailyCallCap: 1000, hourlyCallCap: 100, pushedToday: 0, queued: 0 })).toBe(50);
    expect(pushRoom({ dailyCallCap: 1000, hourlyCallCap: 100, pushedToday: 990, queued: 0 })).toBe(10);
    expect(pushRoom({ dailyCallCap: 1000, hourlyCallCap: 100, pushedToday: 0, queued: 140 })).toBe(10);
    expect(pushRoom({ dailyCallCap: 1000, hourlyCallCap: 100, pushedToday: 0, queued: 150 })).toBe(0);
  });
  it("pushes phone leads (null email/gift), skips suppressed and customers", async () => {
    const leads = [lead({ id: "A", email: "" }), lead({ id: "S", domain: "bad.com" }), lead({ id: "C", email: "me@cust.com", domain: "cust.com" }), lead({ id: "G", giftToken: "tok" })];
    const f = fakeDb({ outboundLead: { findMany: (a) => ((a as { include?: unknown }).include ? [] : leads) }, outboundSuppression: { findMany: () => [{ value: "bad.com" }] }, user: { findMany: () => [{ email: "me@cust.com" }] } });
    const { f: fetch, calls } = fakeFetch((_u, body) => ({ results: (body as { leads: Array<{ external_id: string }> }).leads.map((l) => ({ external_id: l.external_id, accepted: l.external_id === "A", reason: l.external_id === "A" ? "" : "not_landline" })) }));
    const r = await pushLeads({ db: f.db, settings, killSwitch: null, sendingLive: false, fetch }, b, outboundEnv({}), now);
    const sent = (calls[0]?.body as { leads: Array<Record<string, unknown>> }).leads;
    expect(sent.map((l) => l.external_id)).toEqual(["A", "G"]);
    expect(sent[0]).toMatchObject({ email: null, gift_url: null, reason: "cold", phone: "+13035551234" });
    expect(sent[1]?.gift_url).toBe("https://www.komendly.com/g/c");
    expect(r).toEqual({ pushed: 2, accepted: 1, rejected: 1, skipped: 2 });
    const upd = f.of("outboundLead", "update") as Array<{ where: { id: string }; data: { voiceStatus: string; voiceReason: string | null } }>;
    expect(upd.map((u) => [u.where.id, u.data.voiceStatus, u.data.voiceReason])).toEqual([["S", "rejected", "suppressed"], ["C", "rejected", "existing_user"], ["A", "queued", null], ["G", "rejected", "not_landline"]]);
  });
  it("respects the daily cap and the kill switches", async () => {
    const f = fakeDb({ outboundLead: { count: (a) => ((a as { where: { voicePushedAt?: unknown } }).where.voicePushedAt ? 1000 : 0), findMany: () => [lead()] } });
    const { f: fetch, calls } = fakeFetch(() => ({ results: [] }));
    expect((await pushLeads({ db: f.db, settings, killSwitch: null, sendingLive: false, fetch }, b, outboundEnv({}), now)).pushed).toBe(0);
    const g = fakeDb({ outboundLead: { findMany: () => [lead()] } });
    await voiceTick({ db: g.db, settings: { ...(settings as object), voiceEnabled: false } as never, killSwitch: null, sendingLive: false, fetch, env, now: () => now });
    await voiceTick({ db: g.db, settings, killSwitch: "off", sendingLive: false, fetch, env, now: () => now });
    expect(calls.filter((c) => c.url.endsWith("/leads"))).toHaveLength(0);
  });
});

describe("events", () => {
  const ev = (id: number, type: string, o: Record<string, unknown> = {}) => ({ id, external_id: "L1", type, email: null, detail: null, call_id: null, at: now.toISOString(), ...o });
  it("ingests once, keeps settled statuses, suppresses on opt_out", async () => {
    expect(nextVoiceStatus("gift_yes", "completed")).toBe("gift_yes");
    expect(nextVoiceStatus("queued", "call_started")).toBe("called");
    const dup = fakeDb({ outboundVoiceEvent: { findUnique: () => ({ id: "x" }) } });
    expect(await ingestEvent(dup.db, ev(1, "gift_yes"), now)).toBe("duplicate");
    expect(dup.of("outboundLead", "update")).toHaveLength(0);
    const f = fakeDb({ outboundVoiceEvent: NO_EVENT, outboundLead: { findUnique: () => lead({ status: "sent" }) } });
    await ingestEvent(f.db, ev(2, "opt_out"), now);
    expect(f.of("outboundSuppression", "upsert").map((a) => (a as { where: { value: string }; create: { reason: string } }).create.reason)).toEqual(["reply_stop", "reply_stop"]);
    expect(f.of("outboundLead", "update")[0]).toMatchObject({ data: { voiceStatus: "opt_out", status: "unsubscribed", nextSendAt: null } });
  });
  it("stores the agent's email on a phone-only lead", async () => {
    const f = fakeDb({ outboundVoiceEvent: NO_EVENT, outboundLead: { findUnique: () => lead({ email: "" }) } });
    await ingestEvent(f.db, ev(3, "gift_yes", { email: "Bob@Acme.com" }), now);
    expect(f.of("outboundLead", "update")[0]).toMatchObject({ data: { voiceStatus: "gift_yes", email: "bob@acme.com", nextSendAt: null } });
  });
  it("paused writes a pause decision and alerts", async () => {
    const f = fakeDb({ outboundVoiceEvent: NO_EVENT });
    const alerts: string[] = [];
    await ingestEvent(f.db, ev(4, "paused", { external_id: null, detail: "too many failures" }), now, async (s) => void alerts.push(s));
    expect(f.of("klyDecision", "create")[0]).toMatchObject({ data: { kind: "pause" } });
    expect(alerts).toHaveLength(1);
  });
  it("advances the cursor to the last processed event", async () => {
    const f = fakeDb({ outboundVoiceEvent: NO_EVENT, outboundLead: { findUnique: () => lead() } });
    const { f: fetch } = fakeFetch(() => ({ events: [ev(7, "accepted"), ev(8, "call_started")], next: 8 }));
    const s = { ...(settings as object) } as never;
    expect(await pullEvents({ db: f.db, settings: s, killSwitch: null, sendingLive: false, fetch }, b, now)).toEqual({ events: 2, cursor: 8 });
    expect(f.of("klySettings", "update")[0]).toMatchObject({ data: { voiceCursor: 8 } });
  });
});

describe("gift on yes", () => {
  it("starts a gift once for a giftless lead, then emails exactly once when ready", async () => {
    let state = lead({ voiceStatus: "gift_yes", email: "bob@acme.com" });
    let voiceSends = 0;
    const started: string[][] = [];
    const sent: string[] = [];
    const f = fakeDb({
      outboundLead: { findMany: () => [state] },
      outboundVoiceEvent: { findFirst: () => null },
      outboundSend: { count: () => voiceSends, create: () => (voiceSends++, { id: "S" }) },
      outboundMailbox: { findUnique: () => ({ id: "M", address: "ozzy@getkomendly.com" }) },
    });
    const d = { db: f.db, settings, killSwitch: null, sendingLive: true, startGift: async (ids: string[]) => (started.push(ids), ids.length), transport: () => async (m: { to: string; text: string }) => void sent.push(m.to) };
    const cfg = outboundEnv(env);
    expect(await sendVoiceGifts(d, cfg, now)).toBe(0);
    expect(started).toEqual([["L1"]]);
    state = { ...state, giftId: "g", giftToken: "tok", adId: "ad", status: "ad_made" };
    expect(await sendVoiceGifts(d, cfg, now)).toBe(1);
    expect(await sendVoiceGifts(d, cfg, now)).toBe(0);
    expect(sent).toEqual(["bob@acme.com"]);
    expect(started).toHaveLength(1);
  });
});

describe("suppress sync", () => {
  it("posts unsubscribed leads to /suppress and marks them synced", async () => {
    const f = fakeDb({ outboundLead: { findMany: () => [{ id: "L1", phone: "+13035551234", email: "owner@acme.com", status: "unsubscribed" }] } });
    const { f: fetch, calls } = fakeFetch(() => ({ ok: true }));
    expect(await syncSuppressions({ db: f.db, settings, killSwitch: null, sendingLive: false, fetch }, b, now)).toBe(1);
    expect(calls[0]).toMatchObject({ method: "POST", body: { phone: "+13035551234", email: "owner@acme.com", external_id: "L1", reason: "unsubscribe" } });
    expect(f.of("outboundLead", "update")[0]).toMatchObject({ data: { voiceSyncedAt: now } });
  });
  it("a bridge failure never throws out of the tick", async () => {
    const f = fakeDb({ outboundLead: { findMany: () => [{ id: "L1", phone: "+13035551234", email: "", status: "bounced" }] } });
    const fetch: FetchFn = async () => ({ ok: false, status: 502, json: async () => ({}) });
    await expect(voiceTick({ db: f.db, settings, killSwitch: null, sendingLive: false, fetch, env, now: () => now })).resolves.toBeTruthy();
    expect(f.of("klyDecision", "create")[0]).toMatchObject({ data: { kind: "error" } });
    expect(f.of("outboundLead", "update")).toHaveLength(0);
  });
});

describe("gift by text (v1.1)", () => {
  const ready = { voiceStatus: "gift_yes", voiceDelivery: "sms", voiceSmsPhone: "+17205559876", voiceDeliveredAt: null as Date | null, voiceSmsFailedAt: null as Date | null, giftId: "g", giftToken: "tok", adId: "ad", status: "ad_made" };
  function setup(o: Record<string, unknown>, smsStatus: number) {
    let state = lead({ ...ready, ...o });
    let voiceSends = 0;
    const mails: string[] = [];
    const f = fakeDb({
      outboundLead: { findMany: () => [state], update: (a) => ((state = { ...state, ...(a as { data: object }).data }), state) },
      outboundVoiceEvent: { findFirst: () => null },
      outboundSend: { count: () => voiceSends, create: () => (voiceSends++, { id: "S" }) },
      outboundMailbox: { findUnique: () => ({ id: "M", address: "ozzy@getkomendly.com" }) },
    });
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetch: FetchFn = async (url, init) => (calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined }), { ok: smsStatus === 200, status: smsStatus, json: async () => ({}) });
    const d = { db: f.db, settings, killSwitch: null, sendingLive: true, env, fetch, transport: () => async (m: { to: string }) => void mails.push(m.to) };
    return { f, d, calls, mails, cfg: outboundEnv(env), state: () => state };
  }
  it("texts once, never emails, idempotent across ticks", async () => {
    const t = setup({}, 200);
    expect(await sendVoiceGifts(t.d, t.cfg, now)).toBe(1);
    expect(await sendVoiceGifts(t.d, t.cfg, now)).toBe(0);
    expect(t.calls).toHaveLength(1);
    const body = t.calls[0]?.body as { external_id: string; to: string; body: string };
    expect(t.calls[0]?.url).toBe(`${b.url}/sms`);
    expect(body).toEqual({ external_id: "L1", to: "+17205559876", body: "Hi from Komendly! Here are the free ads we made for Acme Roofing: https://www.komendly.com/g/c" });
    expect(t.mails).toEqual([]);
    expect(t.state()).toMatchObject({ voiceDeliveredVia: "sms" });
  });
  it("409 falls back to the email exactly once", async () => {
    const t = setup({}, 409);
    expect(await sendVoiceGifts(t.d, t.cfg, now)).toBe(1);
    expect(await sendVoiceGifts(t.d, t.cfg, now)).toBe(0);
    expect(t.calls).toHaveLength(1);
    expect(t.mails).toEqual(["owner@acme.com"]);
    expect(t.state()).toMatchObject({ voiceDeliveredVia: "email" });
  });
  it("no email + 409: alert, no email, retries SMS for 24 h then stops", async () => {
    const t = setup({ email: "" }, 409);
    expect(await sendVoiceGifts(t.d, t.cfg, now)).toBe(0);
    expect(await sendVoiceGifts(t.d, t.cfg, new Date(now.getTime() + 3_600_000))).toBe(0);
    expect(t.calls).toHaveLength(2);
    expect(await sendVoiceGifts(t.d, t.cfg, new Date(now.getTime() + 86_400_001))).toBe(0);
    expect(t.calls).toHaveLength(2);
    expect(t.mails).toEqual([]);
    expect(t.f.of("klyDecision", "create")[0]).toMatchObject({ data: { kind: "error" } });
    expect(t.state()).toMatchObject({ voiceDeliveredAt: null, voiceSmsFailedAt: now });
  });
  it("stores delivery and sms_phone from the event", async () => {
    const f = fakeDb({ outboundVoiceEvent: NO_EVENT, outboundLead: { findUnique: () => lead() } });
    await ingestEvent(f.db, { id: 9, external_id: "L1", type: "gift_yes", email: null, detail: null, call_id: null, delivery: "sms", sms_phone: "+17205559876", at: now.toISOString() }, now);
    expect(f.of("outboundLead", "update")[0]).toMatchObject({ data: { voiceDelivery: "sms", voiceSmsPhone: "+17205559876" } });
    expect(f.of("outboundVoiceEvent", "create")[0]).toMatchObject({ data: { delivery: "sms", smsPhone: "+17205559876" } });
  });
});
