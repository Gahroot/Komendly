// Scheduled intent-signal scans inside the Kly loop. Both are OFF unless enabled by env (default off in code):
//   KLY_SIGNALS_ENABLED=1  site signals: new domain / new Shopify store / grand opening / redesign for unused Overture places.
//                          A hit becomes a KlyPlace row (id "signal:<domain>", source "signal:<kind>", handled by adlibSource) plus an
//                          AdsEvent "lead_signal" (read back at discovery -> OutboundLead.qualification.signals -> signalLine copy).
//   KLY_INTENT_ENABLED=1   public posts asking for ad help (HN / RSS; Reddit only if its robots.txt allows) -> AdsEvent "intent_opportunity".
// Limits: SITE_EVERY_MS / SITE_PER_RUN domains, INTENT_EVERY_MS. Fetches are robots-aware, rate-limited, UA KomendlyBot, no login.
// Nothing here sends email or touches the governor/caps; the usual finder + compliance gate still apply to every lead.
import type { Prisma } from "@prisma/client";
import type { Db } from "./db";
import { LEAD_SIGNAL_EVENT } from "./adlib";
import { collectPosts, INTENT_EVENT, intentEventProps, toOpportunities, type IntentFetch } from "./intent-queue";
import { log } from "./log";
import { politeFetch } from "./polite-fetch";
import { detectSiteSignals, type SiteFetch } from "./site-signals";
import type { LeadSignal } from "./signals";

export const SITE_EVERY_MS = 2 * 3_600_000;
export const SITE_PER_RUN = 8;
export const INTENT_EVERY_MS = 6 * 3_600_000;
export const RESCAN_DAYS = 60;
export const SCAN_EVENT = "signal_scan";
export interface SignalRuntime { siteAt: number; intentAt: number }

const on = (v: string | undefined) => v === "1" || v === "true";

export interface SignalTickDeps {
  db: Db;
  env: NodeJS.ProcessEnv;
  now: Date;
  rt: SignalRuntime;
  /** Injected in tests; default is the robots-aware polite fetch. */
  fetch?: SiteFetch;
  intentFetch?: IntentFetch;
}

/** Signal kinds -> KlyPlace.source tag. */
export const placeSourceFor = (kind: LeadSignal["kind"]): string => `signal:${kind === "new_shopify_store" ? "new_shopify" : kind}`;

export async function siteSignalScan(db: Db, fetch: SiteFetch, now: Date, limit = SITE_PER_RUN): Promise<{ scanned: number; hits: number }> {
  const since = new Date(now.getTime() - RESCAN_DAYS * 86_400_000);
  const seen = new Set((await db.adsEvent.findMany({ where: { name: SCAN_EVENT, createdAt: { gte: since } }, select: { props: true }, take: 20_000 })).map((e) => (e.props as { domain?: string } | null)?.domain ?? ""));
  const places = await db.klyPlace.findMany({ where: { source: "overture", usedAt: null }, orderBy: [{ confidence: "desc" }, { id: "asc" }], take: 400 });
  const todo: typeof places = [];
  for (const p of places) {
    if (!p.domain || seen.has(p.domain)) continue;
    seen.add(p.domain);
    todo.push(p);
    if (todo.length >= limit) break;
  }
  let hits = 0;
  for (const p of todo) {
    let sigs: LeadSignal[] = [];
    try { sigs = await detectSiteSignals(p.domain, fetch, now); } catch { sigs = []; }
    await db.adsEvent.create({ data: { name: SCAN_EVENT, props: { domain: p.domain, found: sigs.map((s) => s.kind) } as Prisma.InputJsonValue } });
    if (!sigs.length) continue;
    hits++;
    const id = `signal:${p.domain}`;
    const { id: _id, createdAt: _c, usedAt: _u, ...rest } = p;
    void _id; void _c; void _u;
    await db.klyPlace.upsert({ where: { id }, create: { ...rest, id, source: placeSourceFor(sigs[0]!.kind), usedAt: null }, update: {} });
    await db.adsEvent.create({ data: { name: LEAD_SIGNAL_EVENT, props: { domain: p.domain, release: "signal", signals: sigs } as unknown as Prisma.InputJsonValue } });
    await db.klyPlace.update({ where: { id: p.id }, data: { usedAt: now } }); // the signal row replaces it (no double lead)
  }
  return { scanned: todo.length, hits };
}

export async function intentScan(db: Db, fetch: IntentFetch, now: Date): Promise<{ scanned: number; added: number; errors: number }> {
  const { posts, errors } = await collectPosts(fetch);
  const ops = toOpportunities(posts, now);
  if (!ops.length) return { scanned: posts.length, added: 0, errors: errors.length };
  const have = await db.adsEvent.findMany({ where: { name: INTENT_EVENT, OR: ops.map((o) => ({ props: { path: ["id"], equals: o.id } })) }, select: { props: true } });
  const known = new Set(have.map((e) => (e.props as { id?: string } | null)?.id));
  const fresh = ops.filter((o) => !known.has(o.id)).slice(0, 50);
  for (const o of fresh) await db.adsEvent.create({ data: { name: INTENT_EVENT, props: intentEventProps(o) as Prisma.InputJsonValue } });
  return { scanned: posts.length, added: fresh.length, errors: errors.length };
}

export async function signalTick(d: SignalTickDeps): Promise<{ site: { scanned: number; hits: number } | null; intent: { scanned: number; added: number; errors: number } | null }> {
  const out: Awaited<ReturnType<typeof signalTick>> = { site: null, intent: null };
  const t = d.now.getTime();
  if (on(d.env.KLY_SIGNALS_ENABLED) && t - d.rt.siteAt >= SITE_EVERY_MS) {
    d.rt.siteAt = t;
    out.site = await siteSignalScan(d.db, d.fetch ?? politeFetch(), d.now).catch((e) => { log("warn", "kly site signals failed", { error: String(e) }); return null; });
  }
  if (on(d.env.KLY_INTENT_ENABLED) && t - d.rt.intentAt >= INTENT_EVERY_MS) {
    d.rt.intentAt = t;
    out.intent = await intentScan(d.db, d.intentFetch ?? politeFetch({ gapMs: 2000 }), d.now).catch((e) => { log("warn", "kly intent scan failed", { error: String(e) }); return null; });
  }
  return out;
}
