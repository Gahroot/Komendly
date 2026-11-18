import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { headerValue, parseAddress, stripQuotedReply, verifySvixSignature } from "../inbound";
import { dueEmail, type LifecycleCandidate } from "../lifecycle/select";
import { dueStudioEmail, type StudioDropCandidate } from "../lifecycle/studio-drop";

const KEY = Buffer.from("test-secret-key-0123456789");
const SECRET = `whsec_${KEY.toString("base64")}`;
const sign = (id: string, ts: string, body: string) => createHmac("sha256", KEY).update(`${id}.${ts}.${body}`).digest("base64");

describe("verifySvixSignature", () => {
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);
  const body = '{"type":"email.received"}';
  it("accepts a valid v1 signature (among several)", () => {
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: ts, signature: `v1,bogus v1,${sign("msg_1", ts, body)}` }, body, now)).toBe(true);
  });
  it("rejects a tampered body, wrong id, missing headers and old timestamps", () => {
    const sig = `v1,${sign("msg_1", ts, body)}`;
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: ts, signature: sig }, body + " ", now)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: "msg_2", timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: null, timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: ts, signature: sig }, body, now + 6 * 60_000)).toBe(false);
    expect(verifySvixSignature("whsec_" + Buffer.from("other").toString("base64"), { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toBe(false);
  });
});

describe("parseAddress / headerValue", () => {
  it("parses name + email", () => {
    expect(parseAddress('"Jane Doe" <Jane@X.com>')).toEqual({ email: "jane@x.com", name: "Jane Doe" });
    expect(parseAddress("Jane <jane@x.com>")).toEqual({ email: "jane@x.com", name: "Jane" });
    expect(parseAddress("jane@x.com")).toEqual({ email: "jane@x.com", name: null });
  });
  it("reads headers from object or list", () => {
    expect(headerValue({ "In-Reply-To": "<a@b>" }, "in-reply-to")).toBe("<a@b>");
    expect(headerValue([{ name: "In-Reply-To", value: "<a@b>" }], "in-reply-to")).toBe("<a@b>");
    expect(headerValue(null, "in-reply-to")).toBeNull();
  });
});

describe("stripQuotedReply", () => {
  it("cuts at 'On ... wrote:' (also wrapped over two lines)", () => {
    expect(stripQuotedReply("Thanks Nolan!\n\nOn Mon, 1 Nov 2026 at 10:00, Nolan <nolan@komendly.com> wrote:\n> hi")).toBe("Thanks Nolan!");
    expect(stripQuotedReply("Yes please\nOn Mon, 1 Nov 2026, Nolan from Komendly <nolan@komendly.com>\nwrote:\n> hi")).toBe("Yes please");
  });
  it("cuts a trailing quote block but keeps inline quotes", () => {
    expect(stripQuotedReply("Sounds good\n\n> old\n> older\n")).toBe("Sounds good");
    expect(stripQuotedReply("> your question\nmy answer")).toBe("> your question\nmy answer");
  });
  it("cuts Outlook history, normalises CRLF and caps length", () => {
    expect(stripQuotedReply("Hi\r\n-----Original Message-----\r\nFrom: x")).toBe("Hi");
    expect(stripQuotedReply("a".repeat(9000))).toHaveLength(8000);
    expect(stripQuotedReply(null)).toBe("");
  });
});

describe("drip pause after a reply", () => {
  const H = 3_600_000;
  const T0 = new Date("2026-11-01T00:00:00Z");
  const at = (h: number) => new Date(T0.getTime() + h * H);
  const cand = (o: Partial<LifecycleCandidate> = {}): LifecycleCandidate => ({
    userId: "u1", email: "jane@yahoo.com", name: "Jane", workspaceId: "w1", adsSignup: true,
    signedUpAt: at(-2), emailVerifiedAt: at(-1.5), paid: false, unsubscribed: false,
    trialRunId: "r1", trialCompletedAt: T0, readyAdCount: 11, sent: [], ...o,
  });
  it("stops marketing lifecycle emails", () => {
    expect(dueEmail(cand(), at(25))?.kind).toBe("how_to_run");
    expect(dueEmail(cand({ replied: true }), at(25))).toBeNull();
    expect(dueEmail(cand({ replied: true }), at(70.5))).toBeNull();
  });
  it("keeps transactional verify codes", () => {
    const unverified = cand({ emailVerifiedAt: null, trialRunId: null, trialCompletedAt: null, signedUpAt: T0 });
    expect(dueEmail({ ...unverified, replied: true }, at(2))?.kind).toBe("verify_nudge");
  });
  it("stops the Studio drip except transactional studio_ready", () => {
    const S = new Date("2026-11-12T00:00:00Z");
    const sat = (h: number) => new Date(S.getTime() + h * H);
    const sc = (o: Partial<StudioDropCandidate> = {}): StudioDropCandidate => ({
      userId: "u1", email: "jane@yahoo.com", name: "Jane", signedUpAt: sat(-24 * 30), contactable: true, paid: false, paidWorkspace: false,
      testimonialsUser: false, unsubscribed: false, suspended: false, workspaceId: "w1", studioSessions: 0, freeVideosLeft: 1,
      firstFreeVideoAt: null, lastEmailAt: null, sent: [], rewards: [], ...o,
    });
    expect(dueStudioEmail(sc(), sat(60), S)?.kind).toBe("studio_d0");
    expect(dueStudioEmail(sc({ replied: true }), sat(60), S)).toBeNull();
    expect(dueStudioEmail(sc({ replied: true, firstFreeVideoAt: sat(59) }), sat(60), S)?.kind).toBe("studio_ready");
  });
});
