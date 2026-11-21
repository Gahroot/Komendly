import { createHmac, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { accountKey, authorizeUrl, connectPath, parseWebhook, pkceChallenge, pkcePair, signConnectToken, signState, tokenExpiry, verifyConnectToken, verifyState, verifyWebhookHmac, type JobberEnv } from "../core";
import { ideasToFocus, jobIdea, mayWriteFocus, mergeIdeas, type AdIdea } from "../mapping";
import { processWebhook, saveConnection, steerWeeklyDrop, type JobberDb } from "../server";
import { getSystem, systemForTouch } from "@/lib/growth/systems";
import { AUTOPILOT_FOCUS_MAX } from "@/lib/ads/autopilot";

const SECRET = "jobber-client-secret";
const env: JobberEnv = { clientId: "cid", clientSecret: SECRET, redirectUri: "https://komendly.com/api/integrations/jobber/callback", apiVersion: "2026-09-25" };
const now = new Date("2026-11-21T12:00:00Z");

describe("OAuth state + PKCE", () => {
  it("round-trips a signed state bound to the PKCE cookie", () => {
    const { verifier, challenge } = pkcePair();
    expect(challenge).toBe(pkceChallenge(verifier));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const state = signState("nonce1", SECRET, now);
    expect(verifyState(state, `nonce1.${verifier}`, SECRET, now)).toEqual({ verifier });
  });
  it("rejects a tampered, expired, foreign or unbound state", () => {
    const v = pkcePair().verifier;
    const state = signState("nonce1", SECRET, now);
    expect(verifyState(state.replace("nonce1", "nonce2"), `nonce2.${v}`, SECRET, now)).toBeNull();
    expect(verifyState(state, `nonce1.${v}`, SECRET, new Date(now.getTime() + 11 * 60_000))).toBeNull();
    expect(verifyState(state, `nonce1.${v}`, "other-secret", now)).toBeNull();
    expect(verifyState(state, `other.${v}`, SECRET, now)).toBeNull();
    expect(verifyState(state, undefined, SECRET, now)).toBeNull();
    expect(verifyState(null, `nonce1.${v}`, SECRET, now)).toBeNull();
  });
  it("builds Jobber's authorize URL with S256 PKCE", () => {
    const u = new URL(authorizeUrl(env, "st", "ch"));
    expect(u.origin + u.pathname).toBe("https://api.getjobber.com/api/oauth/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({ response_type: "code", client_id: "cid", redirect_uri: env.redirectUri, state: "st", code_challenge: "ch", code_challenge_method: "S256" });
  });
  it("signs expiring connect links that carry utm_source=jobber", () => {
    const t = signConnectToken("evt_1", SECRET, now);
    expect(verifyConnectToken(t, SECRET, now)).toBe("evt_1");
    expect(verifyConnectToken(t, "x", now)).toBeNull();
    expect(verifyConnectToken(t, SECRET, new Date(now.getTime() + 8 * 86_400_000))).toBeNull();
    expect(verifyConnectToken(`${t}x`, SECRET, now)).toBeNull();
    const q = new URL(connectPath(t), "https://x").searchParams;
    expect(q.get("utm_source")).toBe("jobber");
    expect(systemForTouch({ utm_source: q.get("utm_source") })).toBe("jobber");
    expect(getSystem("jobber")?.key).toBe("jobber");
  });
  it("reads token expiry from the JWT, else expires_in", () => {
    const jwt = `h.${Buffer.from(JSON.stringify({ exp: 1_800_000_000 })).toString("base64url")}.s`;
    expect(tokenExpiry(jwt, 3600, now).getTime()).toBe(1_800_000_000_000);
    expect(tokenExpiry("opaque", 3600, now).getTime()).toBe(now.getTime() + 3600_000);
  });
});

describe("webhook HMAC + payload", () => {
  const body = JSON.stringify({ data: { webHookEvent: { topic: "JOB_CLOSED", appId: "app", accountId: "MTIz", itemId: "Sm9i", occurredAt: "2026-11-21T10:00:00-06:00" } } });
  const sig = createHmac("sha256", SECRET).update(body).digest("base64");
  it("accepts only the client-secret HMAC of the raw body", () => {
    expect(verifyWebhookHmac(body, sig, SECRET)).toBe(true);
    expect(verifyWebhookHmac(body + " ", sig, SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, sig, "wrong")).toBe(false);
    expect(verifyWebhookHmac(body, null, SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, "short", SECRET)).toBe(false);
  });
  it("parses JSON and legacy payloads", () => {
    expect(parseWebhook(body)).toEqual({ topic: "JOB_CLOSED", accountId: "MTIz", itemId: "Sm9i", occurredAt: "2026-11-21T10:00:00-06:00", appId: "app" });
    const legacy = JSON.stringify({ data: { webHookEvent: { topic: "APP_DISCONNECT", accountId: "MQ==", itemId: "MQ==", occuredAt: "x" } } });
    expect(parseWebhook(legacy)?.occurredAt).toBe("x");
    expect(parseWebhook("not json")).toBeNull();
  });
  it("matches GraphQL global ids to webhook account ids", () => {
    const gid = Buffer.from("gid://Jobber/Account/123").toString("base64");
    expect(accountKey(gid)).toBe("123");
    expect(accountKey("MTIz")).toBe("123");
    expect(accountKey("abc-def")).toBe("abc-def");
  });
});

describe("mapping: finished jobs -> ad ideas -> weekly focus", () => {
  const job = { id: "J1", title: "Smith - Roof", completedAt: "2026-11-20T00:00:00Z", property: { address: { city: "Austin", province: "TX" } }, lineItems: { nodes: [{ name: "Roof replacement" }] } };
  it("uses the line item service and the city, never the client", () => {
    expect(jobIdea(job, now)).toEqual({ jobId: "J1", service: "Roof replacement", city: "Austin", region: "TX", at: "2026-11-20T00:00:00Z" });
    expect(jobIdea({ id: "J2", title: "Johnson - Furnace tune-up", lineItems: { nodes: [] } }, now)?.service).toBe("Furnace tune-up");
    expect(jobIdea({ id: "J3", title: "#1042" }, now)).toBeNull();
    expect(jobIdea(null)).toBeNull();
  });
  it("keeps the newest ideas once each and writes a short focus", () => {
    const mk = (n: number): AdIdea => ({ jobId: `J${n}`, service: `Service number ${n} with a long name`, city: "Round Rock", region: "TX", at: now.toISOString() });
    let ideas: AdIdea[] = [];
    for (let n = 1; n <= 7; n++) ideas = mergeIdeas(ideas, mk(n));
    ideas = mergeIdeas(ideas, mk(5));
    expect(ideas.map((i) => i.jobId)).toEqual(["J5", "J7", "J6", "J4", "J3"]);
    const focus = ideasToFocus(ideas)!;
    expect(focus.length).toBeLessThanOrEqual(AUTOPILOT_FOCUS_MAX);
    expect(focus).toContain("service number 5 with a long name in Round Rock, TX");
    expect(ideasToFocus([])).toBeNull();
  });
  it("never overwrites the member's own focus", () => {
    expect(mayWriteFocus(null, null)).toBe(true);
    expect(mayWriteFocus("ours", "ours")).toBe(true);
    expect(mayWriteFocus("push the Black Friday sale", "ours")).toBe(false);
  });
});

// ---- server: webhook processing against an in-memory AdsEvent / AdsAutopilot ----
type Row = { id: string; name: string; workspaceId: string | null; userId: string | null; props: Record<string, unknown>; createdAt: Date };
function fakeDb(flagOn = true) {
  const events: Row[] = [];
  const autopilot = new Map<string, { focus: string | null }>();
  const matches = (r: Row, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => {
    if (k === "props") { const f = v as { path: string[]; equals: unknown }; return r.props[f.path[0]!] === f.equals; }
    return (r as unknown as Record<string, unknown>)[k] === v;
  });
  const db = {
    adsEvent: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => events.find((r) => matches(r, where)) ?? null,
      create: async ({ data }: { data: Partial<Row> }) => { const r = { id: `e${events.length + 1}`, name: data.name!, workspaceId: data.workspaceId ?? null, userId: data.userId ?? null, props: data.props as Record<string, unknown>, createdAt: now }; events.push(r); return r; },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => { const hits = events.filter((r) => matches(r, where)); hits.forEach((r) => Object.assign(r, data)); return { count: hits.length }; },
    },
    adsAutopilot: {
      findUnique: async ({ where }: { where: { workspaceId: string } }) => autopilot.get(where.workspaceId) ?? null,
      upsert: async ({ where, update }: { where: { workspaceId: string }; update: { focus: string } }) => { autopilot.set(where.workspaceId, { focus: update.focus }); },
    },
    adsFeatureFlag: { findUnique: async () => ({ enabled: flagOn }) },
    engineHeartbeat: { findUnique: async () => null, upsert: async () => undefined },
  };
  return { db: db as unknown as JobberDb, events, autopilot };
}
const jobFetch = (async () => new Response(JSON.stringify({ data: { job: { id: "J9", title: "Leak repair", property: { address: { city: "Tulsa", province: "OK" } } } } }), { status: 200 })) as unknown as typeof fetch;
const tokens = { accessToken: "at", refreshToken: "rt", expiresAt: new Date(now.getTime() + 3600_000) };
const gid = Buffer.from("gid://Jobber/Account/77").toString("base64");

describe("processWebhook", () => {
  beforeEach(() => { process.env.ADS_TOKEN_KEY = randomBytes(32).toString("base64"); });

  it("turns a closed job into the weekly focus and disconnects on APP_DISCONNECT", async () => {
    const { db, events, autopilot } = fakeDb();
    const { connection } = await saveConnection(db, { id: gid, name: "Ace Plumbing" }, tokens, now);
    events[0]!.workspaceId = "ws1";
    events[0]!.props.status = "linked";
    const hook = { topic: "JOB_CLOSED", accountId: "Nzc=", itemId: "Sm9i", occurredAt: null, appId: null };
    expect(await processWebhook(db, env, hook, { fetch: jobFetch, now: () => now })).toBe("idea");
    expect(autopilot.get("ws1")?.focus).toContain("leak repair in Tulsa, OK");
    expect(await processWebhook(db, env, hook, { fetch: jobFetch, now: () => now })).toBe("duplicate");
    expect(await processWebhook(db, env, { ...hook, topic: "APP_DISCONNECT" }, { now: () => now })).toBe("disconnected");
    const p = events.find((e) => e.id === connection.id)!.props;
    expect(p.status).toBe("disconnected");
    expect(p.accessTokenEnc).toBeNull();
    expect(p.refreshTokenEnc).toBeNull();
  });

  it("keeps the member's focus, and skips ideas when sys_jobber is off (disconnect still handled)", async () => {
    const { db, events, autopilot } = fakeDb(false);
    await saveConnection(db, { id: gid, name: "Ace" }, tokens, now);
    events[0]!.workspaceId = "ws1";
    const hook = { topic: "VISIT_COMPLETE", accountId: gid, itemId: "Vg==", occurredAt: null, appId: null };
    expect(await processWebhook(db, env, hook, { fetch: jobFetch, now: () => now })).toBe("off");
    autopilot.set("ws1", { focus: "push gutter cleaning" });
    events[0]!.props.ideas = [{ jobId: "J1", service: "Gutter repair", city: null, region: null, at: now.toISOString() }];
    expect(await steerWeeklyDrop(db, { id: events[0]!.id, workspaceId: "ws1", userId: null, props: events[0]!.props as never }, now)).toBeNull();
    expect(autopilot.get("ws1")?.focus).toBe("push gutter cleaning");
    expect(await processWebhook(db, env, { ...hook, topic: "APP_DISCONNECT" }, { now: () => now })).toBe("disconnected");
  });
});
