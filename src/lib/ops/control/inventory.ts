// The catalogue of EVERY autonomous capability. Flag-gated systems come from GROWTH_SYSTEMS (so a new system
// shows up in the ledger automatically); engine loops, Kly steps, Vercel crons and MM hooks are listed here.
// Keep this honest: when you add a loop/cron, add a row (a test fails if a cron in vercel.json is missing).
import { GROWTH_SYSTEMS, systemFlagKey, systemHeartbeatId } from "../../growth/systems";

export type CapabilityKind = "system" | "engine_loop" | "kly_step" | "cron" | "mm_hook";
export interface Capability {
  id: string;
  kind: CapabilityKind;
  label: string;
  purpose: string;
  area: string;
  flag: string | null;
  heartbeat: string | null;
  /** AdsEvent names that prove a run / carry its outputs. */
  markers: string[];
  cycleHours: number;
  idleOk: boolean;
  /** Directly protects/creates revenue: throttled last. */
  revenueCritical: boolean;
  /** Cron route / source file, for the manual. */
  where: string;
  noTelemetry?: boolean;
}

const MARKERS: Record<string, string[]> = {
  revenue_intel: ["revenue_snapshot"], revenue_digest: ["revenue_digest_sent"], optimizer: ["optimizer_cycle"], funnel_monitor: ["funnel_check"],
  reliability: ["reliability_snapshot"], reels: ["reel_ready"], success_agent: ["customer_success_finding"], offer_intel: ["offer_proposal"],
  content_queue: ["content_queue_built"], delivery_econ: ["finance_snapshot"], ops_control: ["system_status"], ops_digest: ["ops_brief_sent"], exec_coordinator: ["exec_dispatch"], exec_brief: ["digest_sent"],
};
// Event-driven systems: no output is normal until the trigger happens.
const CRON_OF: Record<string, string> = { revenue_digest: "/api/cron/revenue-digest", indexnow: "/api/cron/indexnow", content_queue: "/api/cron/content-queue", funnel_monitor: "/api/cron/funnel-monitor", incidents: "/api/cron/ops-watchdog" };
const IDLE_OK = new Set(["guarantee_watch", "cancel_save", "lead_alerts", "creative_outreach", "creative_publish", "checkout_recovery", "winback", "jobber", "zapier", "shopify", "chrome_ext", "agency_ops", "activation_rescue", "reactivation", "expansion", "proof", "data_report", "ops_digest", "exec_brief"]);
const REVENUE_CRITICAL = new Set(["checkout_recovery", "winback", "activation", "proof", "nurture", "cancel_save", "guarantee_watch", "funnel_monitor", "reliability", "review_gifts"]);

export const SYSTEM_CAPABILITIES: Capability[] = GROWTH_SYSTEMS.map((s) => ({
  id: `system:${s.key}`, kind: "system", label: s.label, purpose: s.label, area: s.stage, flag: systemFlagKey(s.key), heartbeat: systemHeartbeatId(s.key),
  markers: MARKERS[s.key] ?? [], cycleHours: Math.max(1, s.cycleMinutes / 60), idleOk: IDLE_OK.has(s.key), revenueCritical: REVENUE_CRITICAL.has(s.key), where: `src/lib/growth/systems.ts (${s.key})${CRON_OF[s.key] ? `; cron ${CRON_OF[s.key]}` : ""}`,
}));

const base = { flag: null, heartbeat: null, markers: [] as string[], idleOk: false, revenueCritical: false };
export const OTHER_CAPABILITIES: Capability[] = [
  { ...base, id: "engine:job-runner", kind: "engine_loop", label: "Ad pack / Studio job runner", purpose: "Claims AdJob rows and renders packs, Studio turns", area: "delivery", cycleHours: 1, noTelemetry: true, revenueCritical: true, where: "engine/src/runner.ts", idleOk: true },
  { ...base, id: "engine:lifecycle", kind: "engine_loop", label: "Lifecycle emails", purpose: "Onboarding/unlock/upsell emails", area: "keep", flag: "lifecycle_email", cycleHours: 1, noTelemetry: true, revenueCritical: true, where: "engine/src/lifecycle/send.ts" },
  { ...base, id: "engine:weekly-drop", kind: "engine_loop", label: "Weekly drop", purpose: "Weekly replacement ads for subscribers", area: "keep", cycleHours: 24, idleOk: true, revenueCritical: true, where: "engine/src/jobs/weekly.ts", noTelemetry: true },
  { ...base, id: "engine:bonuses", kind: "engine_loop", label: "Bonus loop", purpose: "Grants and expires customer bonuses", area: "keep", cycleHours: 24, idleOk: true, where: "engine/src/bonuses/loop.ts", noTelemetry: true },
  { ...base, id: "engine:monitor", kind: "engine_loop", label: "Engine/provider monitor", purpose: "Provider login + queue health alerts", area: "reliability", cycleHours: 1, idleOk: true, revenueCritical: true, where: "engine/src/jobs/monitor.ts", noTelemetry: true },
  { ...base, id: "engine:revenue-snapshot", kind: "engine_loop", label: "Revenue snapshot loop", purpose: "Daily revenue_snapshot", area: "intelligence", flag: "sys_revenue_intel", markers: ["revenue_snapshot"], cycleHours: 24, where: "engine/src/revenue/snapshot.ts" },
  { ...base, id: "kly:sender", kind: "kly_step", label: "Kly cold-email sender", purpose: "Sends sequenced cold email within governor caps", area: "acquire", flag: "outbound", noTelemetry: true, cycleHours: 24, revenueCritical: true, where: "kly/src/sender.ts" },
  { ...base, id: "kly:finder", kind: "kly_step", label: "Kly lead finder + verifier", purpose: "Discovers and verifies leads (adlib first)", area: "acquire", flag: "outbound", cycleHours: 24, where: "kly/src/loop.ts", noTelemetry: true },
  { ...base, id: "kly:inbound", kind: "kly_step", label: "Kly IMAP/bounce/unsub processing", purpose: "Replies, bounces, unsubscribes (runs even when sending is off)", area: "acquire", cycleHours: 1, idleOk: true, revenueCritical: true, where: "kly/src/loop.ts", noTelemetry: true },
  { ...base, id: "kly:governor", kind: "kly_step", label: "Kly governor", purpose: "Stops sending on complaints/bounces/no-reply", area: "risk", cycleHours: 1, idleOk: true, where: "kly/src/governor.ts", noTelemetry: true },
  { ...base, id: "cron:scoreboard-digest", kind: "cron", label: "Scoreboard digest (Mon 14:00 UTC)", purpose: "Weekly scoreboard email", area: "intelligence", markers: ["scoreboard_digest_sent"], cycleHours: 168, where: "/api/cron/scoreboard-digest" },
  { ...base, id: "cron:growth-review", kind: "cron", label: "Growth review (Mon 14:30)", purpose: "Weekly ecosystem review", area: "intelligence", flag: "growth_weekly_review", noTelemetry: true, cycleHours: 168, where: "/api/cron/growth-review" },
  { ...base, id: "cron:botd", kind: "cron", label: "Business of the day (15:00)", purpose: "Daily opt-in showcase pick", area: "acquire", flag: "sys_creative_publish", cycleHours: 24, idleOk: true, where: "/api/cron/botd", noTelemetry: true },
  { ...base, id: "cron:ads-lifecycle", kind: "cron", label: "Ads lifecycle cron", purpose: "Lifecycle triggers", area: "keep", cycleHours: 24, idleOk: true, where: "/api/cron/ads-lifecycle", noTelemetry: true },
  { ...base, id: "mm:scheduler", kind: "mm_hook", label: "Media Master social scheduler", purpose: "Desktop app posts/engages (runs only while the app runs; NOT in this repo's telemetry)", area: "acquire", cycleHours: 24, idleOk: true, where: "~/media-master (external)", noTelemetry: true },
];

export const CAPABILITIES: Capability[] = [...SYSTEM_CAPABILITIES, ...OTHER_CAPABILITIES];
