// Weekly owner brief: max 12 lines, plain English, only what changed + what needs a decision. Pure.
// COMBINED-DIGEST HOOK: when sys_revenue_digest and/or sys_optimizer_digest are also on, call `combinedPlan(flags)`.
// mode "combined" means: send ONE Monday email built by buildOwnerBrief (it embeds the revenue + optimiser lines) and let
// the revenue-digest cron / optimiser skip their own send. Neither cron adopts this yet (documented in docs/ops/operating-manual.md);
// until they do, the brief itself drops the sections the other digests already cover so the owner never reads the same fact twice.
import type { Finding } from "./status";

export interface BriefInput {
  weekLabel: string;
  adminUrl: string;
  business: { stage: string; payingCustomers: number; mrrCents: number | null; topConstraint: string | null } | null;
  previous: { payingCustomers: number; topConstraint: string | null } | null;
  findings: Finding[];
  /** Things the machine fixed on its own this week. */
  resolved: string[];
  /** Decisions only the owner can make (already de-duplicated by caller or here). */
  needsOwner: string[];
  optimizerLines: string[];
}
export interface DigestFlags { revenueDigest: boolean; optimizerDigest: boolean; opsDigest: boolean }

export function combinedPlan(f: DigestFlags): { mode: "combined" | "standalone" | "off"; skipOwnSend: Array<"revenue_digest" | "optimizer_digest"> } {
  if (!f.opsDigest) return { mode: "off", skipOwnSend: [] };
  const skip = [f.revenueDigest && "revenue_digest", f.optimizerDigest && "optimizer_digest"].filter(Boolean) as Array<"revenue_digest" | "optimizer_digest">;
  return { mode: skip.length ? "combined" : "standalone", skipOwnSend: skip };
}

const MAX_LINES = 12;
const money = (c: number | null) => (c === null ? "n/a" : `$${(c / 100).toFixed(0)}`);

export function buildOwnerBrief(i: BriefInput, flags: DigestFlags = { revenueDigest: false, optimizerDigest: false, opsDigest: true }): { subject: string; text: string; lines: string[]; hasContent: boolean } {
  const lines: string[] = [];
  const covered = combinedPlan(flags).mode === "combined";
  const b = i.business;
  if (b) {
    const changed = i.previous ? b.payingCustomers !== i.previous.payingCustomers || b.topConstraint !== i.previous.topConstraint : true;
    if (changed || !covered) lines.push(`Business: ${b.stage}; ${b.payingCustomers} paying customer${b.payingCustomers === 1 ? "" : "s"}, MRR ${money(b.mrrCents)}.${b.topConstraint ? ` The one thing to fix: ${b.topConstraint}.` : ""}`);
  }
  const high = i.findings.filter((f) => f.severity === "high");
  for (const f of high.slice(0, 3)) lines.push(`Problem: ${f.message}`);
  if (i.findings.length > high.length) lines.push(`${i.findings.length - high.length} smaller finding(s) on ${i.adminUrl}`);
  if (i.resolved.length) lines.push(`Fixed on its own: ${i.resolved.slice(0, 3).join("; ")}${i.resolved.length > 3 ? ` (+${i.resolved.length - 3} more)` : ""}.`);
  if (!covered) for (const l of i.optimizerLines.slice(0, 2)) lines.push(`Optimiser: ${l}`);
  const needs = [...new Set(i.needsOwner)];
  if (needs.length) { lines.push("Needs you:"); for (const n of needs.slice(0, 3)) lines.push(`- ${n}`); if (needs.length > 3) lines.push(`- (+${needs.length - 3} more on the ops page)`); }
  const body = lines.slice(0, MAX_LINES);
  const hasContent = body.length > 0 && (needs.length > 0 || high.length > 0 || i.resolved.length > 0 || Boolean(b));
  const text = [...(body.length ? body : ["Nothing changed and nothing needs you."]), "", `Details: ${i.adminUrl}`].join("\n");
  return { subject: `Owner brief ${i.weekLabel}${needs.length ? `: ${needs.length} decision${needs.length === 1 ? "" : "s"} for you` : ": nothing needs you"}`, text, lines: body, hasContent };
}
