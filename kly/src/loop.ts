// Kly tick orchestration. Every step is isolated (try/catch + log); ticks never overlap; all state that matters lives
// in Postgres (settings, arms, decisions, leads), so a restart just resumes. In-memory state is only for timing/health.
import { audienceOf } from "./targets";
import type { Db } from "./db";
import { errMsg, log } from "./log";
import type { KlyAI } from "./ai";
import { codexWeeklyPct } from "./ai";
import { chooseArm, ensureSeeds, promoteAndRetire, refreshArmStats, seededRng, type Rng } from "./arms";
import { autoscaleTick, currentVolume, warmupCapacity } from "./autoscale";
import { syncConversions } from "./conversions";
import { findLeads, type FinderDeps, type Qualifier } from "./finder";
import { assignGiftTiming, OUTBOUND_GIFT_SOURCE, prebuiltWaiting, startHookAds, syncLeadAds, syncEncoreCosts } from "./hook";
import { pollDue, type AlertFn } from "./imap";
import { createMailRuntime, loadMailboxes, MAILDOSO_SYNC_EVERY_MS, type MailRuntime, type StoredMailbox } from "./mailboxes";
import { syncMaildoso } from "./maildoso";
import { domainHealthTick } from "./domains";
import { domainCapTick } from "./domain-caps";
import { pageText, qualifyLead } from "./qualify";
import { purgeStaleLeads } from "./retention";
import { outboundEnv, senderTick } from "./sender";
import { strategistTick } from "./strategist";
import { voiceTick } from "./voice";
import { warmupSecretOf, warmupTick } from "./warmup";
import { createSourceRuntime, type SourceRuntime } from "./sources";
import { dayStart, decide, getSettings, killSwitchReason, overBudget, upsertDaily, type KlySettingsRow } from "./settings";

export const TICK_MS = 60_000;
export const IMAP_EVERY_MS = 5 * 60_000;
export const CODEX_USAGE_EVERY_MS = 15 * 60_000;
export const BUFFER_DAYS = 2;
export const MAX_FIND_PER_TICK = 10;
export const MAX_GIFTS_PER_TICK = 5;
/** Cities tried per discovery tick (sources exhaust a niche|city quickly). */
export const CITIES_PER_DISCOVERY = 3;
/** Discovery stops starting new candidates after this, so sending/voice steps keep their cadence. */
export const DISCOVERY_DEADLINE_MS = 4 * 60_000;

// ---------------------------------------------------------------------------
// Pure decisions (unit-tested)

export interface GiftGate {
  dailyGiftCap: number;
  giftsToday: number;
  overBudget: boolean;
  codexPct: number | null;
  maxCodexWeeklyPct: number;
}

/** AI spend stop shared by discovery (qualification) and gift starts. Null = go. */
export function spendStop(g: Pick<GiftGate, "overBudget" | "codexPct" | "maxCodexWeeklyPct">): string | null {
  if (g.overBudget) return "monthly budget reached";
  if (g.codexPct !== null && g.codexPct >= g.maxCodexWeeklyPct) return `Codex weekly usage ${g.codexPct}% >= ${g.maxCodexWeeklyPct}%`;
  return null;
}

/** How many gifts may start this tick, and why not when 0. */
export function giftAllowance(g: GiftGate, perTick = MAX_GIFTS_PER_TICK): { allowed: number; reason: string | null } {
  const stop = spendStop(g);
  if (stop) return { allowed: 0, reason: stop };
  const left = Math.max(0, g.dailyGiftCap - g.giftsToday);
  if (left === 0) return { allowed: 0, reason: "daily gift cap reached" };
  return { allowed: Math.min(left, perTick), reason: null };
}

export const IDLE_GIFT_STOCK = 6;

/** Gifts that may still start given unsent gifted leads: ~BUFFER_DAYS of volume when live, a small stock otherwise. */
export function giftHeadroom(sendingLive: boolean, dailyVolume: number, unsent: number): number {
  return Math.max(0, (sendingLive ? dailyVolume * BUFFER_DAYS : IDLE_GIFT_STOCK) - unsent);
}

/** Leads to discover now so the buffer holds ~BUFFER_DAYS of sending capacity. */
export function discoveryNeed(dailyVolume: number, buffered: number, perTick = MAX_FIND_PER_TICK): number {
  return Math.max(0, Math.min(perTick, dailyVolume * BUFFER_DAYS - buffered));
}

// ---------------------------------------------------------------------------

export interface LoopDeps {
  db: Db;
  ai: KlyAI | null;
  alert: AlertFn;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  rng?: Rng;
}

export interface LoopState {
  ticks: number;
  lastTickAt: Date | null;
  lastTickMs: number | null;
  lastImapAt: number;
  lastRetentionDay: string | null;
  codexPct: number | null;
  codexPctAt: number;
  lastStop: string | null;
  killSwitch: string | null;
  dailyVolume: number | null;
  errors: Array<{ step: string; error: string; at: string }>;
  /** Lead-source runtime: geocode cache, endpoint throttles, search-engine blocks (not persisted beyond blocks). */
  sources: SourceRuntime;
  /** Pooled SMTP transports + Maildoso sync timing (mailboxes.ts). */
  mail: MailRuntime;
}

export function newLoopState(): LoopState {
  return { ticks: 0, lastTickAt: null, lastTickMs: null, lastImapAt: 0, lastRetentionDay: null, codexPct: null, codexPctAt: 0, lastStop: null, killSwitch: null, dailyVolume: null, errors: [], sources: createSourceRuntime(), mail: createMailRuntime() };
}

/** Claim and process one pending OutboundRun (admin/CLI lead-finding request). */
export async function processRunRequest(db: Db, qualifyFor?: (niche: string) => Qualifier | undefined, minScore?: number, extra: Partial<FinderDeps> = {}): Promise<string | null> {
  const run = await db.outboundRun.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" } });
  if (!run) return null;
  const claimed = await db.outboundRun.updateMany({ where: { id: run.id, status: "pending" }, data: { status: "running" } });
  if (claimed.count !== 1) return null;
  try {
    const r = await findLeads({ ...extra, db, qualify: qualifyFor?.(run.niche), minScore }, { runId: run.id, niche: run.niche, cities: run.cities, count: run.count });
    await db.outboundRun.update({ where: { id: run.id }, data: { status: "done", found: r.created.length, result: { skipped: r.skipped } } });
    return run.id;
  } catch (e) {
    await db.outboundRun.update({ where: { id: run.id }, data: { status: "failed", result: { error: errMsg(e) } } });
    throw e;
  }
}

export function qualifierFor(ai: KlyAI | null, niche: string): Qualifier | undefined {
  if (!ai) return undefined;
  return async (p, html) => qualifyLead(ai.provider, { name: p.name, website: p.website, niche, city: p.city, homeText: pageText(html), audience: audienceOf(niche) });
}

/** Leads waiting to be sent: qualified found leads + ready ads not yet emailed. */
export async function leadBuffer(db: Db, voice = false): Promise<number> {
  if (!voice) return db.outboundLead.count({ where: { step: 0, status: { in: ["found", "ad_made"] }, email: { not: "" } } });
  return db.outboundLead.count({ where: { step: 0, status: { in: ["found", "ad_made"] }, OR: [{ email: { not: "" } }, { phone: { not: null }, voiceStatus: null }] } });
}

/** Daily lead need: email capacity, or the call cap when voice calling is on (whichever is larger). */
export function supplyVolume(emailVolume: number, s: Pick<KlySettingsRow, "voiceEnabled" | "dailyCallCap">): number {
  return s.voiceEnabled ? Math.max(emailVolume, s.dailyCallCap) : emailVolume;
}

/** Per-tick discovery cap: KlySettings.discoveryPerTick when voice calling is on (1000+ phone leads/day), else 10. */
export function discoveryPerTick(s: Pick<KlySettingsRow, "voiceEnabled" | "discoveryPerTick">): number {
  return s.voiceEnabled ? Math.max(MAX_FIND_PER_TICK, s.discoveryPerTick) : MAX_FIND_PER_TICK;
}

/** Up to `n` distinct cities from the arm, random order. */
export function pickCities(cities: readonly string[], n: number, rng: Rng): string[] {
  const pool = [...cities];
  const out: string[] = [];
  while (pool.length && out.length < n) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0] as string);
  return out;
}

/** Segment-arm driven discovery: pick a niche arm (and a few of its cities) and find up to `need` leads tagged with it. */
export async function discover(db: Db, ai: KlyAI | null, s: KlySettingsRow, need: number, rng: Rng, rt: SourceRuntime = createSourceRuntime()): Promise<{ segment: string | null; created: number }> {
  if (need <= 0) return { segment: null, created: 0 };
  const arm = await chooseArm(db, "segment", rng, s.explorationPct);
  if (!arm) return { segment: null, created: 0 };
  const c = arm.content as { niche?: string; city?: string; cities?: string[] };
  const cities = c.cities?.length ? pickCities(c.cities, CITIES_PER_DISCOVERY, rng) : c.city ? [c.city] : [];
  if (!c.niche || !cities.length) return { segment: arm.key, created: 0 };
  const r = await findLeads(
    { db, qualify: qualifierFor(ai, c.niche), minScore: s.minLeadScore, allowPhoneOnly: s.voiceEnabled, sources: s.sources, rt, ai, codexSearchCalls: s.codexSearchPerTick, deadlineMs: DISCOVERY_DEADLINE_MS },
    { runId: null, niche: c.niche, cities, count: need, armIds: [arm.id] },
  );
  log("info", "kly discovery", { segment: `${arm.key} in ${cities.join(" / ")}`, created: r.created.length, skipped: r.skipped });
  return { segment: arm.key, created: r.created.length };
}

async function step(state: LoopState, name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const error = errMsg(e);
    log("warn", `kly step failed: ${name}`, { error });
    state.errors.push({ step: name, error: error.slice(0, 300), at: new Date().toISOString() });
  }
}

/** One full cycle. Never throws. */
export async function runTick(d: LoopDeps, state: LoopState): Promise<void> {
  const env = d.env ?? process.env;
  const clock = d.now ?? (() => new Date());
  const now = clock();
  const started = Date.now();
  const rng = d.rng ?? seededRng(now.getTime() & 0xffffffff);
  const { db } = d;
  const cfg = outboundEnv(env);
  const provider = d.ai?.provider ?? null;
  state.errors = [];
  let s: KlySettingsRow;
  try {
    s = await getSettings(db);
  } catch (e) {
    state.errors.push({ step: "settings", error: errMsg(e), at: now.toISOString() });
    log("error", "kly settings unreadable", { error: errMsg(e) });
    return;
  }
  const kill = await killSwitchReason(db, s).catch((e: unknown) => `kill switch unreadable: ${errMsg(e)}`);
  state.killSwitch = kill;
  // Env Gmail boxes + DB-stored rented mailboxes (decrypted with ADS_TOKEN_KEY).
  const boxes: StoredMailbox[] = await loadMailboxes(db, env).catch((e: unknown) => (log("warn", "kly mailboxes unreadable", { error: errMsg(e) }), []));
  const sendingLive = !kill && cfg.enabled && !cfg.dryRun && boxes.length > 0;

  await step(state, "seeds", () => ensureSeeds(db));
  // What can actually go out today: the autoscale brake, capped by the mailboxes' warm-up limits (no mailboxes: the brake).
  const brake = await currentVolume(db, s).catch(() => s.dailySendCeiling);
  const warm = sendingLive ? await warmupCapacity(db, boxes.map((m) => m.address), now).catch(() => brake) : brake;
  const volume = Math.max(1, Math.min(brake, warm));
  state.dailyVolume = volume;

  // Spend gates (budget + Codex weekly usage, the latter cached ~15 min).
  let stop: string | null = null;
  await step(state, "spend", async () => {
    if (d.ai && Date.now() - state.codexPctAt >= CODEX_USAGE_EVERY_MS) {
      state.codexPctAt = Date.now();
      state.codexPct = await codexWeeklyPct(d.ai.auth).catch((e: unknown) => (log("warn", "kly codex usage unknown", { error: errMsg(e) }), state.codexPct));
    }
    const b = await overBudget(db, s, now);
    stop = spendStop({ overBudget: b.over, codexPct: state.codexPct, maxCodexWeeklyPct: s.maxCodexWeeklyPct });
    if (stop && stop !== state.lastStop) await decide(db, "budget", `Paused new gifts and discovery: ${stop}.`, { spentMicros: b.spentMicros.toString(), budgetMicros: b.budgetMicros.toString(), codexPct: state.codexPct });
    if (!stop && state.lastStop) await decide(db, "resume", `Resumed gifts and discovery (${state.lastStop} cleared).`);
    state.lastStop = stop;
  });

  if (!kill) {
    await step(state, "runs", () => processRunRequest(db, (n) => qualifierFor(d.ai, n), s.minLeadScore, { sources: s.sources, rt: state.sources, ai: d.ai, codexSearchCalls: s.codexSearchPerTick, allowPhoneOnly: s.voiceEnabled }));
    if (!stop) await step(state, "discovery", async () => discover(db, d.ai, s, discoveryNeed(supplyVolume(volume, s), await leadBuffer(db, s.voiceEnabled), discoveryPerTick(s)), rng, state.sources));
    await step(state, "gifts", async () => {
      // AI gift runs started today (on-click gift pages without a run yet cost nothing).
      const giftsToday = await db.adsGift.count({ where: { source: OUTBOUND_GIFT_SOURCE, runId: { not: null }, createdAt: { gte: dayStart(now) } } });
      const g = giftAllowance({ dailyGiftCap: s.dailyGiftCap, giftsToday, overBudget: stop === "monthly budget reached", codexPct: state.codexPct, maxCodexWeeklyPct: s.maxCodexWeeklyPct });
      // Only make gifts a little ahead of what can actually be sent (no mailboxes yet -> a small ready stock).
      const unsent = await db.outboundLead.count({ where: { step: 0, giftId: { not: null }, status: { in: ["found", "ad_made", "queued"] } } });
      const headroom = giftHeadroom(sendingLive, volume, unsent);
      // Timing first (free): on-click leads become sendable at once; prebuilt ones join the AI queue below.
      // Pre-made gifts are capped per day (dailyGiftCap); once a day's worth is queued, new leads go on-click so
      // sending at mailbox scale never waits on the gift queue.
      const waiting = await prebuiltWaiting(db);
      const t = await assignGiftTiming(db, { limit: Math.max(0, headroom - Math.min(waiting, s.dailyGiftCap)), senderName: cfg.senderName, minScore: s.minLeadScore, rng, explorationPct: s.explorationPct, forceOnClick: Boolean(stop) || waiting >= s.dailyGiftCap, env });
      if (t.onClick || t.prebuilt) log("info", "kly gift timing", t);
      const allowed = Math.min(g.allowed, headroom);
      if (allowed > 0) await startHookAds(db, { limit: allowed, senderName: cfg.senderName, minScore: s.minLeadScore, rng, explorationPct: s.explorationPct, env });
    });
  }
  await step(state, "gift sync", async () => {
    const r = await syncLeadAds({ db, provider, base: cfg.base, minQualityScore: s.minQualityScore, followUpDays: s.followUpDays, now: clock });
    if (r.made || r.rejected || r.retried || r.failed) log("info", "kly gifts", r);
  });
  await step(state, "encore costs", () => syncEncoreCosts(db, now));
  if (sendingLive) {
    await step(state, "sender", async () => {
      const sent = await senderTick({ db, provider, env, rng, dailyVolume: volume, followUpDays: s.followUpDays, maxSteps: s.maxSteps, explorationPct: s.explorationPct, now: clock, mailboxes: boxes, transport: state.mail.pool.transport, warmup: s, probeSecret: s.warmupEnabled ? warmupSecretOf(env) : undefined });
      if (sent.some((x) => x.result.startsWith("sent") || x.result.startsWith("auto-paused"))) log("info", "kly sender", { sent });
    });
  }
  await step(state, "voice", async () => {
    const r = await voiceTick({
      db, settings: s, killSwitch: kill, sendingLive, env, now: clock, alert: d.alert,
      // Requested on a call: bypasses dailyGiftCap, still stopped by the monthly budget / Codex weekly cap.
      startGift: async (ids) => (kill || stop ? 0 : startHookAds(db, { limit: ids.length, leadIds: ids, senderName: cfg.senderName, minScore: 0, rng, explorationPct: s.explorationPct, env })),
    });
    if (r.push?.pushed || r.events || r.giftEmails || r.suppressed) log("info", "kly voice", { ...r });
  });
  // Inbound (bounces, complaints, unsubscribes, replies) is honoured even when the kill switch is on.
  // Each mailbox is polled every ~10-15 min on its own staggered slot, a few at a time (imap.ts pollDue).
  if (boxes.length && !cfg.dryRun) {
    await step(state, "imap", async () => {
      const r = await pollDue({ db, provider, alert: d.alert, autoReply: s.autoReply && sendingLive, cfg, transport: sendingLive ? state.mail.pool.transport : null, now: clock }, boxes, now);
      const busy = r.filter((x) => x.seen || x.error);
      if (busy.length) log("info", "kly imap", { polled: r.length, busy });
    });
  }
  // Peer warm-up (own switch KlySettings.warmupEnabled; runs before OUTBOUND_ENABLED so mailboxes warm first).
  if (boxes.length && !cfg.dryRun) {
    await step(state, "warmup", async () => {
      const r = await warmupTick({ db, settings: s, boxes, transport: state.mail.pool.transport, now, rng, secret: warmupSecretOf(env), rt: state.mail.warmup });
      if (r.sent || r.failed || r.changed.length) log("info", "kly warm-up", r);
    });
  }
  await step(state, "mailbox upkeep", async () => {
    const token = env.MAILDOSO_API_TOKEN?.trim();
    if (token && Date.now() - state.mail.lastMaildosoAt >= MAILDOSO_SYNC_EVERY_MS) {
      state.mail.lastMaildosoAt = Date.now();
      log("info", "kly maildoso sync", await syncMaildoso(db, { token, tokenKey: env.ADS_TOKEN_KEY, now }));
    }
    const changed = await domainHealthTick(db, [...new Set(boxes.map((b) => b.domain))], now);
    if (changed.length) log("info", "kly domain health", { changed });
    const capped = await domainCapTick(db, boxes, now);
    if (capped.length) log("info", "kly domain caps", { capped });
    state.mail.pool.closeIdle(Date.now());
  });
  await step(state, "conversions", async () => {
    await syncConversions(db, now);
    await refreshArmStats(db);
    await promoteAndRetire(db, now);
  });
  if (!kill) await step(state, "strategist", () => strategistTick(db, provider, now));
  await step(state, "autoscale", async () => {
    state.dailyVolume = await autoscaleTick(db, s, now);
  });
  const day = dayStart(now).toISOString();
  if (state.lastRetentionDay !== day) {
    await step(state, "retention", async () => {
      const n = await purgeStaleLeads(db, now);
      if (n) log("info", "kly retention purge", { leads: n });
      state.lastRetentionDay = day;
    });
  }
  await step(state, "daily", () => upsertDaily(db, now));
  state.ticks++;
  state.lastTickAt = now;
  state.lastTickMs = Date.now() - started;
}

/** Start the interval loop. Returns stop(), which waits for the running tick. */
export function startLoop(d: LoopDeps, state: LoopState = newLoopState(), everyMs = TICK_MS): { state: LoopState; stop: () => Promise<void> } {
  let stopped = false;
  let running: Promise<void> | null = null;
  const tick = () => {
    if (stopped || running) return;
    running = runTick(d, state)
      .catch((e: unknown) => log("error", "kly tick crashed", { error: errMsg(e) }))
      .finally(() => {
        running = null;
      });
  };
  const t = setInterval(tick, everyMs);
  tick();
  return {
    state,
    stop: async () => {
      stopped = true;
      clearInterval(t);
      if (running) await running;
    },
  };
}
