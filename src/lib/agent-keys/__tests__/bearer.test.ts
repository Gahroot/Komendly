// Hits the dev DB from .env.local (creates and deletes its own users).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ cookie: null as string | null, headers: new Headers() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "session_token" && state.cookie ? { name: n, value: state.cookie } : undefined) }),
  headers: async () => state.headers,
}));

import { prisma } from "@/lib/prisma";
import { getCookieUser, getCurrentUser } from "@/lib/auth";
import { generateApiKey, hashApiKey, keyPrefix } from "../keys";

const tag = `agentkey-test-${Date.now()}`;
const ids = { a: "", b: "", ws: "" };
let liveKey = "";
let revokedKey = "";

function bearer(key: string, route = "GET /api/ads/runs") {
  state.headers = new Headers({ authorization: `Bearer ${key}`, "x-kmd-route": route });
}

beforeAll(async () => {
  const a = await prisma.user.create({ data: { email: `${tag}-a@example.com`, passwordHash: "x", name: "Cookie" } });
  const b = await prisma.user.create({ data: { email: `${tag}-b@example.com`, passwordHash: "x", name: "Agent" } });
  ids.a = a.id;
  ids.b = b.id;
  liveKey = generateApiKey();
  revokedKey = generateApiKey();
  await prisma.agentApiKey.createMany({
    data: [
      { userId: b.id, workspaceId: "ws-test", name: "live", prefix: keyPrefix(liveKey), keyHash: hashApiKey(liveKey) },
      { userId: b.id, workspaceId: "ws-test", name: "revoked", prefix: keyPrefix(revokedKey), keyHash: hashApiKey(revokedKey), revokedAt: new Date() },
    ],
  });
  await prisma.session.create({ data: { userId: a.id, token: `${tag}-session`, expiresAt: new Date(Date.now() + 3_600_000) } });
});

afterAll(async () => {
  await prisma.adsEvent.deleteMany({ where: { userId: { in: [ids.a, ids.b] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });
  await prisma.$disconnect();
});

describe("bearer API key auth", () => {
  it("resolves a valid key to its user and tracks api_used once a day", async () => {
    state.cookie = null;
    bearer(liveKey);
    expect((await getCurrentUser())?.id).toBe(ids.b);
    expect((await getCurrentUser())?.id).toBe(ids.b);
    const used = await prisma.adsEvent.count({ where: { name: "api_used", userId: ids.b } });
    expect(used).toBe(1);
    const row = await prisma.agentApiKey.findUnique({ where: { keyHash: hashApiKey(liveKey) } });
    expect(row?.lastUsedAt).not.toBeNull();
  });

  it("rejects revoked and unknown keys", async () => {
    state.cookie = null;
    bearer(revokedKey);
    expect(await getCurrentUser()).toBeNull();
    bearer(generateApiKey());
    expect(await getCurrentUser()).toBeNull();
  });

  it("gives the cookie session priority over a bearer key", async () => {
    state.cookie = `${tag}-session`;
    bearer(liveKey);
    expect((await getCurrentUser())?.id).toBe(ids.a);
  });

  it("refuses keys on refused routes and without the middleware route header", async () => {
    state.cookie = null;
    bearer(liveKey, "POST /api/account/api-keys");
    expect(await getCurrentUser()).toBeNull();
    bearer(liveKey, "GET /api/admin/users");
    expect(await getCurrentUser()).toBeNull();
    state.headers = new Headers({ authorization: `Bearer ${liveKey}` });
    expect(await getCurrentUser()).toBeNull();
    bearer(liveKey);
    expect(await getCookieUser()).toBeNull();
  });
});
