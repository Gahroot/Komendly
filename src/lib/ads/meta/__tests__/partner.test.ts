import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  metaConnection: { findUnique: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  metaOAuthState: { deleteMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  adsWorkspace: { findUnique: vi.fn() },
  adsFeatureFlag: { upsert: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

import { encryptToken } from "../core/crypto";
import { partnerSystemToken, scopeToSelection, systemTokenFor } from "../core/partner";
import { disconnectMeta, loadMetaToken } from "../connection";
import { PARTNER_STATE_PREFIX, finishMetaConnect, partnerConnectTarget } from "../oauth-flow";
import { listPartnerAssets, partnerBusinessId } from "../partner";
import { partnerSelectionMatches } from "../publish-request";

const KEY = randomBytes(32);
const sealed = (accessToken: string) => encryptToken(JSON.stringify({ mode: "graph", accessToken }), KEY);
const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));

beforeEach(() => {
  vi.stubEnv("ADS_TOKEN_KEY", KEY.toString("base64"));
  vi.stubEnv("META_PARTNER_SYSTEM_TOKEN", "");
  vi.stubGlobal("fetch", fetchSpy);
  for (const m of Object.values(db)) for (const f of Object.values(m)) f.mockReset();
  fetchSpy.mockClear();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("disconnect", () => {
  it("viaPartner: deletes the row but never revokes Komendly's token at Meta", async () => {
    db.metaConnection.findUnique.mockResolvedValue({ workspaceId: "w1", viaPartner: true, encryptedToken: sealed("FOUNDER") });
    await disconnectMeta("w1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.metaConnection.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: "w1" } });
  });
  it("customer's own token is still revoked (DELETE /me/permissions), unless revoke: false", async () => {
    db.metaConnection.findUnique.mockResolvedValue({ workspaceId: "w1", viaPartner: false, encryptedToken: sealed("OWNER") });
    await disconnectMeta("w1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toContain("/me/permissions");
    fetchSpy.mockClear();
    await disconnectMeta("w1", { revoke: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.metaConnection.deleteMany).toHaveBeenCalledTimes(2);
  });
});

describe("admin-only forWorkspace", () => {
  it("refuses non-admins, 404s unknown workspaces, returns the target for admins", async () => {
    await expect(partnerConnectTarget({ id: "u1", isAdmin: false }, "w2")).rejects.toMatchObject({ status: 403 });
    expect(db.adsWorkspace.findUnique).not.toHaveBeenCalled();
    db.adsWorkspace.findUnique.mockResolvedValueOnce(null);
    await expect(partnerConnectTarget({ id: "a1", isAdmin: true }, "nope")).rejects.toMatchObject({ status: 404 });
    db.adsWorkspace.findUnique.mockResolvedValueOnce({ id: "w2" });
    await expect(partnerConnectTarget({ id: "a1", isAdmin: true }, "w2")).resolves.toBe("w2");
  });
  it("callback re-checks admin for a partner state and stores nothing for non-admins", async () => {
    const state = `${PARTNER_STATE_PREFIX}abc`;
    db.metaOAuthState.findUnique.mockResolvedValue({ state, workspaceId: "w2", userId: "u1", mode: "graph", codeVerifier: "v", expiresAt: new Date(Date.now() + 60_000) });
    db.user.findUnique.mockResolvedValue({ isAdmin: false });
    const config = { appId: "1", appSecret: "s", redirectUri: "https://x/cb", graphVersion: "v25.0" };
    await expect(finishMetaConnect({ config, state, code: "c", userId: "u1" })).rejects.toMatchObject({ status: 403 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.metaConnection.upsert).not.toHaveBeenCalled();
  });
  it("admin partner callback stores viaPartner on the target, renews other partner rows and enables Meta for it", async () => {
    const state = `${PARTNER_STATE_PREFIX}abc`;
    db.metaOAuthState.findUnique.mockResolvedValue({ state, workspaceId: "w2", userId: "a1", mode: "graph", codeVerifier: "v", expiresAt: new Date(Date.now() + 60_000) });
    db.user.findUnique.mockResolvedValue({ isAdmin: true });
    fetchSpy.mockImplementation(async () => new Response(JSON.stringify({ access_token: "LONG", expires_in: 5_184_000 }), { status: 200 }));
    const config = { appId: "1", appSecret: "s", redirectUri: "https://x/cb", graphVersion: "v25.0" };
    await expect(finishMetaConnect({ config, state, code: "c", userId: "a1" })).resolves.toBe("w2");
    const up = db.metaConnection.upsert.mock.calls[0]![0];
    expect(up.where).toEqual({ workspaceId: "w2" });
    expect(up.create.viaPartner).toBe(true);
    expect(db.metaConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { viaPartner: true, workspaceId: { not: "w2" } } }));
    expect(db.adsFeatureFlag.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "meta_publish:w2" } }));
  });
});

describe("system token override", () => {
  it("only applies to partner connections and only when META_PARTNER_SYSTEM_TOKEN is set", () => {
    expect(systemTokenFor({ viaPartner: true }, {})).toBeNull();
    expect(systemTokenFor({ viaPartner: false }, { META_PARTNER_SYSTEM_TOKEN: "SYS" })).toBeNull();
    expect(systemTokenFor({ viaPartner: true }, { META_PARTNER_SYSTEM_TOKEN: " SYS " })).toEqual({ mode: "graph", accessToken: "SYS" });
    expect(partnerSystemToken({ META_PARTNER_SYSTEM_TOKEN: "  " })).toBeNull();
  });
  it("loadMetaToken reads the env per call: system token for partner rows, stored token otherwise (even when expired)", async () => {
    const expired = encryptToken(JSON.stringify({ mode: "graph", accessToken: "OLD", expiresAt: 1 }), KEY);
    db.metaConnection.findUnique.mockResolvedValue({ workspaceId: "w1", viaPartner: true, encryptedToken: expired });
    await expect(loadMetaToken("w1")).rejects.toMatchObject({ code: "meta_expired" });
    vi.stubEnv("META_PARTNER_SYSTEM_TOKEN", "SYS");
    await expect(loadMetaToken("w1")).resolves.toEqual({ mode: "graph", accessToken: "SYS" });
    db.metaConnection.findUnique.mockResolvedValue({ workspaceId: "w1", viaPartner: false, encryptedToken: sealed("OWN") });
    await expect(loadMetaToken("w1")).resolves.toMatchObject({ accessToken: "OWN" });
  });
});

describe("partner scoping", () => {
  it("a partner workspace only sees and publishes to the picked ad account + Page", () => {
    const accs = [{ id: "act_1" }, { id: "act_2" }];
    const pages = [{ id: "10" }, { id: "20" }];
    expect(scopeToSelection({ adAccountId: "1", pageId: "20" }, accs, pages)).toEqual({ adAccounts: [{ id: "act_1" }], pages: [{ id: "20" }] });
    expect(scopeToSelection({ adAccountId: null, pageId: null }, accs, pages)).toEqual({ adAccounts: [], pages: [] });
    expect(partnerSelectionMatches({ adAccountId: "act_1", pageId: "20" }, { adAccountId: "1", pageId: "20" })).toBe(true);
    expect(partnerSelectionMatches({ adAccountId: "act_1", pageId: "20" }, { adAccountId: "act_2", pageId: "20" })).toBe(false);
    expect(partnerSelectionMatches({ adAccountId: null, pageId: null }, { adAccountId: "act_1", pageId: "20" })).toBe(false);
  });
  it("lists own + partner-shared client assets, skipping business edges that fail", async () => {
    const f = vi.fn(async (input: string | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\/v[\d.]+\//, "");
      const body: Record<string, unknown> = {
        "me/adaccounts": { data: [{ id: "act_1", name: "Mine", funding_source: "x" }] },
        "me/accounts": { data: [{ id: "10", name: "My Page" }] },
        "me/businesses": { data: [{ id: "900" }, { id: "901" }] },
        "900/client_ad_accounts": { data: [{ id: "act_2", name: "Roofer Co" }, { id: "act_1", name: "dup" }] },
        "900/client_pages": { data: [{ id: "20", name: "Roofer Page" }] },
      };
      return body[path] ? new Response(JSON.stringify(body[path]), { status: 200 }) : new Response(JSON.stringify({ error: { message: "no", code: 200 } }), { status: 403 });
    });
    const r = await listPartnerAssets({ accessToken: "T", fetch: f });
    expect(r.adAccounts.map((a) => [a.id, a.name, a.hasPayment])).toEqual([["act_1", "Mine", true], ["act_2", "Roofer Co", false]]);
    expect(r.pages.map((p) => p.id)).toEqual(["10", "20"]);
  });
  it("Business ID comes from env, digits only", () => {
    expect(partnerBusinessId({})).toBeNull();
    expect(partnerBusinessId({ META_PARTNER_BUSINESS_ID: "1234567890" })).toBe("1234567890");
    expect(partnerBusinessId({ META_PARTNER_BUSINESS_ID: "abc" })).toBeNull();
  });
});
