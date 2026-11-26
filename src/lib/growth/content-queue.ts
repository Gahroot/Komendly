// Weekly content queue (system `content_queue`, flag sys_content_queue, default OFF): one "ad of the week" example plus
// trade-playbook posts, ready for the social/content systems to pick up. Pure: no I/O. Honest by construction: copy comes
// from the hand-written playbooks (no stats, no promised results) and examples are labelled templates, not real businesses.
import { FREE_ADS_TRADES } from "./free-ads-trades";
import { tradePage } from "./trade-playbooks";
import { SITE_URL } from "../site";
import { withSystemUtm } from "./systems";

export type QueueChannel = "facebook_post" | "short_video_script" | "email_snippet";
export interface QueueItem {
  id: string;
  week: string;
  trade: string;
  channel: QueueChannel;
  kind: "ad_of_the_week" | "playbook_tip";
  text: string;
  /** Tracked link (utm_source=content_queue). */
  link: string;
}
export interface ContentQueue { week: string; generatedAt: string; trades: string[]; items: QueueItem[] }

/** ISO week label "2026-W48" (UTC). */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}

/** Rotate the top trades: `count` trades starting at the week's offset, so every trade comes round. */
export function tradesForWeek(week: string, count = 3): string[] {
  const n = FREE_ADS_TRADES.length;
  const wk = Number(week.split("-W")[1] ?? 0);
  return Array.from({ length: Math.min(count, n) }, (_, i) => FREE_ADS_TRADES[(wk * count + i) % n]!.slug);
}

export function buildContentQueue(now: Date, count = 3): ContentQueue {
  const week = isoWeek(now);
  const trades = tradesForWeek(week, count);
  const items: QueueItem[] = [];
  trades.forEach((slug, ti) => {
    const page = tradePage(slug);
    const trade = FREE_ADS_TRADES.find((t) => t.slug === slug);
    if (!page || !trade) return;
    const link = (path: string, content: string) => withSystemUtm(`${SITE_URL}${path}`, "content_queue", { campaign: week, content });
    const hook = page.playbook.hooks[ti % page.playbook.hooks.length]!;
    const ex = page.examples[0];
    if (ex) items.push({ id: `${week}:${slug}:aotw`, week, trade: slug, channel: "facebook_post", kind: "ad_of_the_week", text: `Ad idea of the week for ${trade.who} (a template, not a real business): "${ex.headline ?? hook}". Make yours from your own website, free.`, link: link(`/free-ads/${slug}`, "aotw") });
    items.push({ id: `${week}:${slug}:tip`, week, trade: slug, channel: "short_video_script", kind: "playbook_tip", text: `Hook: "${hook}" Then show one real job photo and the offer: ${page.playbook.offers[0] ?? "a free estimate"}.`, link: link(page.path, "tip") });
    items.push({ id: `${week}:${slug}:mail`, week, trade: slug, channel: "email_snippet", kind: "playbook_tip", text: `For ${trade.who}: ${page.budget}`, link: link(page.path, "mail") });
  });
  return { week, generatedAt: now.toISOString(), trades, items };
}
