import { describe, expect, it, vi } from "vitest";
import { checkShopifyEndpoints, shopifyTick } from "./shopify";

const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
function fakeDb(enabled: boolean) {
  const beats: Record<string, unknown> = {};
  return {
    beats,
    adsFeatureFlag: { findUnique: vi.fn(async () => (enabled ? { enabled: true } : null)) },
    engineHeartbeat: { findUnique: vi.fn(async () => null), upsert: vi.fn(async (a: { create: { meta: unknown } }) => { beats.last = a.create.meta; }) },
    shopifyShop: { count: vi.fn(async () => 2) },
    shopifyCharge: { count: vi.fn(async () => 1) },
  };
}
const goodFetch = vi.fn(async (url: string | URL | Request) => (String(url).endsWith("/health") ? res(200, { ok: true }) : res(401)));

describe("shopify engine loop", () => {
  it("kill switch off: no cycle, no heartbeat", async () => {
    const db = fakeDb(false);
    expect(await shopifyTick(db as never, { fetchFn: goodFetch as never })).toBeNull();
    expect(db.engineHeartbeat.upsert).not.toHaveBeenCalled();
  });
  it("outputs = installs + paid charges; healthy endpoints = ok heartbeat", async () => {
    const db = fakeDb(true);
    expect(await shopifyTick(db as never, { fetchFn: goodFetch as never, env: {} })).toEqual({ ok: true, outputs: 3 });
    expect((db.beats.last as { outputs: number }).outputs).toBe(3);
  });
  it("broken endpoint fails the heartbeat", async () => {
    const db = fakeDb(true);
    const bad = vi.fn(async (url: string | URL | Request) => (String(url).endsWith("/health") ? res(200, { ok: true }) : res(404)));
    expect((await shopifyTick(db as never, { fetchFn: bad as never, env: {} }))?.ok).toBe(false);
    expect((db.beats.last as { lastError: string }).lastError).toMatch(/expected 401/);
    expect(await checkShopifyEndpoints("https://x", vi.fn(async () => res(503, { ok: false })) as never)).toMatch(/health 503/);
  });
});
