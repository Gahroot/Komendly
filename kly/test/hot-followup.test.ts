// Hot follow-up: eligibility (every exclusion), business hours, once-only, the 25/day cap, mailbox + domain caps, dry run,
// the governor, and the composed copy (footer, guard, public-offer facts, no banned claims).
import { describe, expect, it } from "vitest";
import { buildHotFollowup, checkHotFollowup, createHotRuntime, HOT_DAILY_CAP, HOT_FOLLOWUP_TEMPLATE, HOT_MAX_AGE_MS, HOT_MAX_PER_TICK, HOT_MIN_WAIT_MS, hotFollowupEnv, hotFollowupTick, hotSkipReason, hotSubject, MIN_VIEW_AFTER_SEND_MS, OFFER_PRICES, type HotCopyContext, type HotDeps, type HotFacts } from "../src/hot-followup";
import { AUTOPILOT_FIRST_MONTH_LINE, AUTOPILOT_GUARANTEE_LINE, PUBLIC_OFFER } from "../../src/lib/ads/public-offer";
import { bodyWordCount, checkOutboundEmail, DEFAULT_POSTAL_ADDRESS, hasBannedClaim } from "../../src/lib/ads/outbound/copy";
import { inBusinessHours } from "../../src/lib/ads/outbound/policy";
import type { Transport } from "../src/sender";
import { fakeDb, type Handler } from "./fakes";

const now = new Date("2026-12-01T15:00:00Z"); // Tuesday 10:00 ET
const POSTAL = "1 Test St, Detroit, MI 48000";
const ENV = { KLY_HOT_FOLLOWUP: "1", OUTBOUND_POSTAL_ADDRESS: POSTAL };
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

const lead = (over: Record<string, unknown> = {}) => ({
  id: "l1", giftId: "g1", businessName: "ACME ROOFING LLC", email: "owner@acme.com", domain: "acme.com", emailCheck: "valid", status: "clicked", step: 1, system: null, purgedAt: null,
  clickedAt: hoursAgo(2), repliedAt: null, signedUpAt: null, paidAt: null, userId: null, workspaceId: null, voiceStatus: null, timezone: "America/New_York", mailboxId: "m1",
  claimToken: "claimtoken0123456789ab", unsubToken: "unsubtoken0123456789ab", ...over,
});
const firstSend = (over: Record<string, unknown> = {}) => ({ leadId: "l1", kind: "sequence", step: 1, messageId: "<orig@getkomendly.com>", subject: "made you something", mailboxId: "m1", sentAt: hoursAgo(5), ...over });
const mailbox = (id = "m1", over: Record<string, unknown> = {}, row: Record<string, unknown> = {}) => ({
  id, address: `nolan@${id}.example.com`, name: "Nolan Grout", user: `nolan@${id}.example.com`, appPassword: "app password", smtpHost: "smtp.example.com", smtpPort: 465, imapHost: "imap.example.com", imapPort: 993, dailyCap: 40, provider: "gmail", domain: `${id}.example.com`,
  row: { paused: false, dailyCap: 40, warmupStartedAt: new Date("2026-10-01T00:00:00Z"), readyAt: null, lastSentAt: null, warmupEnabled: true, coldStartedAt: null, ...row }, ...over,
});

interface World {
  leads?: unknown[];
  events?: unknown[];
  sends?: unknown[];
  suppressed?: string[];
  hotToday?: number;
  sentToday?: Record<string, number>;
  lastSendIds?: Array<{ id: string; mailboxId: string }>;
  domains?: unknown[];
}

function world(w: World = {}) {
  const f = fakeDb({
    outboundLead: { findMany: () => w.leads ?? [lead()] },
    adsEvent: { findMany: () => w.events ?? [{ createdAt: hoursAgo(2), props: { giftId: "g1", human: true } }], create: () => ({}) },
    outboundSend: {
      count: () => w.hotToday ?? 0,
      findMany: ((a: { distinct?: unknown }) => (a.distinct ? (w.lastSendIds ?? []) : (w.sends ?? [firstSend()]))) as Handler,
      groupBy: () => Object.entries(w.sentToday ?? {}).map(([mailboxId, n]) => ({ mailboxId, _count: { _all: n } })),
      create: () => ({ id: "hot1" }),
      delete: () => ({}),
    },
    outboundSuppression: { findMany: () => (w.suppressed ?? []).map((value) => ({ value })) },
    outboundDomain: { findMany: () => w.domains ?? [] },
    outboundMailbox: { update: () => ({}) },
  });
  const sent: Array<Parameters<Transport>[0]> = [];
  const transport: HotDeps["transport"] = () => async (m) => void sent.push(m);
  return { f, sent, transport };
}

const run = (w: World = {}, over: Partial<HotDeps> = {}, boxes = [mailbox()]) => {
  const x = world(w);
  const deps: HotDeps = { db: x.f.db, env: ENV, now, boxes: boxes as unknown as HotDeps["boxes"], transport: x.transport, rt: createHotRuntime(), ...over };
  return { ...x, deps, go: () => hotFollowupTick(deps) };
};

describe("env switches (default OFF)", () => {
  it("does nothing unless a switch is set to exactly 1", () => {
    expect(hotFollowupEnv({})).toEqual({ enabled: false, dry: false });
    expect(hotFollowupEnv({ KLY_HOT_FOLLOWUP: "true", KLY_HOT_FOLLOWUP_DRY: "yes" })).toEqual({ enabled: false, dry: false });
    expect(hotFollowupEnv({ KLY_HOT_FOLLOWUP: "1" })).toEqual({ enabled: true, dry: false });
  });
  it("dry run works alone and always wins over live", () => {
    expect(hotFollowupEnv({ KLY_HOT_FOLLOWUP_DRY: "1" })).toEqual({ enabled: true, dry: true });
    expect(hotFollowupEnv({ KLY_HOT_FOLLOWUP: "1", KLY_HOT_FOLLOWUP_DRY: "1" })).toEqual({ enabled: true, dry: true });
  });
  it("the tick returns null and touches nothing while off", async () => {
    const r = run({}, { env: {} });
    expect(await r.go()).toBeNull();
    expect(r.f.calls).toHaveLength(0);
  });
});

describe("composed copy", () => {
  const ctx: HotCopyContext = { businessName: "ACME ROOFING LLC", claimUrl: "https://www.komendly.com/g/claimtoken0123456789ab", unsubscribeUrl: "https://www.komendly.com/u/unsubtoken0123456789ab", postalAddress: POSTAL, firstSubject: "made you something", senderName: "Nolan Grout" };
  const mail = buildHotFollowup(ctx);
  const body = mail.text.split("\n--\n")[0]!;

  it("is a threaded reply with the standard footer", () => {
    expect(mail.subject).toBe("Re: made you something");
    expect(hotSubject("Re: already a reply")).toBe("Re: already a reply");
    expect(mail.text).toContain(`Komendly, ${POSTAL}`);
    expect(mail.text).toContain(`Not for you? Reply "stop" or unsubscribe: ${ctx.unsubscribeUrl}`);
    expect(mail.text).not.toMatch(/\{\w+\}/);
  });
  it("passes the same copy guard as the other kly copy", () => {
    expect(checkHotFollowup(mail, ctx)).toBeNull();
    // the shared final gate itself (its 70-word follow-up limit is the only thing relaxed, for the offer facts)
    expect(checkOutboundEmail(mail, { step: 2, businessName: ctx.businessName, city: "", niche: "", senderName: "Nolan", claimUrl: ctx.claimUrl, unsubscribeUrl: ctx.unsubscribeUrl, postalAddress: POSTAL }, { maxFollowUpWords: 110 })).toBeNull();
    expect(checkOutboundEmail(mail, { step: 2, businessName: ctx.businessName, city: "", niche: "", senderName: "Nolan", claimUrl: ctx.claimUrl, unsubscribeUrl: ctx.unsubscribeUrl, postalAddress: POSTAL })).toMatch(/follow-up \d+ words/);
    expect(bodyWordCount(mail.text)).toBeLessThanOrEqual(100);
  });
  it("thanks them, then offers done-for-you and the free pack, then one ask", () => {
    expect(body.split("\n")[0]).toBe("Thanks for taking a look at the ad I made for Acme Roofing.");
    expect(body).toContain("Reply yes and I'll set it up.");
    const ask = body.indexOf("Reply yes and I'll set it up.");
    expect(body.slice(ask + "Reply yes and I'll set it up.".length).trim()).toBe("— Nolan, founder, Komendly");
    expect(body).toContain(`${PUBLIC_OFFER.freeAds} free ads`);
    expect(body.match(/https?:\/\//g)).toHaveLength(1);
    expect(body).toContain(ctx.claimUrl);
  });
  it("uses only the facts public-offer.ts exports", () => {
    expect(body).toContain(AUTOPILOT_FIRST_MONTH_LINE);
    expect(body).toContain("$97 your first month, then $297/month");
    expect(body).toContain(`${PUBLIC_OFFER.foundingSpots} spots`);
    expect(body).toContain(AUTOPILOT_GUARANTEE_LINE);
    expect(body).toMatch(/within 7 days of you connecting Meta, or your first month is refunded/);
    expect(body).toMatch(/30-day full refund/);
    expect(body).toMatch(/can't promise leads or sales/);
    expect(OFFER_PRICES).toEqual(["$97", "$297"]);
    // every dollar amount in the copy is one of the public prices
    expect([...body.matchAll(/\$\d[\d,.]*/g)].map((m) => m[0].replace(/[.,]$/, ""))).toEqual(expect.arrayContaining(["$97", "$297"]));
    for (const m of body.matchAll(/\$\d[\d,.]*/g)) expect(["$97", "$297"]).toContain(m[0].replace(/[.,]$/, "").replace(/\/month$/, ""));
  });
  it("makes no banned claims", () => {
    expect(body).not.toMatch(/one[- ]?click|guarantee|results|roi\b|revenue|%|!|customers|case stud|free forever|limited time|act now|urgent/i);
    expect(body).not.toMatch(/\bwe (have|helped|work with)\b/i);
  });
  it("the guard really bites: other prices, one-click, a bad business name", () => {
    expect(hasBannedClaim("then $297/month", [])).toBe(true); // arms may not quote $297 ...
    expect(hasBannedClaim("then $297/month", OFFER_PRICES)).toBe(false); // ... only this fixed message may
    expect(hasBannedClaim("then $2970/month", OFFER_PRICES)).toBe(true);
    expect(hasBannedClaim("then $297.50 a month", OFFER_PRICES)).toBe(true);
    expect(hasBannedClaim("only $199", OFFER_PRICES)).toBe(true);
    const oneClick = { ...mail, text: mail.text.replace("Reply yes and I'll set it up.", "We publish in one click. Reply yes and I'll set it up.") };
    expect(checkHotFollowup(oneClick, ctx)).toBe("one-click claim");
    const noFooter = { ...mail, text: mail.text.replace(`Komendly, ${POSTAL}`, "Komendly") };
    expect(checkHotFollowup(noFooter, ctx)).toBe("postal address not in body");
    const noUnsub = { ...mail, text: mail.text.replace(ctx.unsubscribeUrl, "") };
    expect(checkHotFollowup(noUnsub, ctx)).toBe("unsubscribe link not in body");
    const shouty = buildHotFollowup({ ...ctx, businessName: "100% Guaranteed Roofing" });
    expect(checkHotFollowup(shouty, { ...ctx, businessName: "100% Guaranteed Roofing" })).toBe("banned phrase in body");
  });
  it("the template itself holds no placeholder but business and link", () => {
    expect([...HOT_FOLLOWUP_TEMPLATE.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()).toEqual(["business", "link"]);
    expect(DEFAULT_POSTAL_ADDRESS).toBeTruthy();
  });
});

describe("eligibility: hotSkipReason", () => {
  const facts = (leadOver: Record<string, unknown> = {}, over: Partial<HotFacts> = {}): HotFacts => ({
    lead: lead(leadOver) as unknown as HotFacts["lead"],
    humanAt: hoursAgo(2),
    firstSend: firstSend() as unknown as HotFacts["firstSend"],
    hotSent: false,
    suppressed: false,
    ...over,
  });
  it("accepts the clean case", () => {
    expect(hotSkipReason(facts(), now)).toBeNull();
  });
  it.each([
    ["replied (status)", { status: "replied" }, "status replied"],
    ["replied (repliedAt)", { repliedAt: hoursAgo(1) }, "replied"],
    ["unsubscribed", { status: "unsubscribed" }, "status unsubscribed"],
    ["bounced", { status: "bounced" }, "status bounced"],
    ["complained", { status: "complained" }, "status complained"],
    ["signed up (status)", { status: "signed_up" }, "status signed_up"],
    ["signed up (user)", { userId: "u1" }, "signed up"],
    ["signed up (workspace)", { workspaceId: "w1" }, "signed up"],
    ["paid", { status: "paid" }, "status paid"],
    ["paid (paidAt)", { paidAt: hoursAgo(1) }, "paid"],
    ["no email", { email: "  " }, "no email"],
    ["email not verified", { emailCheck: "catch_all" }, "email not verified"],
    ["never clicked", { clickedAt: null }, "not clicked"],
    ["growth-system lead", { system: "review_gifts" }, "growth-system lead"],
    ["purged", { purgedAt: hoursAgo(1) }, "purged"],
    ["opted out on a call", { voiceStatus: "opt_out" }, "voice opt_out"],
    ["bad timezone", { timezone: "Mars/Olympus" }, "bad timezone"],
  ])("excludes: %s", (_n, over, why) => {
    expect(hotSkipReason(facts(over), now)).toBe(why);
  });
  it("excludes suppressed, already-sent, no original send, no human view", () => {
    expect(hotSkipReason(facts({}, { suppressed: true }), now)).toBe("suppressed");
    expect(hotSkipReason(facts({}, { hotSent: true }), now)).toBe("already sent");
    expect(hotSkipReason(facts({}, { firstSend: null }), now)).toBe("no original send");
    expect(hotSkipReason(facts({}, { humanAt: null }), now)).toBe("no human-verified view");
  });
  it("waits 20 minutes after the view and stops after 72 hours", () => {
    const at = (ms: number) => new Date(now.getTime() - ms);
    expect(hotSkipReason(facts({}, { humanAt: at(HOT_MIN_WAIT_MS - 1000) }), now)).toBe("too soon (under 20 min)");
    expect(hotSkipReason(facts({}, { humanAt: at(HOT_MIN_WAIT_MS) }), now)).toBeNull();
    const old = { firstSend: firstSend({ sentAt: hoursAgo(120) }) as unknown as HotFacts["firstSend"] }; // sent well before the view
    expect(hotSkipReason(facts({}, { ...old, humanAt: at(HOT_MAX_AGE_MS) }), now)).toBeNull();
    expect(hotSkipReason(facts({}, { ...old, humanAt: at(HOT_MAX_AGE_MS + 1000) }), now)).toBe("too old (over 72 h)");
  });
  it("only sends inside the recipient's local business hours (9-17, 7 days)", () => {
    // 10:00 ET Tuesday = 07:00 PT, outside business hours for a Los Angeles lead
    expect(inBusinessHours(now, "America/Los_Angeles")).toBe(false);
    expect(hotSkipReason(facts({ timezone: "America/Los_Angeles" }), now)).toBe("outside recipient business hours");
    expect(hotSkipReason(facts({ timezone: "America/New_York" }), now)).toBeNull();
    expect(hotSkipReason(facts({ timezone: "America/Chicago" }), now)).toBeNull(); // 09:00 CT
    expect(hotSkipReason(facts({}), new Date("2026-12-01T22:00:00Z"))).toBe("outside recipient business hours"); // 17:00 ET: closed
    expect(hotSkipReason(facts({}, { humanAt: new Date("2026-12-05T14:00:00Z") }), new Date("2026-12-05T15:00:00Z"))).toBeNull(); // a Saturday morning is fine
  });
  it("does not trust a 'human' view that looks like a scanner: seconds after the send, or the middle of the night", () => {
    const sent = hoursAgo(5);
    const soon = new Date(sent.getTime() + MIN_VIEW_AFTER_SEND_MS - 1000);
    expect(hotSkipReason(facts({}, { humanAt: soon, firstSend: firstSend({ sentAt: sent }) as unknown as HotFacts["firstSend"] }), now)).toBe("view too soon after send (scanner)");
    // 07:30Z = 02:30 ET
    const night = new Date("2026-12-01T07:30:00Z");
    expect(hotSkipReason(facts({}, { humanAt: night, firstSend: firstSend({ sentAt: new Date("2026-11-30T20:00:00Z") }) as unknown as HotFacts["firstSend"] }), now)).toBe("view in the middle of the night (sandbox)");
  });
});

describe("tick: live", () => {
  it("sends exactly one threaded plain-text reply from the original mailbox and records it", async () => {
    const r = run();
    const res = await r.go();
    expect(res).toMatchObject({ sent: 1, eligible: 1, dry: false, errors: [] });
    expect(r.sent).toHaveLength(1);
    const m = r.sent[0]!;
    expect(m.from).toBe('"Nolan Grout" <nolan@m1.example.com>');
    expect(m.to).toBe("owner@acme.com");
    expect(m.subject).toBe("Re: made you something");
    expect(m.html ?? null).toBeNull();
    expect(m.headers["In-Reply-To"]).toBe("<orig@getkomendly.com>");
    expect(m.headers.References).toBe("<orig@getkomendly.com>");
    expect(m.headers["List-Unsubscribe"]).toContain("/u/unsubtoken0123456789ab");
    expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(m.text).toContain(`Komendly, ${POSTAL}`);
    expect(m.messageId).toMatch(/^<[0-9a-f-]+@m1\.example\.com>$/);
    const rec = (r.f.of("outboundSend", "create")[0] as { data: Record<string, unknown> }).data;
    expect(rec).toMatchObject({ leadId: "l1", mailboxId: "m1", kind: "hot_followup", messageId: m.messageId, toEmail: "owner@acme.com", subject: "Re: made you something" });
    expect(rec.dryRun).not.toBe(true);
    expect((r.f.of("adsEvent", "create")[0] as { data: { name: string; props: unknown } }).data).toEqual({ name: "hot_followup_sent", props: { leadId: "l1", mailbox: "nolan@m1.example.com" } });
    expect(r.f.of("outboundMailbox", "update")).toHaveLength(1);
    // the lead row is left alone (status, step, clickedAt feed the arm and governor stats)
    expect(r.f.of("outboundLead", "update")).toHaveLength(0);
    expect(r.f.of("outboundLead", "updateMany")).toHaveLength(0);
  });
  it("sends once only: a lead that already has a hot follow-up never gets another", async () => {
    const r = run({ sends: [firstSend(), { ...firstSend(), kind: "hot_followup", step: 2, messageId: "<hot@x>" }] });
    expect(await r.go()).toMatchObject({ sent: 0, eligible: 0, skipped: { "already sent": 1 } });
    expect(r.sent).toHaveLength(0);
  });
  it("a second tick right after the first does not repeat (the claim row exists)", async () => {
    const sends: unknown[] = [firstSend()];
    const r = run({ sends });
    await r.go();
    sends.push({ ...firstSend(), kind: "hot_followup", step: 2, messageId: "<hot@x>" });
    expect(await r.go()).toMatchObject({ sent: 0 });
    expect(r.sent).toHaveLength(1);
  });
  it("sends nothing when the human-verified view is missing (old 'clicked' leads stay as they are)", async () => {
    const r = run({ events: [] });
    expect(await r.go()).toMatchObject({ sent: 0, candidates: 0 });
    expect(r.f.of("outboundLead", "findMany")).toHaveLength(0);
    expect(r.sent).toHaveLength(0);
  });
  it("asks only for human views: gift_viewed with props.human = true", async () => {
    const r = run();
    await r.go();
    expect((r.f.of("adsEvent", "findMany")[0] as { where: unknown }).where).toMatchObject({ name: "gift_viewed", props: { path: ["human"], equals: true } });
  });
  it("skips suppressed addresses and domains", async () => {
    for (const value of ["owner@acme.com", "acme.com"]) {
      const r = run({ suppressed: [value] });
      expect(await r.go()).toMatchObject({ sent: 0, skipped: { suppressed: 1 } });
      expect(r.sent).toHaveLength(0);
    }
  });
  it("does not email outside the lead's business hours, and sends the same lead once hours open", async () => {
    const la = { leads: [lead({ timezone: "America/Los_Angeles" })] };
    const closed = run(la);
    expect(await closed.go()).toMatchObject({ sent: 0, skipped: { "outside recipient business hours": 1 } });
    const open = run(la, { now: new Date("2026-12-01T18:00:00Z") });
    expect(await open.go()).toMatchObject({ sent: 1 }); // 10:00 PT
  });
  it("needs the original mailbox: a paused, unloaded or domain-paused one holds the lead", async () => {
    expect(await run({}, {}, [mailbox("other")]).go()).toMatchObject({ sent: 0, held: { "original mailbox not loaded": 1 } });
    expect(await run({}, {}, [mailbox("m1", {}, { paused: true })]).go()).toMatchObject({ sent: 0, held: { "mailbox paused": 1 } });
    expect(await run({ domains: [{ domain: "m1.example.com", paused: true, dailyCap: 45 }] }).go()).toMatchObject({ sent: 0, held: { "domain paused": 1 } });
  });
  it("never goes over the mailbox's daily cap, and never over the domain's (hot sends count in both)", async () => {
    const full = run({ sentToday: { m1: 40 } });
    expect(await full.go()).toMatchObject({ sent: 0, held: { "mailbox daily_limit": 1 } });
    const sentToday = (full.f.of("outboundSend", "groupBy")[0] as { where: { kind: { in: string[] } } }).where.kind.in;
    expect(sentToday).toEqual(["sequence", "hot_followup"]);
    const lowCap = run({ sentToday: { m1: 10 } }, {}, [mailbox("m1", {}, { dailyCap: 10 })]);
    expect(await lowCap.go()).toMatchObject({ sent: 0, held: { "mailbox daily_limit": 1 } });
    const domainFull = run({ sentToday: { m1: 5 }, domains: [{ domain: "m1.example.com", paused: false, dailyCap: 5 }] });
    expect(await domainFull.go()).toMatchObject({ sent: 0, held: { "domain daily cap": 1 } });
    expect(domainFull.sent).toHaveLength(0);
  });
  it("respects the mailbox's pacing gap after its last send", async () => {
    const r = run({ lastSendIds: [{ id: "cabcabcabc", mailboxId: "m1" }] }, {}, [mailbox("m1", {}, { lastSentAt: new Date(now.getTime() - 30_000) })]);
    expect(await r.go()).toMatchObject({ sent: 0, held: { "mailbox gap": 1 } });
  });
  it("is capped at 25 hot follow-ups a day in total", async () => {
    const done = run({ hotToday: HOT_DAILY_CAP });
    expect(await done.go()).toMatchObject({ sent: 0 });
    expect(done.sent).toHaveLength(0);
    expect(done.f.of("outboundLead", "findMany")).toHaveLength(0);
    const count = (done.f.of("outboundSend", "count")[0] as { where: unknown }).where;
    expect(count).toMatchObject({ kind: "hot_followup", dryRun: false });
    // 24 done -> exactly one more may go
    const one = run({ hotToday: HOT_DAILY_CAP - 1, leads: [lead(), lead({ id: "l2", giftId: "g2", mailboxId: "m2", email: "b@b.com", domain: "b.com" })], events: [{ createdAt: hoursAgo(3), props: { giftId: "g1", human: true } }, { createdAt: hoursAgo(2), props: { giftId: "g2", human: true } }], sends: [firstSend(), firstSend({ leadId: "l2", mailboxId: "m2", messageId: "<o2@x>" })] }, {}, [mailbox("m1"), mailbox("m2")]);
    expect(await one.go()).toMatchObject({ sent: 1, held: { "daily/tick cap": 1 } });
  });
  it("sends the lead closest to the end of its window first, at most HOT_MAX_PER_TICK per tick", async () => {
    const n = HOT_MAX_PER_TICK + 2;
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    const r = run(
      {
        leads: ids.map((i) => lead({ id: `l${i}`, giftId: `g${i}`, mailboxId: `m${i}`, email: `o${i}@b${i}.com`, domain: `b${i}.com` })),
        events: ids.map((i) => ({ createdAt: new Date(hoursAgo(24).getTime() + i * 60_000), props: { giftId: `g${i}`, human: true } })),
        sends: ids.map((i) => firstSend({ leadId: `l${i}`, mailboxId: `m${i}`, messageId: `<o${i}@x>`, sentAt: hoursAgo(70) })),
      },
      {},
      ids.map((i) => mailbox(`m${i}`)),
    );
    expect(await r.go()).toMatchObject({ sent: HOT_MAX_PER_TICK, held: { "daily/tick cap": 2 } });
    expect(r.sent.map((m) => m.to)).toEqual(ids.slice(0, HOT_MAX_PER_TICK).map((i) => `o${i}@b${i}.com`));
  });
  it("refuses while the governor is tripped", async () => {
    const r = run({}, { governed: "bounce rate 3.0% over 500 cold emails in 7 days (limit 2%)" });
    expect(await r.go()).toMatchObject({ sent: 0, held: { governor: 1 } });
    expect(r.sent).toHaveLength(0);
    expect(r.f.calls).toHaveLength(0);
  });
  it("an SMTP failure undoes the claim and backs off; nothing is recorded as sent", async () => {
    const x = world();
    const rt = createHotRuntime();
    const failing: HotDeps["transport"] = () => async () => {
      throw new Error("550 mailbox unavailable");
    };
    const deps: HotDeps = { db: x.f.db, env: ENV, now, boxes: [mailbox()] as unknown as HotDeps["boxes"], transport: failing, rt };
    const r = await hotFollowupTick(deps);
    expect(r).toMatchObject({ sent: 0 });
    expect(r?.errors[0]).toMatch(/550 mailbox unavailable/);
    expect(x.f.of("outboundSend", "delete")).toHaveLength(1);
    expect(x.f.of("adsEvent", "create")).toHaveLength(0);
    const again = await hotFollowupTick(deps);
    expect(again).toMatchObject({ sent: 0, held: { "retry backoff": 1 } });
  });
  it("updates the mailbox object so the cold sender's pacing sees the send in the same tick", async () => {
    const box = mailbox();
    const r = run({}, {}, [box]);
    await r.go();
    expect(box.row.lastSentAt).toEqual(now);
  });
});

describe("tick: dry run", () => {
  it("logs who it would email and sends / writes nothing", async () => {
    const r = run({}, { env: { ...ENV, KLY_HOT_FOLLOWUP_DRY: "1" } });
    const res = await r.go();
    expect(res).toMatchObject({ dry: true, sent: 0, eligible: 1 });
    expect(res?.would).toEqual([{ leadId: "l1", business: "ACME ROOFING LLC", to: "owner@acme.com", mailbox: "nolan@m1.example.com", viewedAt: hoursAgo(2).toISOString() }]);
    expect(r.sent).toHaveLength(0);
    for (const [model, method] of [["outboundSend", "create"], ["adsEvent", "create"], ["outboundMailbox", "update"], ["outboundLead", "update"]] as const) expect(r.f.of(model, method)).toHaveLength(0);
  });
  it("works alone (no live switch) and does not log the same lead every minute", async () => {
    const r = run({}, { env: { KLY_HOT_FOLLOWUP_DRY: "1", OUTBOUND_POSTAL_ADDRESS: POSTAL } });
    expect((await r.go())?.would).toHaveLength(1);
    expect((await r.go())?.would).toHaveLength(0);
    expect(r.sent).toHaveLength(0);
  });
  it("applies the same rules: an ineligible lead is not listed", async () => {
    const r = run({ leads: [lead({ repliedAt: hoursAgo(1) })] }, { env: { KLY_HOT_FOLLOWUP_DRY: "1" } });
    expect(await r.go()).toMatchObject({ would: [], eligible: 0 });
  });
});
