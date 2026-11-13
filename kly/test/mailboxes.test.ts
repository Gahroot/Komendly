import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canSendNow, mailboxDayLimit } from "../../src/lib/ads/outbound/policy";
import { checkDomain, domainHealthTick, domainVerdict, type Resolver } from "../src/domains";
import { listMaildosoAccounts, syncMaildoso, toStoreInput, type Fetch } from "../src/maildoso";
import { capacityOf, mapPool, openSecret, planRotation, sealSecret, upsertStoredMailboxes, type RotationCandidate } from "../src/mailboxes";
import { duePolls } from "../src/imap";
import { fakeDb } from "./fakes";

const KEY = randomBytes(32).toString("base64");
const NOW = new Date("2026-11-12T15:00:00Z");
const DAY = 86_400_000;

describe("mailbox store", () => {
  it("seals and opens a password", () => {
    const sealed = sealSecret("s3cret pass", KEY);
    expect(sealed).not.toContain("s3cret");
    expect(openSecret(sealed, KEY)).toBe("s3cret pass");
    expect(() => openSecret(sealed, randomBytes(32).toString("base64"))).toThrow();
  });

  it("upserts idempotently and never resets readyAt/cap on re-import", async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const f = fakeDb({
      outboundMailbox: {
        findMany: () => [...rows.values()],
        create: (a) => {
          const d = (a as { data: Record<string, unknown> }).data;
          rows.set(d.address as string, { id: `id-${rows.size}`, ...d });
          return d;
        },
        update: () => ({}),
      },
    });
    const item = { address: "Amy@Cold-One.com", displayName: "Amy", password: "pw-123456", provider: "maildoso" as const, smtpHost: "smtp.maildoso.com", smtpPort: 587, imapHost: "imap.maildoso.com", imapPort: 993, readyAt: new Date(NOW.getTime() + 14 * DAY), vendorId: "7", vendorStatus: "active" };
    expect(await upsertStoredMailboxes(f.db, KEY, [item], NOW)).toEqual({ created: 1, updated: 0, unchanged: 0 });
    const row = rows.get("amy@cold-one.com");
    expect(row?.domain).toBe("cold-one.com");
    expect(row?.dailyCap).toBe(15);
    expect(openSecret(row?.secretEnc as string, KEY)).toBe("pw-123456");
    expect(await upsertStoredMailboxes(f.db, KEY, [item], NOW)).toEqual({ created: 0, updated: 0, unchanged: 1 });
    expect(await upsertStoredMailboxes(f.db, KEY, [{ ...item, password: "new-pass-1" }], NOW)).toEqual({ created: 0, updated: 1, unchanged: 0 });
    const upd = f.of("outboundMailbox", "update")[0] as { data: Record<string, unknown> };
    expect(upd.data.readyAt).toBeUndefined();
    expect(upd.data.dailyCap).toBeUndefined();
  });
});

describe("maildoso importer", () => {
  const acct = (id: number, extra: Record<string, unknown> = {}) => ({ id, user_id: 1, email_account: `box${id}@d${id % 2}.com`, password: `pw-${id}-xxxx`, first_name: "Ozzy", last_name: null, created_at: "2026-11-01T00:00:00Z", provider: "maildoso", status: "active", is_active: true, imap: { imap_host: "imap.maildoso.com", port: 993 }, smtp: { smtp_host: "smtp.maildoso.com", port: 587 }, ...extra });

  it("pages through accounts-lookup with a bearer token", async () => {
    const calls: string[] = [];
    const f: Fetch = async (url, init) => {
      calls.push(url);
      expect(init.headers.Authorization).toBe("Bearer tok");
      const offset = Number(new URL(url).searchParams.get("offset"));
      const items = offset === 0 ? Array.from({ length: 500 }, (_, i) => acct(i + 1)) : [acct(501)];
      return { ok: true, status: 200, json: async () => ({ items, meta: { total: 501, offset, limit: 500, current: items.length } }) };
    };
    expect(await listMaildosoAccounts("tok", f)).toHaveLength(501);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("/v1/user/accounts-lookup?limit=500&offset=0");
  });

  it("maps credentials, readyAt = created + 14 days, skips Google and unprovisioned", () => {
    const i = toStoreInput(acct(3));
    expect(i).toMatchObject({ address: "box3@d1.com", provider: "maildoso", smtpPort: 587, imapHost: "imap.maildoso.com", vendorId: "3" });
    expect(i?.readyAt?.toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(toStoreInput(acct(4, { provider: "google", smtp: null, imap: null }))).toBeNull();
    expect(toStoreInput(acct(5, { status: "setup_processing" }))).toBeNull();
  });

  it("syncs into the store and pauses Maildoso-suspended mailboxes", async () => {
    const f = fakeDb({ outboundMailbox: { findMany: () => [] } });
    const fetchFn: Fetch = async () => ({ ok: true, status: 200, json: async () => ({ items: [acct(1), acct(2, { status: "suspended_domain_expired" }), acct(3, { provider: "google", smtp: null, imap: null })], meta: { total: 3 } }) });
    const r = await syncMaildoso(f.db, { token: "t", tokenKey: KEY, now: NOW, fetch: fetchFn });
    expect(r).toMatchObject({ listed: 3, skipped: 1, created: 2, suspended: 1 });
    expect(JSON.stringify(f.of("outboundMailbox", "updateMany")[0])).toContain("box2@d0.com");
  });

  it("pre-warmed domains: mailboxes send now and the domain gets its 750/day cap", async () => {
    const f = fakeDb({ outboundMailbox: { findMany: () => [] } });
    const fetchFn: Fetch = async (url) => url.includes("prewarmed-domains")
      ? { ok: true, status: 200, json: async () => [{ id: 9, domain_name: "D1.com", status: "active" }] }
      : { ok: true, status: 200, json: async () => ({ items: [acct(1), acct(2)], meta: { total: 2 } }) };
    const r = await syncMaildoso(f.db, { token: "t", tokenKey: KEY, now: NOW, fetch: fetchFn });
    expect(r).toMatchObject({ created: 2, prewarmed: 1 });
    const created = f.of("outboundMailbox", "create") as Array<{ data: { address: string; readyAt: Date } }>;
    expect(created.find((c) => c.data.address === "box1@d1.com")?.data.readyAt).toEqual(NOW);
    expect(created.find((c) => c.data.address === "box2@d0.com")?.data.readyAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(f.of("outboundDomain", "upsert")).toEqual([{ where: { domain: "d1.com" }, create: { domain: "d1.com", dailyCap: 750 }, update: {} }]);
  });

  it("fails loudly on HTTP errors", async () => {
    await expect(listMaildosoAccounts("t", async () => ({ ok: false, status: 401, json: async () => ({}) }))).rejects.toThrow("401");
  });
});

describe("rotation", () => {
  const box = (id: string, domain: string, sentToday = 0): RotationCandidate => ({ id, domain, limit: 15, sentToday, lastSentAt: null });

  it("spreads sends across domains before doubling up, and respects the per-domain cap", () => {
    const cands = [box("a1", "a.com"), box("a2", "a.com"), box("a3", "a.com"), box("b1", "b.com"), box("c1", "c.com")];
    const pick = planRotation(cands, new Map(), 3, "salt");
    expect(new Set(pick.map((p) => p.domain))).toEqual(new Set(["a.com", "b.com", "c.com"]));
    const capped = planRotation(cands, new Map([["a.com", { cap: 2, sentToday: 1 }]]), 5, "salt");
    expect(capped.filter((p) => p.domain === "a.com")).toHaveLength(1);
    expect(capped).toHaveLength(3);
  });

  it("prefers emptier mailboxes and skips full ones", () => {
    const pick = planRotation([box("x", "a.com", 10), box("y", "a.com", 2), box("z", "a.com", 15)], new Map(), 1, "s");
    expect(pick.map((p) => p.id)).toEqual(["y"]);
  });

  it("is fair over a simulated day: 300 mailboxes on 100 domains", () => {
    const cands = Array.from({ length: 300 }, (_, i) => box(`m${i}`, `d${i % 100}.com`));
    const sent = new Map<string, number>();
    const dom = new Map<string, { cap: number; sentToday: number }>();
    for (let t = 0; t < 400; t++) {
      const now = cands.map((c) => ({ ...c, sentToday: sent.get(c.id) ?? 0 }));
      for (const p of planRotation(now, dom, 10, `t${t}`)) {
        sent.set(p.id, (sent.get(p.id) ?? 0) + 1);
        const d = dom.get(p.domain) ?? { cap: 45, sentToday: 0 };
        dom.set(p.domain, { ...d, sentToday: d.sentToday + 1 });
      }
    }
    const counts = cands.map((c) => sent.get(c.id) ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(Math.max(...[...dom.values()].map((d) => d.sentToday))).toBeLessThanOrEqual(45);
  });
});

describe("readyAt gating + capacity", () => {
  const warm = new Date(NOW.getTime() - 30 * DAY);
  it("blocks cold sends before readyAt and skips Kly's ramp for Maildoso", () => {
    const m = { provider: "maildoso", dailyCap: 15, warmupStartedAt: NOW, readyAt: new Date(NOW.getTime() + DAY) };
    expect(mailboxDayLimit(m, NOW)).toBe(0);
    expect(canSendNow({ ...m, paused: false, lastSentAt: null, sentToday: 0, gapMs: 0 }, NOW)).toEqual({ ok: false, reason: "not_ready" });
    expect(mailboxDayLimit({ ...m, readyAt: new Date(NOW.getTime() - DAY) }, NOW)).toBe(15);
    expect(mailboxDayLimit({ provider: "gmail", dailyCap: 40, warmupStartedAt: NOW }, NOW)).toBe(10);
  });

  it("counts only ready, unpaused mailboxes on unpaused domains, clamped per domain", () => {
    const b = (domain: string, extra: Record<string, unknown> = {}) => ({ domain, paused: false, provider: "maildoso", dailyCap: 15, warmupStartedAt: warm, readyAt: warm, ...extra });
    const boxes = [b("a.com"), b("a.com"), b("a.com"), b("a.com", { paused: true }), b("b.com", { readyAt: new Date(NOW.getTime() + DAY) }), b("c.com")];
    expect(capacityOf(boxes, new Map([["a.com", { cap: 40, paused: false }], ["c.com", { cap: 45, paused: true }]]), NOW)).toBe(40);
  });
});

describe("imap schedule + pool", () => {
  it("staggers polls and bounds them per tick", () => {
    const boxes = Array.from({ length: 300 }, (_, i) => ({ address: `m${i}@x.com`, lastPolledAt: new Date(NOW.getTime() - 11 * 60_000) }));
    const due = duePolls(boxes, NOW, 30);
    expect(due.length).toBeLessThanOrEqual(30);
    expect(duePolls(boxes, NOW, 1000).length).toBeLessThan(300);
    expect(duePolls(boxes.map((x) => ({ ...x, lastPolledAt: new Date(NOW.getTime() - 16 * 60_000) })), NOW, 1000)).toHaveLength(300);
  });

  it("mapPool caps concurrency and keeps errors per item", async () => {
    let live = 0;
    let peak = 0;
    const r = await mapPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((ok) => setTimeout(ok, 5));
      live--;
      if (n === 4) throw new Error("boom");
      return n * 2;
    });
    expect(peak).toBe(3);
    expect(r[0]).toBe(2);
    expect(r[3]).toBeInstanceOf(Error);
  });
});

describe("domain health", () => {
  const enotfound = () => Promise.reject(Object.assign(new Error("nf"), { code: "ENOTFOUND" }));
  const healthy: Resolver = {
    resolveMx: async () => [{ exchange: "mx.maildoso.com" }],
    resolveTxt: async (n) => (n.startsWith("_dmarc.") ? [["v=DMARC1; p=none"]] : n.includes("._domainkey.") ? [["v=DKIM1; k=rsa; p=MIGf"]] : [["v=spf1 include:maildoso.com ~all"]]),
    resolve4: enotfound,
  };

  it("passes a healthy domain and skips refused blocklists (public resolver)", async () => {
    const c = await checkDomain("ok.com", "md", { ...healthy, resolve4: async (n) => (n.endsWith("dbl.spamhaus.org") ? ["127.255.255.254"] : Promise.reject(Object.assign(new Error(), { code: "ENOTFOUND" }))) });
    expect(c).toMatchObject({ mx: true, spf: true, dmarc: true, dkim: true, listedOn: [], skippedLists: ["Spamhaus DBL"] });
    expect(domainVerdict(c, 0).pause).toBeNull();
  });

  it("transient DNS errors never count as broken", async () => {
    const c = await checkDomain("x.com", null, { resolveMx: () => Promise.reject(Object.assign(new Error(), { code: "ETIMEOUT" })), resolveTxt: () => Promise.reject(Object.assign(new Error(), { code: "ESERVFAIL" })), resolve4: enotfound });
    expect(c.mx).toBeNull();
    expect(domainVerdict(c, 5).pause).toBeNull();
  });

  it("pauses a listed domain at once and broken DNS after a streak, with a KlyDecision", async () => {
    const listed: Resolver = { ...healthy, resolve4: async (n) => (n.endsWith("multi.uribl.com") ? ["127.0.0.2"] : Promise.reject(Object.assign(new Error(), { code: "ENOTFOUND" }))) };
    const f = fakeDb({ outboundDomain: { findMany: () => [{ domain: "bad.com", dkimSelector: null, failStreak: 0, paused: false, pausedReason: null }] } });
    expect(await domainHealthTick(f.db, ["bad.com"], NOW, listed)).toEqual(["bad.com: paused (listed on URIBL)"]);
    expect((f.of("outboundDomain", "update")[0] as { data: { paused: boolean } }).data.paused).toBe(true);
    expect(JSON.stringify(f.of("klyDecision", "create")[0])).toContain("Paused every mailbox on bad.com");

    const noSpf = await checkDomain("n.com", null, { ...healthy, resolveTxt: async (n) => (n.startsWith("_dmarc.") ? [["v=DMARC1; p=none"]] : [["google-site-verification=x"]]) });
    expect(domainVerdict(noSpf, 0).pause).toBeNull();
    expect(domainVerdict(noSpf, 1).pause).toBe("broken DNS: no SPF record");
  });

  it("lifts an auto pause on a clean check", async () => {
    const f = fakeDb({ outboundDomain: { findMany: () => [{ domain: "ok.com", dkimSelector: null, failStreak: 0, paused: true, pausedReason: "auto: listed on SURBL" }] } });
    expect(await domainHealthTick(f.db, ["ok.com"], NOW, healthy)).toEqual(["ok.com: resumed"]);
  });
});

describe("senderTick at scale", () => {
  it("never sends from a not-ready or domain-paused mailbox; follow-up stays on its mailbox", async () => {
    const { senderTick } = await import("../src/sender");
    const row = (id: string, address: string, extra: Record<string, unknown> = {}) => ({ id, address, displayName: id, smtpHost: "smtp.x", smtpPort: 587, smtpUser: address, imapHost: "imap.x", imapPort: 993, secretRef: "db", secretEnc: sealSecret("pw-123456", KEY), provider: "maildoso", domain: address.split("@")[1], readyAt: new Date(NOW.getTime() - DAY), dailyCap: 15, warmupStartedAt: new Date(NOW.getTime() - 30 * DAY), paused: false, pausedReason: null, lastSentAt: null, lastPolledAt: null, imapLastUid: 0, ...extra });
    const rows = [row("A", "a@one.com"), row("B", "b@two.com", { readyAt: new Date(NOW.getTime() + DAY) }), row("C", "c@three.com")];
    const lead = (id: string, extra: Record<string, unknown> = {}) => ({ id, email: `${id}@biz.com`, domain: "biz.com", status: "ad_made", step: 0, mailboxId: null, timezone: "America/New_York", armIds: [], businessName: "Biz", city: "Austin", niche: "roofing", claimToken: "c", unsubToken: "u", giftToken: null, adId: null, qualityNotes: null, lastSentAt: null, clickedAt: null, repliedAt: null, ...extra });
    const f = fakeDb({
      outboundMailbox: { findMany: () => rows },
      outboundSend: { groupBy: () => [] },
      outboundDomain: { findMany: () => [{ domain: "three.com", dailyCap: 45, paused: true }] },
      outboundLead: { findMany: () => [lead("fu", { status: "sent", step: 1, mailboxId: "A", lastSentAt: new Date(NOW.getTime() - 9 * DAY) }), lead("n1")], updateMany: () => ({ count: 1 }) },
      klyArm: { findMany: () => [] },
    });
    const sent: string[] = [];
    const res = await senderTick({ db: f.db, provider: null, env: { OUTBOUND_ENABLED: "1", ADS_TOKEN_KEY: KEY }, now: () => NOW, rng: () => 0.5, dailyVolume: 100, followUpDays: 4, maxSteps: 2, explorationPct: 0, transport: (m) => async () => void sent.push(m.address) });
    expect(res.map((r) => r.mailbox)).toEqual(["a@one.com"]);
    const claims = f.of("outboundLead", "updateMany") as Array<{ where: { id: string }; data: { mailboxId: string } }>;
    expect(claims.map((c) => [c.where.id, c.data.mailboxId])).toEqual([["fu", "A"]]);
  });
});
