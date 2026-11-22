import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "../../src/lib/ads/meta/core/crypto";
import { workspaceToken } from "../src/jobs/publish-meta";
import type { Db } from "../src/db";

const KEY = randomBytes(32);
const dbWith = (conn: Record<string, unknown> | null) => ({ metaConnection: { findUnique: async () => conn, update: async () => conn } }) as unknown as Db;
const sealed = (t: Record<string, unknown>) => encryptToken(JSON.stringify({ mode: "graph", ...t }), KEY);

afterEach(() => vi.unstubAllEnvs());

describe("workspaceToken: partner system token override", () => {
  it("uses META_PARTNER_SYSTEM_TOKEN for viaPartner connections, even when the stored token expired", async () => {
    vi.stubEnv("ADS_TOKEN_KEY", KEY.toString("base64"));
    const db = dbWith({ viaPartner: true, encryptedToken: sealed({ accessToken: "OLD", expiresAt: 1 }) });
    await expect(workspaceToken(db, "w1", Date.now(), { META_PARTNER_SYSTEM_TOKEN: "SYS" })).resolves.toEqual({ mode: "graph", accessToken: "SYS" });
    await expect(workspaceToken(db, "w1", Date.now(), {})).rejects.toThrow(/Komendly will reconnect/);
  });
  it("ignores the system token for the customer's own connection", async () => {
    vi.stubEnv("ADS_TOKEN_KEY", KEY.toString("base64"));
    const db = dbWith({ viaPartner: false, encryptedToken: sealed({ accessToken: "OWN" }) });
    await expect(workspaceToken(db, "w1", Date.now(), { META_PARTNER_SYSTEM_TOKEN: "SYS" })).resolves.toMatchObject({ accessToken: "OWN" });
  });
});
