import { describe, expect, it } from "vitest";
import { seededRng } from "../src/arms";
import type { StoredMailbox } from "../src/mailboxes";
import { composeWarmup, composeWarmupReply, engageMailbox, engagementPlan, isWarmupMessageId, isWarmupSender, junkFolder, pairKey, planWarmupPairs, receiveCap, warmupHealthTick, warmupMessageId, warmupSendTick, warmupVerdict, type ImapLike, type WarmupSettings } from "../src/warmup";
import { fakeDb } from "./fakes";

const S: WarmupSettings = { warmupEnabled: true, warmupPerDay: 40, warmupGmailCap: 25, warmupReplyPct: 35, warmupMinDays: 14, warmupReadySpamPct: 10, warmupPauseSpamPct: 25 };
const SECRET = "test-secret";
const now = new Date("2026-12-10T20:00:00Z"); // 15:00 ET

function box(id: string, domain: string, provider = "maildoso", row: Partial<StoredMailbox["row"]> = {}): StoredMailbox {
  return { id, address: `${id}@${domain}`, name: provider === "gmail" ? "Ozzy Grout" : "Nolan at Komendly", user: `${id}@${domain}`, appPassword: "x".repeat(10), smtpHost: "smtp", smtpPort: 465, imapHost: "imap", imapPort: 993, provider, domain, row: { id, paused: false, pausedReason: null, warmupEnabled: true, warmupSince: null, warmupPolledAt: null, coldStartedAt: null, ...row } as StoredMailbox["row"] };
}

describe("pairing", () => {
  const senders = ["a", "b", "c", "d", "e", "f"].flatMap((d) => [1, 2, 3, 4].map((n) => ({ id: `${d}${n}`, domain: d, want: 3 })));
  const receivers = senders.map((s) => ({ id: s.id, domain: s.domain, cap: 60, receivedToday: 0 }));
  it("prefers another domain, never repeats a pair, meets the per-mailbox target", () => {
    const plan = planWarmupPairs(senders, receivers, new Set(), "salt");
    const dom = (id: string) => id[0];
    expect(plan.every((p) => dom(p.senderId) !== dom(p.recipientId))).toBe(true);
    const keys = plan.map((p) => pairKey(p.senderId, p.recipientId));
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of ["a1", "b1"]) expect(plan.filter((p) => p.senderId === s).length).toBe(3);
  });
  it("skips pairs already used today and falls back to the same domain only when needed", () => {
    const used = new Set(receivers.filter((r) => r.domain !== "a").map((r) => pairKey("a1", r.id)));
    const plan = planWarmupPairs([{ id: "a1", domain: "a", want: 1 }], receivers, used, "salt");
    expect(plan).toHaveLength(1);
    expect(plan[0]?.recipientId).toMatch(/^a[234]$/);
  });
  it("caps Gmail receivers and Gmail never sends", () => {
    expect(receiveCap("gmail", S)).toBe(25);
    expect(receiveCap("maildoso", S)).toBe(60);
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, domain: `d${i % 6}`, want: 3 }));
    const plan = planWarmupPairs(many, [{ id: "g", domain: "getkomendly.com", cap: 25, receivedToday: 20 }], new Set(), "x", 500);
    expect(plan.length).toBe(5);
    expect(isWarmupSender(box("g", "getkomendly.com", "gmail"))).toBe(false);
    expect(isWarmupSender(box("m", "trykomendly.com", "maildoso", { paused: true, pausedReason: "admin" }))).toBe(false);
    expect(isWarmupSender(box("m", "trykomendly.com", "maildoso", { paused: true, pausedReason: "auto: warm-up spam placement 30%" }))).toBe(true);
    expect(isWarmupSender(box("m", "trykomendly.com", "maildoso", { warmupEnabled: false }))).toBe(false);
  });
});

describe("recognition", () => {
  it("recognises Kly warm-up ids, not real replies or forged tags", () => {
    const id = warmupMessageId("trykomendly.com", SECRET);
    expect(id).toMatch(/^<[0-9a-z]{16}\.[0-9a-z]{9}@trykomendly\.com>$/);
    expect(isWarmupMessageId(id, SECRET)).toBe(true);
    expect(isWarmupMessageId(id.slice(1, -1), SECRET)).toBe(true);
    expect(isWarmupMessageId(id, "other-secret")).toBe(false);
    expect(isWarmupMessageId("<CAKx1y2z3=abc@mail.gmail.com>", SECRET)).toBe(false);
    expect(isWarmupMessageId("<0123456789abcdef.000000000@x.com>", SECRET)).toBe(false);
    expect(isWarmupMessageId(null, SECRET)).toBe(false);
  });
  it("composes plain varied mail with no links", () => {
    const rng = seededRng(7);
    const subjects = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const m = composeWarmup(rng, "Nolan at Komendly", "Ozzy at Komendly");
      subjects.add(m.subject);
      expect(m.text).not.toMatch(/https?:|www\.|unsubscribe/i);
      expect(m.text).toMatch(/Nolan$/);
    }
    expect(subjects.size).toBeGreaterThan(5);
    expect(composeWarmupReply(rng, "Ozzy", "Nolan", "Timeline").subject).toBe("Re: Timeline");
    expect(composeWarmupReply(rng, "Ozzy", "Nolan", "Re: Timeline").subject).toBe("Re: Timeline");
  });
});

describe("engagement decisions", () => {
  const base = { seen: false, flagged: false, depth: 1, maxDepth: 2, canReply: true, alreadyEngaged: false };
  it("rescues spam to the inbox and records a spam placement", () => {
    const p = engagementPlan({ ...base, folder: "spam" }, () => 0.99);
    expect(p).toMatchObject({ placement: "spam", rescue: true, markRead: true, file: false, reply: true });
  });
  it("reads, files and replies only within the thread depth; Gmail never replies", () => {
    expect(engagementPlan({ ...base, folder: "inbox" }, () => 0)).toMatchObject({ placement: "inbox", markRead: true, star: true, file: true, reply: true });
    expect(engagementPlan({ ...base, folder: "inbox", maxDepth: 1 }, () => 0.99)).toMatchObject({ star: false, reply: false });
    expect(engagementPlan({ ...base, folder: "inbox", canReply: false }, () => 0.5).reply).toBe(false);
    expect(engagementPlan({ ...base, folder: "inbox", alreadyEngaged: true, seen: true }, () => 0)).toMatchObject({ placement: null, file: true, reply: false, star: false });
  });
  it("finds the junk folder by special use, then by name", () => {
    expect(junkFolder([{ path: "INBOX" }, { path: "[Gmail]/Spam", specialUse: "\\Junk" }])).toBe("[Gmail]/Spam");
    expect(junkFolder([{ path: "INBOX" }, { path: "INBOX.Junk" }])).toBe("INBOX.Junk");
    expect(junkFolder([{ path: "INBOX" }])).toBeNull();
  });
  it("only touches warm-up mail with a DB row for this receiver, rescues and files it", async () => {
    const wid = warmupMessageId("usekomendly.com", SECRET);
    const spamId = warmupMessageId("lovekomendly.com", SECRET);
    const ops: string[] = [];
    let folder = "";
    const imap: ImapLike = {
      connect: async () => undefined, logout: async () => undefined,
      list: async () => [{ path: "INBOX" }, { path: "Spam", specialUse: "\\Junk" }],
      mailboxCreate: async (p) => ops.push(`create ${p}`),
      getMailboxLock: async (p) => ((folder = p), { release: () => undefined }),
      search: async () => [1, 2],
      fetchAll: async () => (folder === "INBOX" ? [{ uid: 1, envelope: { messageId: wid } }, { uid: 2, envelope: { messageId: "<real@prospect.com>" } }] : [{ uid: 2, envelope: { messageId: spamId } }]),
      messageFlagsAdd: async (r, f) => (ops.push(`${folder} flag ${f.join()} ${r.join()}`), true),
      messageMove: async (r, to) => ops.push(`${folder} move ${r.join()} -> ${to}`),
    };
    const f = fakeDb({ klyWarmupMessage: { findMany: (a) => {
      const ids = (a as { where: { messageId: { in: string[] } } }).where.messageId.in;
      return ids.map((m) => ({ id: m === wid ? "w1" : "w2", messageId: m, depth: 1, maxDepth: 1, seenAt: null }));
    } } });
    const r = await engageMailbox(f.db, box("r", "trykomendly.com"), S, SECRET, now, () => 0.99, () => imap);
    expect(r).toMatchObject({ inbox: 1, spam: 1, filed: 1 });
    expect(ops).toContain("create Warmup");
    expect(ops).toContain("INBOX move 1 -> Warmup");
    expect(ops).toContain("Spam move 2 -> INBOX");
    expect(ops.some((o) => o.startsWith("INBOX") && o.includes(" 2"))).toBe(false); // the real mail is untouched
  });
});

describe("sending", () => {
  it("sends due warm-up mail between pool mailboxes, never from Gmail, and records it in one createMany", async () => {
    const boxes = [box("a", "trykomendly.com"), box("b", "usekomendly.com"), box("c", "lovekomendly.com"), box("g", "getkomendly.com", "gmail")];
    const sent: Array<{ from: string; to: string; messageId: string }> = [];
    const f = fakeDb({ klyWarmupMessage: { groupBy: () => [] } });
    const r = await warmupSendTick({ db: f.db, settings: S, boxes, transport: () => async (m) => void sent.push(m), now, rng: seededRng(1), secret: SECRET, rt: { lastHealthAt: 0 } });
    expect(r.sent).toBeGreaterThan(0);
    expect(sent.every((m) => !m.from.includes("getkomendly.com"))).toBe(true);
    expect(sent.every((m) => isWarmupMessageId(m.messageId, SECRET))).toBe(true);
    expect(f.of("klyWarmupMessage", "createMany")).toHaveLength(1);
  });
});

describe("readiness / auto-pause", () => {
  it("pauses above 25% spam, resumes under 10%, ignores tiny samples", () => {
    expect(warmupVerdict({ inbox: 60, spam: 40, missing: 0 }, S, false)).toBe("pause");
    expect(warmupVerdict({ inbox: 80, spam: 20, missing: 0 }, S, false)).toBeNull();
    expect(warmupVerdict({ inbox: 5, spam: 5, missing: 0 }, S, false)).toBeNull();
    expect(warmupVerdict({ inbox: 95, spam: 5, missing: 0 }, S, true)).toBe("resume");
  });
  it("auto-pauses cold sending with a KlyDecision while warm-up continues", async () => {
    const b = box("a", "trykomendly.com");
    const f = fakeDb({ klyWarmupMessage: { groupBy: () => [{ senderId: "a", placement: "inbox", _count: { _all: 30 } }, { senderId: "a", placement: "spam", _count: { _all: 20 } }] } });
    const out = await warmupHealthTick({ db: f.db, settings: S, boxes: [b], now, rt: { lastHealthAt: 0 } });
    expect(out[0]).toMatch(/paused/);
    expect((f.of("outboundMailbox", "update")[0] as { data: { pausedReason: string } }).data.pausedReason).toMatch(/^auto: warm-up spam placement 40%/);
    expect(f.of("klyDecision", "create")).toHaveLength(1);
    expect(isWarmupSender(b)).toBe(true);
  });
});
