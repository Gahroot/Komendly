// Plain-English owner text built from a RevenueSnapshot: the Monday digest and the "what happens next" list. Pure.
import type { RevenueSnapshot } from "./snapshot";

export const REVENUE_DIGEST_FLAG = "sys_revenue_digest";
export const REVENUE_DIGEST_EVENT = "revenue_digest_sent";
const usd = (c: number | null) => (c === null ? "n/a" : `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`);
const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

export type ExperimentLine = { key: string; status: "running" | "concluded"; verdict: string; leader?: string; exposures: number; note?: string };
export type OwnerNeed = { id: string; name: string; owner_action: string };

/** What the system will do next, from real state (never promises results). */
export function nextActions(s: RevenueSnapshot, flags: { intel: boolean; digest: boolean }, running: number): string[] {
  const top = s.constraints[0];
  const out: string[] = [];
  if (!flags.intel) out.push("Daily snapshots are OFF (flag sys_revenue_intel): this page is computed live and has no history until you turn it on.");
  if (top) out.push(`Focus on one constraint only: ${top.label}. ${top.action}`);
  out.push(running ? `Keep ${running} experiment${running === 1 ? "" : "s"} running until each variant has its minimum sample; no winner is called earlier.` : "No experiment is running: the next one should target the constraint above.");
  if (s.economics.costs.metaCents === 0) out.push("Ad spend is not being recorded (no ad_spend events), so CAC ignores Meta spend until a job writes it.");
  if (s.stage.index <= 1) out.push("Hold: no scaling of spend, no new products, no price changes until there is a repeatable first-month profit.");
  return out;
}

export function buildRevenueDigest(s: RevenueSnapshot, experiments: ExperimentLine[], needs: OwnerNeed[], adminUrl: string): { subject: string; text: string } {
  const e = s.economics, top = s.constraints[0];
  const lines = [
    `Stage: ${s.stage.label} (${s.stage.roadmap}).`,
    `Money: ${e.payingCustomers} paying customer${e.payingCustomers === 1 ? "" : "s"}, ${usd(e.revenue.allTimeCents)} lifetime, MRR ${usd(e.mrrCents.cents)}.`,
    `Funnel (last ${e.windowDays} days): ${e.funnel.visitors} visits, ${e.funnel.signups} sign-ups, ${e.funnel.activated} finished a pack, ${e.funnel.firstPurchases} bought. Sample sizes are small, treat rates as rough.`,
    top ? `#1 constraint: ${top.label} (${top.confidence}). ${top.evidence}` : "No constraint can be ranked yet.",
    `Unit economics: CAC ${usd(e.cacCents.cents)} (${e.cacCents.confidence}); 30-day payback ${e.payback30.ratio ?? "n/a"} (${e.payback30.confidence}); LTGP:CAC ${e.ltgpToCac.ratio ?? "n/a"} (${e.ltgpToCac.confidence}).`,
    "",
    "Experiments:",
    ...(experiments.length ? experiments.map((x) => `- ${x.key}: ${x.status}, ${x.verdict}${x.leader ? `, leading ${x.leader}` : ""}, ${x.exposures} exposures`) : ["- none running"]),
    "",
    "Needs you:",
    ...(needs.length ? needs.slice(0, 5).map((n) => `- ${n.name}: ${n.owner_action}`) : ["- nothing"]),
    "",
    `Details: ${adminUrl}`,
  ];
  return { subject: `Revenue check: ${s.stage.code}, ${e.payingCustomers} paying, #1 fix ${top?.key ?? "none"}`, text: lines.join("\n") };
}
export { pct };
