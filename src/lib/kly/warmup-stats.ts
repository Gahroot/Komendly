// Peer warm-up summary for /admin/ads/outbound (pure; queries.ts feeds it). Kly's sender uses the same gate
// (policy.ts warmupReadiness), so "ready" here means the same as it does for cold sending.
import { spamPlacementRate, warmupDays, warmupReadiness, WARMUP_MIN_DAYS, WARMUP_READY_SPAM_RATE } from "@/lib/ads/outbound/policy";

export interface WarmupBox {
  id: string;
  domain: string;
  provider: string;
  paused: boolean;
  warmupEnabled: boolean;
  warmupSince: Date | null;
  coldStartedAt: Date | null;
}

export type Placement = { inbox: number; spam: number; missing: number };

export function summarizeWarmup(boxes: readonly WarmupBox[], placementByBox: ReadonlyMap<string, Placement>, sentTodayByDomain: ReadonlyMap<string, number>, now: Date, opts: { minDays?: number; readySpamRate?: number } = {}) {
  const inWarmup = boxes.filter((b) => b.provider !== "gmail" && b.warmupEnabled);
  const rows = inWarmup.map((b) => {
    const p = placementByBox.get(b.id) ?? { inbox: 0, spam: 0, missing: 0 };
    const r = warmupReadiness({ since: b.warmupSince, spamRate: spamPlacementRate(p.inbox, p.spam), coldStartedAt: b.coldStartedAt, minDays: opts.minDays ?? WARMUP_MIN_DAYS, maxSpamRate: opts.readySpamRate ?? WARMUP_READY_SPAM_RATE }, now);
    return { b, p, days: warmupDays(b.warmupSince, now), status: (b.paused ? "paused" : r.ready ? "ready" : "warming") as "ready" | "warming" | "paused" };
  });
  const sum = (xs: typeof rows) => xs.reduce((a, x) => ({ inbox: a.inbox + x.p.inbox, spam: a.spam + x.p.spam, missing: a.missing + x.p.missing }), { inbox: 0, spam: 0, missing: 0 });
  const inboxPct = (p: Placement) => (p.inbox + p.spam ? p.inbox / (p.inbox + p.spam) : null);
  const count = (xs: typeof rows, s: string) => xs.filter((x) => x.status === s).length;
  const domains = [...new Set(rows.map((x) => x.b.domain))].sort().map((domain) => {
    const xs = rows.filter((x) => x.b.domain === domain);
    const days = xs.map((x) => x.days).sort((a, b) => a - b);
    return { domain, mailboxes: xs.length, sentToday: sentTodayByDomain.get(domain) ?? 0, inboxPct: inboxPct(sum(xs)), minDays: days[0] ?? 0, ready: count(xs, "ready"), warming: count(xs, "warming"), paused: count(xs, "paused") };
  });
  return { mailboxes: rows.length, sentToday: domains.reduce((a, d) => a + d.sentToday, 0), inboxPct: inboxPct(sum(rows)), ready: count(rows, "ready"), warming: count(rows, "warming"), paused: count(rows, "paused"), domains };
}

export type WarmupSummary = ReturnType<typeof summarizeWarmup>;
