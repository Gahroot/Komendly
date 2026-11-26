import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeQueue, parseHackerNews, parseReddit, parseRss, readQueue, replyDraft, runIntentDiscovery, scoreIntent, toOpportunities } from "../src/intent-queue";

const now = new Date("2026-11-26T12:00:00Z");
const reddit = { data: { children: [
  { data: { permalink: "/r/smallbusiness/comments/a/x/", title: "Need help with Facebook ads for my dental clinic", selftext: "Budget is $1000/month. Anyone recommend a freelancer?", author: "u1", created_utc: 1790000000 } },
  { data: { permalink: "/r/forhire/comments/b/y/", title: "[FOR HIRE] Facebook ads manager, I will run your ads", selftext: "", author: "u2", created_utc: 1790000001 } },
  { data: { permalink: "/r/forhire/comments/c/z/", title: "[HIRING] Video ad creator for UGC video ads", selftext: "paid", author: "u3", created_utc: 1790000002 } },
  { data: { permalink: "/r/smallbusiness/comments/d/w/", title: "How do I deal with taxes", selftext: "", author: "u4", created_utc: 1790000003 } },
  { data: { title: "no permalink" } },
] } };
const hn = { hits: [{ objectID: "123", title: "Ask HN: looking for Meta ads help", story_text: "<p>We need ad creatives</p>", author: "h", created_at: "2026-11-25T00:00:00Z" }, { objectID: "", title: "" }] };
const rss = `<rss><channel><item><title><![CDATA[Paid Social Media Buyer (Facebook ads)]]></title><link>https://jobs.example/1</link><description><![CDATA[<p>We are hiring a media buyer to run ads</p>]]></description><pubDate>Mon, 24 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;

describe("intent parsing + scoring", () => {
  it("parses the three public formats", () => {
    expect(parseReddit(reddit)).toHaveLength(4);
    expect(parseHackerNews(hn)).toHaveLength(1);
    const r = parseRss(rss);
    expect(r[0]).toMatchObject({ title: "Paid Social Media Buyer (Facebook ads)", url: "https://jobs.example/1", source: "jobs_rss" });
    expect(parseReddit(null)).toEqual([]);
  });
  it("scores buyers high and sellers/offtopic zero", () => {
    const posts = parseReddit(reddit);
    expect(scoreIntent(posts[0]!).score).toBeGreaterThanOrEqual(60);
    expect(scoreIntent(posts[1]!).score).toBe(0);
    expect(scoreIntent(posts[2]!).matched).toContain("hiring");
    expect(scoreIntent(posts[3]!).score).toBe(0);
  });
  it("queue entries carry an answer-first, non-pushy draft and no link", () => {
    const ops = toOpportunities([...parseReddit(reddit), ...parseHackerNews(hn), ...parseRss(rss)], now);
    expect(ops.map((o) => o.url)).toContain("https://news.ycombinator.com/item?id=123");
    expect(ops.every((o) => o.status === "new" && o.intentScore >= 40 && !/https?:/.test(o.replyDraft))).toBe(true);
    expect(ops.some((o) => o.title.includes("FOR HIRE"))).toBe(false);
    expect(replyDraft({ title: "", text: "" }, ["creative"])).toMatch(/^For ad creative/);
    expect(replyDraft({ title: "", text: "" }, ["creative"])).toContain("Disclosure");
  });
  it("dedupes on merge", () => {
    const ops = toOpportunities(parseReddit(reddit), now);
    expect(mergeQueue(ops, ops).added).toHaveLength(0);
  });
});

describe("runIntentDiscovery", () => {
  it("writes a queue file from fixtures, tolerates failing feeds, and is idempotent", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "intent-")), "q.json");
    const fetch = async (u: string) => u.includes("reddit.com/r/smallbusiness") ? { status: 200, text: JSON.stringify(reddit) } : u.includes("algolia") ? { status: 200, text: JSON.stringify(hn) } : u.endsWith(".rss") ? { status: 200, text: rss } : u.includes("reddit.com/r/forhire") ? { status: 429, text: "" } : (() => { throw new Error("net"); })();
    const a = await runIntentDiscovery({ fetch, file, now });
    expect(a.added.length).toBeGreaterThan(0);
    expect(a.errors.length).toBeGreaterThan(0);
    expect(readQueue(file)).toHaveLength(a.total);
    const b = await runIntentDiscovery({ fetch, file, now });
    expect(b.added).toHaveLength(0);
    const dry = await runIntentDiscovery({ fetch, file: join(tmpdir(), "never-written.json"), now, dry: true });
    expect(readQueue(join(tmpdir(), "never-written.json"))).toEqual([]);
    expect(dry.added.length).toBeGreaterThan(0);
  });
});
