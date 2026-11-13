import { describe, expect, it } from "vitest";
import { classifyRcpt, verdictOf, verifyTick } from "../src/verify";

describe("own email checker", () => {
  it("reads mail-server replies like Reacher", () => {
    expect(classifyRcpt(250, "2.1.5 OK")).toBe("ok");
    expect(classifyRcpt(550, "5.1.1 The email account that you tried to reach does not exist.")).toBe("invalid");
    expect(classifyRcpt(550, "5.4.1 Recipient address rejected: Access denied. AS(201806281)")).toBe("invalid");
    expect(classifyRcpt(450, "4.2.0 <a@b.c>: Recipient address rejected: Greylisted, see postgrey")).toBe("temp");
    expect(classifyRcpt(554, "5.7.1 Service unavailable; Client host [1.2.3.4] blocked using Spamhaus")).toBe("blocked");
    expect(classifyRcpt(552, "5.2.2 The recipient's inbox is out of storage space")).toBe("invalid");
    expect(classifyRcpt(421, "4.7.0 Try again later")).toBe("temp");
    expect(classifyRcpt(450, "4.1.1 <a@b.c>: Recipient address rejected: unverified address")).toBe("temp");
    expect(classifyRcpt(550, "5.7.25 <a@b.c>: Recipient address rejected: client has no PTR")).toBe("blocked");
    expect(classifyRcpt(554, "CMGW bizsmtp Connection rejected. Reverse DNS for 152.1.2.3 failed")).toBe("blocked");
  });
  it("groups mail hosts by provider", async () => {
    const { mxProvider } = await import("../src/verify");
    expect(mxProvider("bigsky-com.mail.protection.outlook.com.")).toBe("protection.outlook.com");
    expect(mxProvider("aspmx.l.google.com")).toBe("google.com");
  });
  it("spots catch-all domains", () => {
    expect(verdictOf("ok", "invalid")).toBe("valid");
    expect(verdictOf("ok", "ok")).toBe("catch_all");
    expect(verdictOf("invalid", null)).toBe("invalid");
    expect(verdictOf("temp", null)).toBe("retry");
  });
  it("fails bad addresses, retries temporary trouble once, pauses when refused", async () => {
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const leads = [{ id: "a", email: "x@a.com", emailCheck: null }, { id: "b", email: "x@b.com", emailCheck: null }, { id: "c", email: "x@c.com", emailCheck: "retry" }];
    const db = { outboundLead: { findMany: async () => leads, update: async (a: { where: { id: string }; data: Record<string, unknown> }) => (updates.push({ id: a.where.id, data: a.data }), null) } };
    const res = { "x@a.com": "invalid", "x@b.com": "retry", "x@c.com": "retry" } as const;
    const rt = { pausedUntil: 0, skip: new Map<string, number>() };
    const r = await verifyTick(db as never, rt, new Date(), async (e) => ({ result: res[e as keyof typeof res], detail: "t" }));
    expect(r?.invalid).toBe(1);
    const by = Object.fromEntries(updates.map((u) => [u.id, u.data]));
    expect(by.a).toMatchObject({ emailCheck: "invalid", status: "failed" });
    expect(by.b).toMatchObject({ emailCheck: "retry" });
    expect(by.c).toMatchObject({ emailCheck: "unknown" });
    // Microsoft refusing: skip that provider only; Google refusing: pause everything.
    const rt2 = { pausedUntil: 0, skip: new Map<string, number>() };
    await verifyTick(db as never, rt2, new Date(), async () => ({ result: "blocked", detail: "t", provider: "protection.outlook.com" }));
    expect(rt2.pausedUntil).toBe(0);
    expect(rt2.skip.get("protection.outlook.com")).toBeGreaterThan(Date.now());
    await verifyTick(db as never, rt2, new Date(), async () => ({ result: "blocked", detail: "t", provider: "google.com" }));
    expect(rt2.pausedUntil).toBeGreaterThan(Date.now());
  });
});
