import { describe, expect, it } from "vitest";
import type { AdlibAd, AdlibPageScan } from "../../../src/lib/growth/adlib-scan";
import type { Db } from "../db";
import type { OutMail } from "../lifecycle/mail";
import { adWatchTick } from "./ad-watch";

type Row = { id: string; name: string; userId: string | null; createdAt: Date; props: Record<string, unknown> };
type Where = { name?: string | { in: string[] }; createdAt?: { gte: Date }; props?: { path: string[]; equals: unknown }; AND?: Where[] };

function match(r: Row, w: Where): boolean {
  if (typeof w.name === "string" && r.name !== w.name) return false;
  if (w.name && typeof w.name === "object" && !w.name.in.includes(r.name)) return false;
  if (w.createdAt && r.createdAt < w.createdAt.gte) return false;
  if (w.props && r.props[w.props.path[0]!] !== w.props.equals) return false;
  return (w.AND ?? []).every((x) => match(r, x));
}

function fakeDb(rows: Row[], flag = true) {
  let n = 0;
  const beats: Record<string, unknown> = {};
  const db = {
    adsFeatureFlag: { findUnique: async () => ({ enabled: flag }) },
    engineHeartbeat: { findUnique: async ({ where }: { where: { id: string } }) => (beats[where.id] ? { meta: beats[where.id] } : null), upsert: async (a: { where: { id: string }; create: { meta: object } }) => { beats[a.where.id] = a.create.meta; } },
    adsEvent: {
      findMany: async ({ where }: { where: Where }) => rows.filter((r) => match(r, where)),
      findFirst: async ({ where }: { where: Where }) => rows.find((r) => match(r, where)) ?? null,
      create: async ({ data }: { data: { name: string; userId?: string | null; props: object } }) => { const r = { id: `e${++n}`, name: data.name, userId: data.userId ?? null, createdAt: new Date(), props: data.props as Record<string, unknown> }; rows.push(r); return r; },
      delete: async ({ where }: { where: { id: string } }) => { rows.splice(rows.findIndex((r) => r.id === where.id), 1); },
    },
  };
  return { db: db as unknown as Db, rows, beats };
}

const NOW = new Date("2026-11-23T14:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const ad = (id: string, d: number): AdlibAd => ({ adArchiveId: id, startedAt: ago(d).toISOString().slice(0, 10), runDays: d, format: "image", body: `Spring tune-up special ${id}`, snapshotUrl: `https://www.facebook.com/ads/library/?id=${id}` });
const subRows = (): Row[] => [
  { id: "s1", name: "ad_watch_subscribed", userId: null, createdAt: ago(10), props: { email: "joe@x.com", trade: "Plumber", city: "Austin", pages: ["https://www.facebook.com/rival"] } },
  { id: "c1", name: "ad_watch_confirmed", userId: null, createdAt: ago(10), props: { subId: "s1", email: "joe@x.com" } },
];
const scanOf = (ads: AdlibAd[]) => async (): Promise<AdlibPageScan> => ({ pageId: "p1", pageName: "Rival Plumbing", liveAds: ads, scannedAt: NOW.toISOString() });
const env = { LIFECYCLE_EMAIL_SECRET: "s", NEXT_PUBLIC_APP_URL: "https://www.komendly.com" } as NodeJS.ProcessEnv;
const approve = { text: async () => ({ text: "", json: { approved: true, reasons: [], fix: "" }, usage: {} as never }) };

describe("ad watch tick", () => {
  it("sends once per ISO week with List-Unsubscribe and remix links, records ad_watch_sent", async () => {
    const f = fakeDb(subRows());
    const sent: OutMail[] = [];
    const deps = { db: f.db, provider: approve, send: async (m: OutMail) => { sent.push(m); }, scan: scanOf([ad("a1", 1), ad("a2", 2), ad("a3", 3), ad("a4", 4)]), env, now: () => NOW };
    const r = await adWatchTick(deps);
    expect(r).toMatchObject({ enabled: true, due: 1, sent: 1, errors: [] });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("3 new ads your competitors launched this week");
    expect(sent[0]!.headers["List-Unsubscribe"]).toMatch(/\/api\/ad-watch\/unsubscribe\?t=/);
    expect(sent[0]!.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent[0]!.text).toMatch(/\/remix\?ad=.*utm_source=ad_watch/);
    expect(f.rows.find((x) => x.name === "ad_watch_sent")?.props).toMatchObject({ subId: "s1", week: "2026-W48", adIds: ["a1", "a2", "a3"], detail: "full" });
    expect(f.rows.filter((x) => x.name === "review_gate")).toHaveLength(1);
    // Same week again: nothing.
    expect((await adWatchTick({ ...deps, now: () => new Date(NOW.getTime() + 3_600_000) })).sent).toBe(0);
    expect(sent).toHaveLength(1);
    // Next week: only ads not sent before.
    const next = new Date(NOW.getTime() + 7 * 86_400_000);
    await adWatchTick({ ...deps, now: () => next, scan: scanOf([ad("a3", 3), ad("a5", -5)]) }); // a5 started 2 days before next Monday; a3 already sent
    expect(sent).toHaveLength(2);
    expect(sent[1]!.subject).toBe("1 new ad your competitors launched this week");
  });

  it("skips the week with no email when nothing is new; nothing before Monday 13:00 UTC", async () => {
    const f = fakeDb(subRows());
    const sent: OutMail[] = [];
    const deps = { db: f.db, provider: approve, send: async (m: OutMail) => { sent.push(m); }, scan: scanOf([ad("old", 30)]), env };
    expect((await adWatchTick({ ...deps, now: () => new Date("2026-11-23T12:00:00Z") })).due).toBe(0);
    expect(await adWatchTick({ ...deps, now: () => NOW })).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).toHaveLength(0);
    expect(f.rows.find((x) => x.name === "ad_watch_skipped")?.props).toMatchObject({ reason: "nothing_new", week: "2026-W48" });
  });

  it("honours opt-outs and the kill switch", async () => {
    const sent: OutMail[] = [];
    const out = fakeDb([...subRows(), { id: "u1", name: "ad_watch_unsubscribed", userId: null, createdAt: ago(1), props: { email: "joe@x.com", subId: "s1" } }]);
    expect((await adWatchTick({ db: out.db, provider: approve, send: async (m) => { sent.push(m); }, scan: scanOf([ad("a1", 1)]), env, now: () => NOW })).due).toBe(0);
    const off = fakeDb(subRows(), false);
    expect((await adWatchTick({ db: off.db, provider: approve, send: async (m) => { sent.push(m); }, scan: scanOf([ad("a1", 1)]), env, now: () => NOW })).enabled).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("gate rejects -> one minimal revision; rejected twice -> skip the week; reviewer down -> retry later", async () => {
    let calls = 0;
    const prompts: string[] = [];
    const rejectFirst = { text: async (r: { prompt: string }) => { prompts.push(r.prompt); return { text: "", json: calls++ === 0 ? { approved: false, reasons: ["detail not in facts"], fix: "" } : { approved: true, reasons: [], fix: "" }, usage: {} as never }; } };
    const f = fakeDb(subRows());
    const sent: OutMail[] = [];
    await adWatchTick({ db: f.db, provider: rejectFirst, send: async (m) => { sent.push(m); }, scan: scanOf([ad("a1", 1)]), env, now: () => NOW });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).not.toContain("Spring tune-up");
    expect(prompts[0]).toContain("Spring tune-up special a1"); // rival-ad data in facts
    expect(f.rows.find((x) => x.name === "ad_watch_sent")?.props.detail).toBe("minimal");

    const reject = { text: async () => ({ text: "", json: { approved: false, reasons: ["nope"], fix: "" }, usage: {} as never }) };
    const g = fakeDb(subRows());
    expect(await adWatchTick({ db: g.db, provider: reject, send: async (m) => { sent.push(m); }, scan: scanOf([ad("a1", 1)]), env, now: () => NOW })).toMatchObject({ sent: 0, skipped: 1 });
    expect(g.rows.filter((x) => x.name === "review_gate")).toHaveLength(2);
    expect(g.rows.find((x) => x.name === "ad_watch_skipped")?.props.reason).toBe("review_gate");

    const down = { text: async () => { throw new Error("503"); } };
    const h = fakeDb(subRows());
    const r = await adWatchTick({ db: h.db, provider: down, send: async (m) => { sent.push(m); }, scan: scanOf([ad("a1", 1)]), env, now: () => NOW });
    expect(r.errors).toHaveLength(1);
    expect(h.rows.some((x) => x.name === "ad_watch_skipped" || x.name === "ad_watch_sent")).toBe(false);
    expect(sent).toHaveLength(1);
  });
});
