import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseLeadgenPayload, verifyHandshake, verifyMetaSignature } from "../webhook";

const secret = "app-secret";
const body = JSON.stringify({ object: "page", entry: [{ id: "p1", time: 1, changes: [{ field: "leadgen", value: { leadgen_id: "L1", page_id: "p1", form_id: "F1", ad_id: "A1", created_time: 1763700000 } }, { field: "feed", value: {} }] }] });
const sig = (b: string, s = secret) => `sha256=${createHmac("sha256", s).update(b).digest("hex")}`;

describe("Meta webhook signature", () => {
  it("accepts the HMAC of the exact raw body", () => {
    expect(verifyMetaSignature(body, sig(body), secret)).toBe(true);
    expect(verifyMetaSignature(body, sig(body).toUpperCase().replace("SHA256=", "sha256="), secret)).toBe(true);
  });
  it("rejects a wrong secret, a changed body, a missing/malformed header or a missing secret", () => {
    expect(verifyMetaSignature(body, sig(body, "other"), secret)).toBe(false);
    expect(verifyMetaSignature(body + " ", sig(body), secret)).toBe(false);
    expect(verifyMetaSignature(JSON.stringify(JSON.parse(body)), sig(body.replace("L1", "L2")), secret)).toBe(false);
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyMetaSignature(body, `sha256=${"0".repeat(64)}`, secret)).toBe(false);
    expect(verifyMetaSignature(body, sig(body), undefined)).toBe(false);
  });
});

describe("verify-token handshake", () => {
  const q = (t: string, mode = "subscribe") => new URLSearchParams({ "hub.mode": mode, "hub.verify_token": t, "hub.challenge": "12345" });
  it("echoes the challenge only for the right token", () => {
    expect(verifyHandshake(q("tok"), "tok")).toBe("12345");
    expect(verifyHandshake(q("nope"), "tok")).toBeNull();
    expect(verifyHandshake(q("tok", "unsubscribe"), "tok")).toBeNull();
    expect(verifyHandshake(q("tok"), undefined)).toBeNull();
  });
});

describe("leadgen payload", () => {
  it("keeps only leadgen changes", () => {
    expect(parseLeadgenPayload(JSON.parse(body))).toEqual([{ leadgenId: "L1", pageId: "p1", formId: "F1", adId: "A1", createdTime: 1763700000 }]);
    expect(parseLeadgenPayload({ object: "user", entry: [] })).toEqual([]);
    expect(parseLeadgenPayload(null)).toEqual([]);
  });
});
