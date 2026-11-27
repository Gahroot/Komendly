// Customer outcome verification (pure). Measurable tiers, a per-customer timeline, a health state and preventable-failure
// detection. Only facts that exist as rows are used; nothing is inferred or estimated. Thin data reads "too early to tell".

export const OUTCOME_FAILURE_EVENT = "outcome_failure";
export const OUTCOME_ALERT_TO = "nolan@prestyj.com";
const DAY = 86_400_000;
export const SPEND_NO_LEADS_MINOR = 5000; // 50.00 in the ad account's currency, and 7+ days of delivery
export const REJECTED_STATUSES = ["DISAPPROVED", "REJECTED", "WITH_ISSUES"];

export const TIERS = [
  { key: "pack_finished", label: "Pack finished" },
  { key: "opened", label: "Opened" },
  { key: "downloaded", label: "Downloaded" },
  { key: "unlocked", label: "Unlocked" },
  { key: "published", label: "Ads published" },
  { key: "first_impression", label: "First impression" },
  { key: "first_click", label: "First click" },
  { key: "first_lead", label: "First lead" },
  { key: "lead_contacted", label: "Lead contacted" },
  { key: "week2_performing", label: "Week-2 performing" },
] as const;
export type TierKey = (typeof TIERS)[number]["key"];
export type TierState = "reached" | "not_yet" | "not_tracked";
export interface TierStatus { key: TierKey; label: string; state: TierState; at: string | null; detail: string }

export interface OutcomeInput {
  now: Date;
  runs: Array<{ id: string; status: string; isTrial: boolean; createdAt: Date; completedAt: Date | null; error: string | null; ready: number }>;
  events: Array<{ name: string; createdAt: Date; props: Record<string, unknown> }>;
  publishes: Array<{ id: string; status: string; createdAt: Date; error: string | null }>;
  perf: Array<{ day: string; impressions: number; clicks: number; leads: number; spendMinor: number; status: string | null }>;
  leads: Array<{ receivedAt: Date }>;
}
export type Health = "on_track" | "at_risk" | "failed" | "unknown";
export interface Failure { code: string; severity: "high" | "medium"; reason: string; ref: string; since: string }
export interface Outcome { tiers: TierStatus[]; health: Health; reasons: string[]; failures: Failure[]; tooEarly: boolean }

const earliest = (ds: Array<Date | string | null | undefined>): Date | null => {
  const t = ds.filter(Boolean).map((d) => new Date(d as string | Date).getTime()).filter((n) => !Number.isNaN(n));
  return t.length ? new Date(Math.min(...t)) : null;
};
const dayStart = (day: string) => new Date(`${day}T00:00:00Z`);

export function evaluateOutcome(i: OutcomeInput): Outcome {
  const ev = (names: string[], pred?: (p: Record<string, unknown>) => boolean) => earliest(i.events.filter((e) => names.includes(e.name) && (!pred || pred(e.props))).map((e) => e.createdAt));
  const doneRuns = i.runs.filter((r) => (r.status === "completed" || r.status === "partial") && r.completedAt);
  const finished = earliest(doneRuns.map((r) => r.completedAt));
  const livePerf = i.perf.filter((p) => p.impressions > 0).sort((a, b) => a.day.localeCompare(b.day));
  const published = earliest([...i.publishes.filter((p) => p.status === "published").map((p) => p.createdAt), ...i.events.filter((e) => e.name === "meta_published" || e.name === "meta_activated").map((e) => e.createdAt)]);
  const firstImp = livePerf[0] ? dayStart(livePerf[0].day) : null;
  const firstClick = earliest(i.perf.filter((p) => p.clicks > 0).map((p) => dayStart(p.day)));
  const firstLead = earliest([...i.leads.map((l) => l.receivedAt), ...i.perf.filter((p) => p.leads > 0).map((p) => dayStart(p.day))]);
  const contacted = ev(["lead_contacted"]);
  let week2: Date | null = null;
  if (firstImp) {
    const lo = firstImp.getTime() + 7 * DAY, hi = firstImp.getTime() + 14 * DAY;
    const w = i.perf.filter((p) => { const t = dayStart(p.day).getTime(); return t >= lo && t < hi && p.impressions > 0; });
    const wl = w.reduce((s, p) => s + p.leads, 0);
    if (w.length && wl > 0 && i.now.getTime() >= hi) week2 = dayStart(w[0]!.day);
  }
  const t = (key: TierKey, at: Date | null, detail: string, tracked = true): TierStatus => ({ key, label: TIERS.find((x) => x.key === key)!.label, state: at ? "reached" : tracked ? "not_yet" : "not_tracked", at: at?.toISOString() ?? null, detail });
  const tiers: TierStatus[] = [
    t("pack_finished", finished, finished ? `${doneRuns.length} pack(s) finished` : "No finished pack"),
    t("opened", ev(["launch_guide_opened", "pack_opened"]), "Launch guide / pack opened"),
    t("downloaded", ev(["export_downloaded", "ad_downloaded"]), "Ads downloaded"),
    t("unlocked", ev(["purchased"], (p) => p.key === "unlock_pack") ?? ev(["paid_converted"]), "Pack unlocked (paid)"),
    t("published", published, "Published to Meta"),
    t("first_impression", firstImp, "Meta reported delivery"),
    t("first_click", firstClick, "Meta reported a click"),
    t("first_lead", firstLead, "Lead form received (Meta-reported or webhook)"),
    t("lead_contacted", contacted, contacted ? "Customer marked a lead contacted" : "Not tracked yet: no event records a customer contacting a lead", Boolean(contacted)),
    t("week2_performing", week2, "Leads arriving in days 8-14 of delivery"),
  ];

  const failures: Failure[] = [];
  const nowT = i.now.getTime();
  const latestRun = [...i.runs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const failedRuns = i.runs.filter((r) => r.status === "failed");
  for (const r of failedRuns) if (!doneRuns.some((d) => d.completedAt! > r.createdAt)) failures.push({ code: "pack_failed", severity: "high", reason: `Pack failed${r.error ? `: ${r.error.slice(0, 160)}` : ""}`, ref: r.id, since: r.createdAt.toISOString() });
  for (const r of i.runs.filter((x) => x.status === "partial")) failures.push({ code: "pack_partial", severity: "medium", reason: `Pack finished with only ${r.ready} ad(s) ready`, ref: r.id, since: (r.completedAt ?? r.createdAt).toISOString() });
  const okPub = i.publishes.filter((p) => p.status === "published");
  for (const p of i.publishes.filter((x) => x.status === "failed")) if (!okPub.some((o) => o.createdAt > p.createdAt)) failures.push({ code: "publish_failed", severity: "high", reason: `Publish to Meta failed${p.error ? `: ${p.error.slice(0, 160)}` : ""}`, ref: p.id, since: p.createdAt.toISOString() });
  const rejected = [...i.perf].reverse().find((p) => p.status && REJECTED_STATUSES.includes(p.status.toUpperCase()));
  if (rejected && !i.perf.some((p) => p.day > rejected.day && p.impressions > 0 && !REJECTED_STATUSES.includes((p.status ?? "").toUpperCase()))) failures.push({ code: "meta_rejected", severity: "high", reason: `Meta status ${rejected.status} on ${rejected.day}`, ref: rejected.day, since: dayStart(rejected.day).toISOString() });
  if (published && !firstImp && nowT - published.getTime() >= 3 * DAY && !rejected) failures.push({ code: "zero_delivery_3d", severity: "high", reason: "Published 3+ days ago and Meta has reported no impressions", ref: published.toISOString().slice(0, 10), since: published.toISOString() });
  const spend = i.perf.reduce((s, p) => s + p.spendMinor, 0);
  if (firstImp && nowT - firstImp.getTime() >= 7 * DAY && spend >= SPEND_NO_LEADS_MINOR && !firstLead) failures.push({ code: "spend_no_leads", severity: "medium", reason: `Spend of ${(spend / 100).toFixed(2)} over 7+ days of delivery with no lead recorded`, ref: firstImp.toISOString().slice(0, 10), since: firstImp.toISOString() });

  const reasons: string[] = failures.map((f) => f.reason);
  let health: Health, tooEarly = false;
  const highFail = failures.some((f) => f.severity === "high");
  if (!finished && !latestRun) { health = "unknown"; reasons.push("No pack yet."); }
  else if (highFail) health = "failed";
  else if (failures.length) health = "at_risk";
  else if (firstImp) { health = "on_track"; reasons.push(firstLead ? "Delivering and leads recorded." : "Delivering; no lead recorded yet, too early to tell."); if (!firstLead) tooEarly = true; }
  else if (finished && !tiers[1]!.at && !tiers[2]!.at && nowT - finished.getTime() >= 3 * DAY) { health = "at_risk"; reasons.push("Pack finished 3+ days ago and was never opened or downloaded (an observation, not a failure)."); }
  else if (finished && nowT - finished.getTime() < 3 * DAY) { health = "unknown"; tooEarly = true; reasons.push("Pack finished under 3 days ago: too early to tell."); }
  else if (published) { health = "unknown"; tooEarly = true; reasons.push("Published recently; waiting for first delivery."); }
  else if (tiers[1]!.at || tiers[2]!.at) { health = "on_track"; reasons.push("Customer engaged with the pack; not published yet."); }
  else { health = "unknown"; tooEarly = true; reasons.push("Not enough activity to tell."); }
  return { tiers, health, reasons, failures, tooEarly };
}

export const failureDedupeKey = (workspaceId: string, f: Pick<Failure, "code" | "ref">) => `${workspaceId}:${f.code}:${f.ref}`;

export interface AlertItem { workspaceId: string; workspaceName: string; email: string | null; failure: Failure }
/** Plain-text digest email to the owner (new failures only; dedupe happens before this). */
export function alertEmail(items: AlertItem[], baseUrl: string): { subject: string; text: string } {
  const lines = items.map((a) => `- ${a.workspaceName}${a.email ? ` (${a.email})` : ""}: [${a.failure.code}] ${a.failure.reason}`);
  return {
    subject: `Customer outcome alert: ${items.length} preventable failure${items.length === 1 ? "" : "s"}`,
    text: `These customers hit a failure we may be able to fix before they notice:\n\n${lines.join("\n")}\n\nTimelines: ${baseUrl.replace(/\/$/, "")}/admin/ads/outcomes\n\nThis is a fact-based alert from rows in the database; it is sent once per failure.`,
  };
}
