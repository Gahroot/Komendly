// Autopilot growth systems registry (docs/prd-autopilot-growth.md). Pure TS: imported by web, engine and kly.
// Every system has: a kill switch (AdsFeatureFlag `sys_<key>`, missing row = OFF), an attribution tag
// (first-touch utm_source; links a system emits MUST carry utm_source=<utmSource>), and a health heartbeat
// (EngineHeartbeat id `system:<key>`, kind "system") written by recordSystemRun on every cycle.

export type SystemStage = "acquire" | "convert" | "keep";

export interface GrowthSystem {
  key: string;
  label: string;
  stage: SystemStage;
  /** utm_source every outbound/share link of this system carries; first touch with it = traced to this system. */
  utmSource: string;
  /** How often the system runs on its own (cycle), minutes. Heartbeat older than 3 cycles = "stalled". */
  cycleMinutes: number;
  /** No output (lead, send, recovery...) for this long while enabled = "silent" alert. */
  silentAlertHours: number;
}

export const GROWTH_SYSTEMS = [
  { key: "checkout_recovery", label: "Abandoned-checkout recovery", stage: "convert", utmSource: "recovery", cycleMinutes: 15, silentAlertHours: 24 * 7 },
  { key: "winback", label: "Churn & failed-payment win-back", stage: "keep", utmSource: "winback", cycleMinutes: 60, silentAlertHours: 24 * 14 },
  { key: "free_tools", label: "Free tools", stage: "acquire", utmSource: "free_tool", cycleMinutes: 60, silentAlertHours: 72 },
  { key: "industry_examples", label: "Industry ad examples", stage: "acquire", utmSource: "examples", cycleMinutes: 24 * 60, silentAlertHours: 24 * 7 },
  { key: "ai_assistant", label: "AI assistants (ChatGPT / Claude)", stage: "acquire", utmSource: "ai_assistant", cycleMinutes: 60, silentAlertHours: 24 * 7 },
  { key: "viral_branding", label: "Branding on free output", stage: "acquire", utmSource: "made_with", cycleMinutes: 60, silentAlertHours: 24 * 7 },
  { key: "review_gifts", label: "Review-video gifts", stage: "acquire", utmSource: "review_gift", cycleMinutes: 60, silentAlertHours: 72 },
  { key: "new_business", label: "New-business timing", stage: "acquire", utmSource: "new_business", cycleMinutes: 60, silentAlertHours: 72 },
  { key: "shopify", label: "Shopify App Store", stage: "acquire", utmSource: "shopify", cycleMinutes: 60, silentAlertHours: 24 * 14 },
  { key: "jobber", label: "Jobber App Marketplace", stage: "acquire", utmSource: "jobber", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 14 },
  { key: "ad_check", label: "Meta Ad Check grader", stage: "acquire", utmSource: "ad_check", cycleMinutes: 15, silentAlertHours: 72 },
  { key: "chrome_ext", label: "Chrome extension (Remake this ad)", stage: "acquire", utmSource: "chrome_ext", cycleMinutes: 24 * 60, silentAlertHours: 24 * 14 },
  { key: "ad_watch", label: "Competitor ad watch (weekly email)", stage: "acquire", utmSource: "ad_watch", cycleMinutes: 60, silentAlertHours: 24 * 14 },
  { key: "meta_results", label: "Weekly Meta results report", stage: "keep", utmSource: "meta_results", cycleMinutes: 60, silentAlertHours: 24 * 8 },
  { key: "lead_alerts", label: "Instant Meta lead alerts", stage: "keep", utmSource: "lead_alert", cycleMinutes: 60, silentAlertHours: 24 * 30 },
  { key: "zapier", label: "Zapier integration", stage: "acquire", utmSource: "zapier", cycleMinutes: 60, silentAlertHours: 24 * 14 },
  { key: "data_report", label: "Ad Library data report", stage: "acquire", utmSource: "data_report", cycleMinutes: 30 * 24 * 60, silentAlertHours: 24 * 95 },
  { key: "creative_hubs", label: "Creative hubs: makeover / rescue / giveaway / nonprofit intake, votes, approve links", stage: "acquire", utmSource: "hub", cycleMinutes: 24 * 60, silentAlertHours: 24 * 30 },
  { key: "creative_outreach", label: "Nominee notice email (one-time, opt-out)", stage: "acquire", utmSource: "nominate", cycleMinutes: 24 * 60, silentAlertHours: 24 * 60 },
  { key: "creative_publish", label: "Public showcase, makeovers and business of the day (opt-in only)", stage: "acquire", utmSource: "showcase", cycleMinutes: 24 * 60, silentAlertHours: 24 * 60 },
  { key: "team_ops", label: "Ozzy's team: campaign operations", stage: "keep", utmSource: "team", cycleMinutes: 15, silentAlertHours: 24 * 7 },
] as const satisfies readonly GrowthSystem[];

export type SystemKey = (typeof GROWTH_SYSTEMS)[number]["key"];

export const systemFlagKey = (key: SystemKey) => `sys_${key}`;
export const systemHeartbeatId = (key: SystemKey) => `system:${key}`;
export function getSystem(key: string): GrowthSystem | undefined {
  return GROWTH_SYSTEMS.find((s) => s.key === key);
}

/** Which growth system a first touch belongs to (by utm_source), or null. */
export function systemForTouch(t: { utm_source?: string | null } | null | undefined): SystemKey | null {
  const src = t?.utm_source?.toLowerCase().trim();
  if (!src) return null;
  return GROWTH_SYSTEMS.find((s) => s.utmSource === src)?.key ?? null;
}

/** Append this system's attribution UTM params to a URL (keeps existing params; never overwrites utm_source). */
export function withSystemUtm(url: string, key: SystemKey, extra: { campaign?: string; content?: string; medium?: string } = {}): string {
  const sys = getSystem(key)!;
  const u = new URL(url);
  if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", sys.utmSource);
  if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", extra.medium ?? sys.stage);
  if (extra.campaign && !u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", extra.campaign);
  if (extra.content && !u.searchParams.has("utm_content")) u.searchParams.set("utm_content", extra.content);
  return u.toString();
}

export interface SystemBeat {
  firstRunAt: string | null;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastOutputAt: string | null;
  runs: number;
  outputs: number;
  lastError: string | null;
  /** Set by the monitor when it alerted; cleared when healthy again. */
  alertedAt?: string | null;
  alertReason?: string | null;
}

export type SystemHealth = "off" | "healthy" | "never_ran" | "failing" | "stalled" | "silent";

/** Pure: health of one system from its flag + heartbeat. */
export function systemHealth(sys: GrowthSystem, enabled: boolean, beat: SystemBeat | null, now: Date): SystemHealth {
  if (!enabled) return "off";
  if (!beat?.lastRunAt) return "never_ran";
  const t = (s: string | null) => (s ? new Date(s).getTime() : 0);
  if (beat.lastError && t(beat.lastRunAt) > t(beat.lastOkAt)) return "failing";
  if (now.getTime() - t(beat.lastRunAt) > 3 * sys.cycleMinutes * 60_000) return "stalled";
  const from = t(beat.lastOutputAt) || t(beat.firstRunAt);
  if (from && now.getTime() - from > sys.silentAlertHours * 3_600_000) return "silent";
  return "healthy";
}

/** Minimal Prisma surface (web, engine and kly clients all satisfy it). */
export interface SystemDb {
  adsFeatureFlag: { findUnique(a: { where: { key: string } }): Promise<{ enabled: boolean } | null> };
  engineHeartbeat: {
    findUnique(a: { where: { id: string } }): Promise<{ meta: unknown } | null>;
    upsert(a: { where: { id: string }; create: { id: string; kind: string; ok: boolean; message: string | null; meta: object }; update: { ok: boolean; message: string | null; meta: object } }): Promise<unknown>;
  };
}

/** Kill switch: true only when the admin turned the system on. Errors read as OFF (fail safe). */
export async function systemEnabled(db: SystemDb, key: SystemKey): Promise<boolean> {
  try {
    return Boolean((await db.adsFeatureFlag.findUnique({ where: { key: systemFlagKey(key) } }))?.enabled);
  } catch {
    return false;
  }
}

export function parseBeat(meta: unknown): SystemBeat {
  const m = (meta && typeof meta === "object" ? meta : {}) as Partial<SystemBeat>;
  return { firstRunAt: m.firstRunAt ?? null, lastRunAt: m.lastRunAt ?? null, lastOkAt: m.lastOkAt ?? null, lastOutputAt: m.lastOutputAt ?? null, runs: m.runs ?? 0, outputs: m.outputs ?? 0, lastError: m.lastError ?? null, alertedAt: m.alertedAt ?? null, alertReason: m.alertReason ?? null };
}

/** Pure: next heartbeat after one cycle. outputs = results produced this cycle (emails sent, leads, recoveries...). */
export function nextBeat(prev: SystemBeat, r: { ok: boolean; outputs?: number; error?: string | null }, now: Date): SystemBeat {
  const at = now.toISOString();
  const outputs = Math.max(0, r.outputs ?? 0);
  return {
    ...prev,
    firstRunAt: prev.firstRunAt ?? at,
    lastRunAt: at,
    lastOkAt: r.ok ? at : prev.lastOkAt,
    lastOutputAt: outputs > 0 ? at : prev.lastOutputAt,
    runs: prev.runs + 1,
    outputs: prev.outputs + outputs,
    lastError: r.ok ? null : (r.error ?? "failed").slice(0, 500),
  };
}

/** Record one cycle of a system (call at the end of every tick, also when it found nothing to do). Never throws. */
export async function recordSystemRun(db: SystemDb, key: SystemKey, r: { ok: boolean; outputs?: number; error?: string | null }, now = new Date()): Promise<void> {
  try {
    const id = systemHeartbeatId(key);
    const prev = parseBeat((await db.engineHeartbeat.findUnique({ where: { id } }))?.meta);
    const meta = nextBeat(prev, r, now);
    const message = r.ok ? null : meta.lastError;
    await db.engineHeartbeat.upsert({ where: { id }, create: { id, kind: "system", ok: r.ok, message, meta: meta as unknown as object }, update: { ok: r.ok, message, meta: meta as unknown as object } });
  } catch (e) {
    console.warn(`[growth:${key}] heartbeat failed`, e instanceof Error ? e.message : e);
  }
}
