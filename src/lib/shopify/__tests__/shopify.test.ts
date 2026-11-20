import { createHmac } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const events: Array<{ name: string; data: { props?: Record<string, unknown> } }> = [];
const ledger = new Map<string, number>();
vi.mock("@/lib/ads/events", () => ({ trackAdsEvent: vi.fn(async (name: string, data: { props?: Record<string, unknown> }) => { events.push({ name, data }); }) }));
vi.mock("@/lib/ads/credits", () => ({
  grantSubscriptionCredits: vi.fn(async (_ws: string, ref: string, credits: number) => {
    if (ledger.has(ref)) return { applied: false, delta: ledger.get(ref)!, balance: 0 };
    ledger.set(ref, credits);
    return { applied: true, delta: credits, balance: credits };
  }),
}));
vi.mock("@/lib/auth", () => ({ hashPassword: vi.fn(async () => "hash") }));

import { chargeDecision, isOwnStoreUrl, shopifyFirstTouch, signOpenToken, verifyOpenToken, verifyQueryHmac, verifySessionToken, verifyWebhookHmac } from "../core";
import { applyChargeUpdate, ensureShop, handleShopifyWebhook } from "../server";
import { systemForTouch } from "@/lib/growth/systems";

const SECRET = "shh-secret";
const KEY = "api-key";
const env = { apiKey: KEY, apiSecret: SECRET };
const NOW = new Date("2026-11-18T12:00:00Z");
const sec = Math.floor(NOW.getTime() / 1000);

function jwt(claims: Record<string, unknown>, secret = SECRET, alg = "HS256") {
  const h = Buffer.from(JSON.stringify({ alg, typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
}
const claims = (o: Record<string, unknown> = {}) => ({ iss: "https://demo.myshopify.com/admin", dest: "https://demo.myshopify.com", aud: KEY, sub: "42", exp: sec + 60, nbf: sec - 5, iat: sec - 5, ...o });

describe("session token (App Bridge ID token)", () => {
  it("accepts a valid token and returns the shop", () => {
    expect(verifySessionToken(jwt(claims()), env, NOW)).toEqual({ shop: "demo.myshopify.com", sub: "42" });
  });
  it("rejects bad signature, alg, audience, expiry, shop mismatch", () => {
    expect(verifySessionToken(jwt(claims(), "other"), env, NOW)).toBeNull();
    expect(verifySessionToken(jwt(claims(), SECRET, "none"), env, NOW)).toBeNull();
    expect(verifySessionToken(jwt(claims({ aud: "someone-else" })), env, NOW)).toBeNull();
    expect(verifySessionToken(jwt(claims({ exp: sec - 60 })), env, NOW)).toBeNull();
    expect(verifySessionToken(jwt(claims({ nbf: sec + 60 })), env, NOW)).toBeNull();
    expect(verifySessionToken(jwt(claims({ iss: "https://evil.myshopify.com/admin" })), env, NOW)).toBeNull();
    expect(verifySessionToken(jwt(claims({ dest: "https://evil.com", iss: "https://evil.com/admin" })), env, NOW)).toBeNull();
    expect(verifySessionToken("garbage", env, NOW)).toBeNull();
  });
});

describe("HMAC", () => {
  it("webhook HMAC over the raw body", () => {
    const raw = '{"shop_id":1}';
    const sig = createHmac("sha256", SECRET).update(raw).digest("base64");
    expect(verifyWebhookHmac(raw, sig, SECRET)).toBe(true);
    expect(verifyWebhookHmac(raw + " ", sig, SECRET)).toBe(false);
    expect(verifyWebhookHmac(raw, null, SECRET)).toBe(false);
  });
  it("query HMAC (sorted params, hmac excluded)", () => {
    const q = new URLSearchParams({ shop: "demo.myshopify.com", timestamp: "1", host: "abc" });
    const msg = "host=abc&shop=demo.myshopify.com&timestamp=1";
    q.set("hmac", createHmac("sha256", SECRET).update(msg).digest("hex"));
    expect(verifyQueryHmac(q, SECRET)).toBe(true);
    q.set("shop", "evil.myshopify.com");
    expect(verifyQueryHmac(q, SECRET)).toBe(false);
  });
  it("open link token: signed, expiring, app-relative only", () => {
    const t = signOpenToken({ u: "u1", n: "/ads/runs/r1" }, SECRET, NOW);
    expect(verifyOpenToken(t, SECRET, NOW)).toEqual({ u: "u1", n: "/ads/runs/r1" });
    expect(verifyOpenToken(t, SECRET, new Date(NOW.getTime() + 11 * 60_000))).toBeNull();
    expect(verifyOpenToken(t, "x", NOW)).toBeNull();
    expect(verifyOpenToken(signOpenToken({ u: "u1", n: "//evil.com" }, SECRET, NOW), SECRET, NOW)).toBeNull();
  });
  it("only the merchant's own store", () => {
    expect(isOwnStoreUrl("https://shop.example.com/products/x", "demo.myshopify.com", "https://www.shop.example.com")).toBe(true);
    expect(isOwnStoreUrl("demo.myshopify.com", "demo.myshopify.com", null)).toBe(true);
    expect(isOwnStoreUrl("https://competitor.com", "demo.myshopify.com", "https://shop.example.com")).toBe(false);
  });
});

// ---------- in-memory Prisma fake ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose in-memory Prisma fake
type Row = Record<string, any>;
function p2002() { return new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }); }
function matches(r: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("in" in v) return (v.in as unknown[]).includes(r[k]);
      return true;
    }
    return (r[k] ?? null) === v;
  });
}
function table(unique: string[] = ["id"]) {
  const rows: Row[] = [];
  let n = 0;
  const find = (w: Row) => rows.find((r) => matches(r, w)) ?? null;
  return {
    rows,
    findUnique: vi.fn(async ({ where }: { where: Row }) => find(where)),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: Row }) => { const r = find(where); if (!r) throw new Error("nf"); return r; }),
    findFirst: vi.fn(async ({ where }: { where: Row }) => find(where)),
    count: vi.fn(async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)).length),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const { members: _m, ...d } = data;
      const row: Row = { id: d.id ?? `id${++n}`, ...d };
      if (unique.some((u) => rows.some((r) => r[u] === row[u]))) throw p2002();
      rows.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => Object.assign(find(where)!, data)),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => { const hit = rows.filter((r) => matches(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; }),
  };
}
function fakeDb(sysOn = true) {
  const db: Row = {
    adsFeatureFlag: { findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (where.key === "sys_shopify" && sysOn ? { enabled: true } : null)) },
    user: table(["id", "email"]),
    adsWorkspace: table(),
    shopifyShop: table(["id", "shopDomain"]),
    shopifyCharge: table(["id", "chargeId"]),
    shopifyWebhookEvent: table(),
  };
  db.$transaction = vi.fn(async (fn: (tx: Row) => unknown) => fn(db));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake stands in for PrismaClient
  return db as any;
}
const token = { accessToken: "shpat_x", expiresAt: new Date(NOW.getTime() + 3600_000), refreshToken: "r", scope: "read_products" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake stands in for PrismaClient
const install = (db: any, shop = "demo.myshopify.com") => ensureShop(db, { shop, token, name: "Demo", email: "owner@demo.com", storeUrl: "https://demo.com" }, NOW);

beforeEach(() => {
  events.length = 0;
  ledger.clear();
  process.env.ADS_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("install + attribution + kill switch", () => {
  it("new shop: creates user + workspace, signed_up with firstTouch utm_source=shopify, shopify_installed; token encrypted", async () => {
    const db = fakeDb();
    const r = await install(db);
    expect(r.status).toBe("ok");
    expect(db.user.rows).toHaveLength(1);
    expect(db.adsWorkspace.rows).toHaveLength(1);
    const shop = db.shopifyShop.rows[0];
    expect(shop.accessTokenEnc).toMatch(/^v1\./);
    expect(shop.accessTokenEnc).not.toContain("shpat_x");
    const su = events.find((e) => e.name === "signed_up")!;
    expect(systemForTouch(su.data.props!.firstTouch as { utm_source: string })).toBe("shopify");
    expect(events.find((e) => e.name === "shopify_installed")!.data.props!.system).toBe("shopify");
    // Second load: no new user, no new events.
    events.length = 0;
    await install(db);
    expect(db.user.rows).toHaveLength(1);
    expect(events).toHaveLength(0);
  });
  it("never links an existing account by email", async () => {
    const db = fakeDb();
    db.user.rows.push({ id: "victim", email: "owner@demo.com" });
    await install(db);
    expect(db.user.rows[1].email).toBe("demo@shopify.users.komendly.com");
  });
  it("kill switch off: new installs unavailable, existing shops keep access", async () => {
    const off = fakeDb(false);
    expect((await install(off)).status).toBe("unavailable");
    expect(off.user.rows).toHaveLength(0);
    const db = fakeDb(true);
    await install(db);
    db.adsFeatureFlag.findUnique.mockResolvedValue(null);
    expect((await install(db)).status).toBe("ok");
  });
  it("shopifyFirstTouch traces to the shopify system", () => {
    expect(systemForTouch(shopifyFirstTouch(NOW, "demo.myshopify.com"))).toBe("shopify");
  });
});

describe("webhooks (idempotent)", () => {
  it("app/uninstalled: once per delivery and per install; clears tokens; event once", async () => {
    const db = fakeDb();
    await install(db);
    events.length = 0;
    const w = { topic: "app/uninstalled", shop: "demo.myshopify.com", webhookId: "w1", payload: {} };
    expect(await handleShopifyWebhook(db, w, NOW)).toBe("processed");
    expect(await handleShopifyWebhook(db, w, NOW)).toBe("duplicate");
    expect(await handleShopifyWebhook(db, { ...w, webhookId: "w2" }, NOW)).toBe("processed");
    expect(events.filter((e) => e.name === "shopify_uninstalled")).toHaveLength(1);
    expect(db.shopifyShop.rows[0].accessTokenEnc).toBeNull();
    expect(db.shopifyShop.rows[0].uninstalledAt).toEqual(NOW);
  });
  it("compliance topics answer and shop/redact erases shop data", async () => {
    const db = fakeDb();
    await install(db);
    for (const topic of ["customers/data_request", "customers/redact"]) expect(await handleShopifyWebhook(db, { topic, shop: "demo.myshopify.com", webhookId: topic, payload: {} }, NOW)).toBe("processed");
    await handleShopifyWebhook(db, { topic: "shop/redact", shop: "demo.myshopify.com", webhookId: "r1", payload: {} }, NOW);
    const s = db.shopifyShop.rows[0];
    expect([s.email, s.name, s.accessTokenEnc, s.redactedAt]).toEqual([null, null, null, NOW]);
    expect(await handleShopifyWebhook(db, { topic: "shop/redact", shop: "demo.myshopify.com", webhookId: "r1", payload: {} }, NOW)).toBe("duplicate");
  });
});

describe("billing grants (idempotent)", () => {
  it("decision: first activation, renewal only on a later period end, end only from ACTIVE", () => {
    const p1 = new Date("2026-12-18T00:00:00Z");
    const p2 = new Date("2027-01-17T00:00:00Z");
    expect(chargeDecision({ status: "PENDING", activatedAt: null, periodEnd: null }, { status: "ACTIVE" }).firstActivation).toBe(true);
    expect(chargeDecision({ status: "ACTIVE", activatedAt: NOW, periodEnd: p1 }, { status: "ACTIVE", periodEnd: p1 }).renewalAt).toBeNull();
    expect(chargeDecision({ status: "ACTIVE", activatedAt: NOW, periodEnd: p1 }, { status: "ACTIVE", periodEnd: p2 }).renewalAt).toEqual(p2);
    expect(chargeDecision({ status: "PENDING", activatedAt: null, periodEnd: null }, { status: "DECLINED" }).ended).toBe(false);
  });
  it("webhook + sync replays grant the first period once, renewal once; paid events once", async () => {
    const db = fakeDb();
    await install(db);
    events.length = 0;
    const wh = { topic: "app_subscriptions/update", shop: "demo.myshopify.com", payload: { app_subscription: { admin_graphql_api_id: "gid://shopify/AppSubscription/1", status: "ACTIVE", name: "Komendly Starter" } } };
    await handleShopifyWebhook(db, { ...wh, webhookId: "a" }, NOW);
    await handleShopifyWebhook(db, { ...wh, webhookId: "b" }, NOW);
    const p1 = new Date("2026-12-18T00:00:00Z");
    await applyChargeUpdate(db, "demo.myshopify.com", { chargeId: "gid://shopify/AppSubscription/1", status: "ACTIVE", periodEnd: p1 }, NOW);
    await applyChargeUpdate(db, "demo.myshopify.com", { chargeId: "gid://shopify/AppSubscription/1", status: "ACTIVE", periodEnd: p1 }, NOW);
    expect([...ledger.entries()]).toEqual([["shopify:gid://shopify/AppSubscription/1:p1", 60]]);
    const p2 = new Date("2027-01-17T00:00:00Z");
    const r = await applyChargeUpdate(db, "demo.myshopify.com", { chargeId: "gid://shopify/AppSubscription/1", status: "ACTIVE", periodEnd: p2 }, NOW);
    expect(r.granted).toBe(60);
    await applyChargeUpdate(db, "demo.myshopify.com", { chargeId: "gid://shopify/AppSubscription/1", status: "ACTIVE", periodEnd: p2 }, NOW);
    expect(ledger.size).toBe(2);
    expect(events.filter((e) => e.name === "shopify_charge_activated")).toHaveLength(1);
    const bought = events.filter((e) => e.name === "purchased");
    expect(bought).toHaveLength(1);
    expect(bought[0]!.data.props).toMatchObject({ system: "shopify", amountCents: 4900, key: "starter" });
    expect(db.adsWorkspace.rows[0]).toMatchObject({ adsPlan: "starter", subscriptionStatus: "active" });
  });
  it("plan switch: old charge CANCELLED keeps the new active plan; last one ending cancels", async () => {
    const db = fakeDb();
    await install(db);
    const up = (id: string, status: string, name = "Komendly Starter") => applyChargeUpdate(db, "demo.myshopify.com", { chargeId: id, status, name }, NOW);
    await up("c1", "ACTIVE");
    await up("c2", "ACTIVE", "Komendly Ozzy Ad Department");
    await up("c1", "CANCELLED");
    expect(db.adsWorkspace.rows[0]).toMatchObject({ adsPlan: "ad_department", subscriptionStatus: "active" });
    await up("c2", "CANCELLED");
    expect(db.adsWorkspace.rows[0].subscriptionStatus).toBe("canceled");
  });
  it("test charges grant credits but never count as revenue", async () => {
    const db = fakeDb();
    await install(db);
    events.length = 0;
    await applyChargeUpdate(db, "demo.myshopify.com", { chargeId: "t1", status: "ACTIVE", name: "Komendly Starter", test: true }, NOW);
    expect(events.map((e) => e.name)).toEqual(["shopify_charge_activated"]);
  });
});
