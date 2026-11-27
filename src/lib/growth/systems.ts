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
  { key: "activation", label: "Live-in-7-days nudges + first-win emails (opt-out)", stage: "keep", utmSource: "activation", cycleMinutes: 15, silentAlertHours: 24 * 60 },
  { key: "proof", label: "Day-14/30 measured results + case-study consent", stage: "keep", utmSource: "proof", cycleMinutes: 15, silentAlertHours: 24 * 90 },
  { key: "cancel_save", label: "Cancel-intent 'what went wrong?' note", stage: "keep", utmSource: "cancel_save", cycleMinutes: 15, silentAlertHours: 24 * 120 },
  { key: "guarantee_watch", label: "Live-in-7-days breach alert to Nolan", stage: "keep", utmSource: "guarantee", cycleMinutes: 15, silentAlertHours: 24 * 120 },
  { key: "content_queue", label: "Weekly ad-of-the-week + trade playbook content queue", stage: "acquire", utmSource: "content_queue", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 21 },
  { key: "reels", label: "Ozzy short videos (Reels / Shorts / TikTok queue)", stage: "acquire", utmSource: "reels", cycleMinutes: 60, silentAlertHours: 24 * 4 },
  { key: "indexnow", label: "IndexNow pinger (new URLs to search engines)", stage: "acquire", utmSource: "indexnow", cycleMinutes: 24 * 60, silentAlertHours: 24 * 30 },
  { key: "kly_refill", label: "Kly weekly lead refill check (alerts when ad-library leads run low)", stage: "acquire", utmSource: "kly_refill", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 60 },
  { key: "nurture", label: "Free-pack nurture: segment-aware value-first sequence (max 5 emails / 21 days)", stage: "convert", utmSource: "nurture", cycleMinutes: 30, silentAlertHours: 24 * 14 },
  { key: "activation_rescue", label: "Activation rescue: stuck-state unblockers + failure-cause analytics", stage: "keep", utmSource: "rescue", cycleMinutes: 30, silentAlertHours: 24 * 30 },
  { key: "reactivation", label: "Reactivation: day 30/60/90 what's new + cancelled feedback ask", stage: "keep", utmSource: "reactivation", cycleMinutes: 30, silentAlertHours: 24 * 45 },
  { key: "expansion", label: "Expansion + referrals at happy moments (data-triggered)", stage: "keep", utmSource: "expansion", cycleMinutes: 30, silentAlertHours: 24 * 45 },
  { key: "success_agent", label: "Autonomous customer-success agent: daily clustered findings", stage: "keep", utmSource: "success_agent", cycleMinutes: 24 * 60, silentAlertHours: 24 * 3 },
  { key: "funnel_monitor", label: "Daily funnel monitor (public pages, Stripe objects, stuck packs; emails on failure)", stage: "keep", utmSource: "funnel_monitor", cycleMinutes: 24 * 60, silentAlertHours: 24 * 3 },
  { key: "optimizer", label: "Autonomous optimiser (weekly business loop: diagnose, decide, act within guardrails)", stage: "keep", utmSource: "optimizer", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 21 },
  { key: "exec_strategy", label: "Executive strategy engine (weekly: business context, stage, constraint, objectives, decisions; defaults to hold_and_measure)", stage: "keep", utmSource: "exec_strategy", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 21 },
  { key: "exec_digest", label: "Executive strategy weekly plain-English digest to the owner", stage: "keep", utmSource: "exec_digest", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 60 },
  { key: "optimizer_digest", label: "Optimiser weekly plain-English digest to the owner", stage: "keep", utmSource: "optimizer_digest", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 60 },
  { key: "revenue_intel", label: "Revenue intelligence: daily economics, constraint and stage snapshot", stage: "keep", utmSource: "revenue_intel", cycleMinutes: 24 * 60, silentAlertHours: 24 * 3 },
  { key: "revenue_digest", label: "Monday revenue digest email to the owner", stage: "keep", utmSource: "revenue_digest", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 21 },
  { key: "offer_intel", label: "Offer intelligence: objection map, offer gap, copy experiments, coherence checks", stage: "convert", utmSource: "offer_intel", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 21 },
  { key: "reliability", label: "Reliability intelligence: daily SLO snapshot, outage/stuck-job findings, breach alerts", stage: "keep", utmSource: "reliability", cycleMinutes: 60, silentAlertHours: 24 * 3 },
  { key: "delivery_econ", label: "Delivery economics: cost-to-deliver, margin per plan/offer, cost hotspots, savings proposals", stage: "keep", utmSource: "delivery_econ", cycleMinutes: 24 * 60, silentAlertHours: 24 * 3 },
  { key: "competitive", label: "Competitive intelligence: product proposals from the public-sourced scorecard", stage: "convert", utmSource: "competitive", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 30 },
  { key: "product_loop", label: "Autonomous product loop: weekly ranked product backlog + what-to-build-next digest", stage: "keep", utmSource: "product_loop", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 21 },
  { key: "customer_memory", label: "Customer memory: per-business brief + self-learning guidance in ad generation", stage: "keep", utmSource: "customer_memory", cycleMinutes: 24 * 60, silentAlertHours: 24 * 14 },
  { key: "agency_ops", label: "Agency operations: multi-client dashboard and bulk weekly drop", stage: "keep", utmSource: "agency_ops", cycleMinutes: 24 * 60, silentAlertHours: 24 * 30 },
  { key: "simplicity", label: "Radical simplicity: one next step per customer, prefilled defaults", stage: "convert", utmSource: "simplicity", cycleMinutes: 24 * 60, silentAlertHours: 24 * 30 },
  { key: "creative_qa", label: "Creative QA: scores every finished pack (report-only), weekly findings and change proposals", stage: "keep", utmSource: "creative_qa", cycleMinutes: 60, silentAlertHours: 24 * 14 },
  { key: "outcome_verify", label: "Outcome verification: customer timelines, preventable-failure alerts, creative effectiveness ledger", stage: "keep", utmSource: "outcome_verify", cycleMinutes: 60, silentAlertHours: 24 * 14 },
  { key: "ops_control", label: "Ops control: daily system accountability ledger (system_status) + cross-system findings", stage: "keep", utmSource: "ops_control", cycleMinutes: 24 * 60, silentAlertHours: 24 * 3 },
  { key: "ops_digest", label: "Weekly owner brief (what changed + what needs a decision)", stage: "keep", utmSource: "ops_digest", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 21 },
  { key: "finance_intel", label: "Financial intelligence: daily/weekly P&L snapshot (finance_snapshot), Meta ad_spend capture, cost anomalies (docs/ops/prd.md)", stage: "keep", utmSource: "finance_intel", cycleMinutes: 24 * 60, silentAlertHours: 24 * 3 },
  { key: "biz_admin", label: "Business administration: obligations registry + ONE weekly digest of what is due in 30 days", stage: "keep", utmSource: "biz_admin", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 60 },
  { key: "partner_ops", label: "Partner operations: monthly commission statements, health, activation/thank-you emails (never pays)", stage: "keep", utmSource: "partner_ops", cycleMinutes: 24 * 60, silentAlertHours: 24 * 60 },
  { key: "team_ops", label: "Ozzy's team: campaign operations", stage: "keep", utmSource: "team", cycleMinutes: 15, silentAlertHours: 24 * 7 },
  { key: "support_ops", label: "Support ops: unified inbox, failed-job tickets, SLA timers, KB answers, refund recommendations", stage: "keep", utmSource: "support_ops", cycleMinutes: 10, silentAlertHours: 24 * 14 },
  { key: "incidents", label: "Incident management: signals to incidents, safe containment, owner escalation, daily learning review", stage: "keep", utmSource: "incidents", cycleMinutes: 10, silentAlertHours: 24 * 30 },
  { key: "exec_coordinator", label: "Executive coordinator: routes approved objectives to allow-listed reversible actions, build_request queue, performance, allocation, risks (docs/exec)", stage: "keep", utmSource: "exec_coordinator", cycleMinutes: 24 * 60, silentAlertHours: 24 * 9 },
  { key: "exec_brief", label: "Weekly executive brief: the ONE Monday owner email (absorbs the revenue/optimiser/ops digests)", stage: "keep", utmSource: "exec_brief", cycleMinutes: 7 * 24 * 60, silentAlertHours: 24 * 21 },
  { key: "infra_watch", label: "Infrastructure watch: health, DB, SSL/domain/token expiry (read-only), weekly expiring-soon list", stage: "keep", utmSource: "infra_watch", cycleMinutes: 60, silentAlertHours: 24 * 3 },
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
