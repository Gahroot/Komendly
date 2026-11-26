// Reels self-improvement (pure): rank hooks / formats / trades / lengths from insights, suspend formats with enough data
// and no traction, and pick the next reel ~70% from winners (exploit) / ~30% new hooks (explore). No I/O.
import { REEL_FORMATS, ctaDue, hookLibrary, reelHash, type Hook, type ReelFormat } from "./reels-core";

export interface ReelPerf {
  reelId: string; platform: string; hookId: string; trade: string; format: ReelFormat; seconds: number;
  plays: number; reach: number; shares: number; saves: number; likes: number; comments: number; follows: number; linkClicks: number;
}
export type RankKey = "hookId" | "trade" | "format" | "length";
export const lengthBucket = (s: number) => (s < 20 ? "15-19s" : s < 25 ? "20-24s" : "25-30s");

/** Weighted engagement per 100 viewers: giving > passive (shares/saves/follows/clicks beat likes). */
export function reelScore(p: ReelPerf): number {
  const denom = Math.max(p.reach, p.plays, 50);
  return ((p.shares * 5 + p.saves * 4 + p.follows * 6 + p.linkClicks * 8 + p.comments * 2 + p.likes) / denom) * 100;
}

export interface Ranked { key: string; n: number; plays: number; avgPlays: number; score: number }
export function rank(perfs: readonly ReelPerf[], by: RankKey): Ranked[] {
  const g = new Map<string, ReelPerf[]>();
  for (const p of perfs) {
    const k = by === "length" ? lengthBucket(p.seconds) : p[by];
    g.set(k, [...(g.get(k) ?? []), p]);
  }
  return [...g].map(([key, ps]) => {
    const plays = ps.reduce((a, p) => a + p.plays, 0);
    return { key, n: ps.length, plays, avgPlays: plays / ps.length, score: ps.reduce((a, p) => a + reelScore(p), 0) / ps.length };
  }).sort((a, b) => b.score - a.score || b.plays - a.plays || a.key.localeCompare(b.key));
}

export const SUSPEND_MIN_REELS = 5;
/** Formats with >= minReels reels whose avg plays < 100 or score < 25% of the overall mean. Never suspends every format. */
export function suspendedFormats(perfs: readonly ReelPerf[], minReels = SUSPEND_MIN_REELS): ReelFormat[] {
  if (!perfs.length) return [];
  const overall = perfs.reduce((a, p) => a + reelScore(p), 0) / perfs.length;
  const bad = rank(perfs, "format").filter((r) => r.n >= minReels && (r.avgPlays < 100 || r.score < overall * 0.25)).map((r) => r.key as ReelFormat);
  return bad.length >= REEL_FORMATS.length ? [] : bad;
}

export interface HistoryItem { hookId: string; trade: string; format: ReelFormat; hash: string }
function pseudo(seed: string): number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.codePointAt(0)!, 16777619) >>> 0;
  return (h % 10_000) / 10_000;
}
export const EXPLOIT_SHARE = 0.7;

/**
 * Next hook. Never repeats a (hook, asset) hash. 70% of picks come from the best-scoring hooks seen so far (a winner is
 * reused on a trade it has not run on yet when possible), 30% from hooks never used. Suspended formats are skipped.
 */
export function nextHook(day: string, n: number, history: readonly HistoryItem[], perfs: readonly ReelPerf[], asset = "v1"): { hook: Hook; mode: "explore" | "exploit" } | null {
  const banned = new Set(suspendedFormats(perfs));
  const used = new Set(history.map((h) => h.hash));
  const all = hookLibrary().filter((h) => !banned.has(h.format));
  const fresh = all.filter((h) => !used.has(reelHash(h.id, asset)));
  const usedHooks = new Set(history.map((h) => h.hookId));
  const unseen = fresh.filter((h) => !usedHooks.has(h.id));
  const winners = rank(perfs, "hookId").filter((r) => r.score > 0).map((r) => r.key);
  const exploit = pseudo(`${day}|${n}`) < EXPLOIT_SHARE && winners.length > 0;
  const pickFrom = (list: Hook[]) => list.length ? list[Math.floor(pseudo(`${day}|${n}|p`) * list.length) % list.length]! : null;
  if (exploit) {
    // Winner re-run: the top hook's format on a trade it hasn't covered, else the winner hook itself on a fresh asset.
    const top = winners.slice(0, 3);
    const reruns = fresh.filter((h) => top.some((id) => hookLibrary().find((x) => x.id === id)?.format === h.format && h.id.split(":")[1] === id.split(":")[1]));
    const hit = pickFrom(reruns.filter((h) => !usedHooks.has(h.id))) ?? pickFrom(reruns);
    if (hit) return { hook: hit, mode: "exploit" };
  }
  const e = pickFrom(unseen) ?? pickFrom(fresh);
  return e ? { hook: e, mode: "explore" } : null;
}

/** Whether the next reel carries the soft CTA (every 10th). */
export const nextWithCta = (publishedCount: number) => ctaDue(publishedCount);

export function learningMarkdown(week: string, perfs: readonly ReelPerf[]): { title: string; note: string } {
  if (!perfs.length) return { title: `Reels week ${week}: insights unavailable or no reels measured yet`, note: "No reel metrics were readable this week (no reels old enough, or the Page token lacks insights permission). Nothing was learned; the queue stays on explore." };
  const f = (r: Ranked[]) => r.slice(0, 3).map((x) => `${x.key} (n=${x.n}, score ${x.score.toFixed(1)}, avg plays ${Math.round(x.avgPlays)})`).join("; ");
  const sus = suspendedFormats(perfs);
  return {
    title: `Reels week ${week}: ${perfs.length} reel-platform readings`,
    note: `Top hooks: ${f(rank(perfs, "hookId"))}. Top trades: ${f(rank(perfs, "trade"))}. Formats: ${f(rank(perfs, "format"))}. Lengths: ${f(rank(perfs, "length"))}. ${sus.length ? `Suspended formats: ${sus.join(", ")}.` : "No format suspended."} Next week: ~70% reruns of winners, ~30% new hooks. Small samples: treat as directional only.`,
  };
}

export interface ReadyLite { reelId: string; hookId: string; trade: string; format: ReelFormat; seconds: number }
/** Map raw platform metrics (IG: views/reach/shares/saved...; FB: blue_reels_play_count/post_impressions_unique...) to a ReelPerf. */
export function toPerf(r: ReadyLite, platform: string, m: Record<string, number>): ReelPerf {
  return {
    reelId: r.reelId, platform, hookId: r.hookId, trade: r.trade, format: r.format, seconds: r.seconds,
    plays: m.views ?? m.blue_reels_play_count ?? 0, reach: m.reach ?? m.post_impressions_unique ?? 0, shares: m.shares ?? 0, saves: m.saved ?? 0,
    likes: m.likes ?? m.post_video_likes_by_reaction_type ?? 0, comments: m.comments ?? m.post_video_social_actions ?? 0, follows: m.follows ?? 0, linkClicks: m.linkClicks ?? 0,
  };
}
/** Latest `reel_insights` per (reelId, platform) joined with the reel's plan. Rows without any metric are skipped. */
export function perfsFromEvents(ready: readonly ReadyLite[], insights: ReadonlyArray<{ reelId: string; platform: string; metrics?: Record<string, number>; at: Date }>): ReelPerf[] {
  const latest = new Map<string, (typeof insights)[number]>();
  for (const i of insights) {
    const k = `${i.reelId}|${i.platform}`;
    const cur = latest.get(k);
    if (!cur || cur.at < i.at) latest.set(k, i);
  }
  return [...latest.values()].flatMap((i) => {
    const r = ready.find((x) => x.reelId === i.reelId);
    return r && i.metrics && Object.keys(i.metrics).length ? [toPerf(r, i.platform, i.metrics)] : [];
  });
}

/** ISO week label "2026-W48" (UTC). */
export function isoWeekLabel(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = t.getUTCFullYear();
  return `${y}-W${String(Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7)).padStart(2, "0")}`;
}
