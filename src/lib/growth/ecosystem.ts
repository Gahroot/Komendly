// Pure logic for the growth ecosystem (docs/growth-ecosystem): registry summaries, the weekly course-change rules,
// the owner report text and the learnings-log entry format. No I/O: the cron route and the admin page load the data.

export const OPPORTUNITY_STATUSES = ["operational", "experimenting", "awaiting_prerequisite", "suspended", "unviable"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  operational: "Operational",
  experimenting: "Experimenting",
  awaiting_prerequisite: "Awaiting prerequisite",
  suspended: "Suspended",
  unviable: "Unviable",
};

export interface Opportunity {
  id: number;
  category: string;
  name: string;
  outcome: string;
  relevance: string;
  status: OpportunityStatus;
  readiness: string;
  evidence: string;
  prerequisites: string;
  costs: string;
  contribution: string;
  owner_action: string;
  code_refs: string[];
  flag?: string;
}

/** Problems with a registry (empty = valid). The 100 original opportunities must all be present, ids unique. */
export function validateRegistry(reg: readonly Opportunity[]): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const o of reg) {
    if (seen.has(o.id)) problems.push(`duplicate id ${o.id}`);
    seen.add(o.id);
    if (!OPPORTUNITY_STATUSES.includes(o.status)) problems.push(`#${o.id} bad status "${o.status}"`);
    for (const k of ["category", "name", "outcome", "relevance", "readiness", "evidence", "prerequisites", "costs", "contribution"] as const) {
      if (typeof o[k] !== "string" || !o[k].trim()) problems.push(`#${o.id} missing ${k}`);
    }
    if (typeof o.owner_action !== "string") problems.push(`#${o.id} owner_action must be a string (may be empty)`);
    if (!Array.isArray(o.code_refs)) problems.push(`#${o.id} code_refs must be an array`);
  }
  for (let i = 1; i <= 100; i++) if (!seen.has(i)) problems.push(`missing #${i}`);
  return problems;
}

export type StatusCounts = Record<OpportunityStatus, number> & { total: number };
const emptyCounts = (): StatusCounts => ({ operational: 0, experimenting: 0, awaiting_prerequisite: 0, suspended: 0, unviable: 0, total: 0 });

export function summarizeRegistry(reg: readonly Opportunity[]): { overall: StatusCounts; byCategory: { category: string; counts: StatusCounts }[] } {
  const overall = emptyCounts();
  const cats = new Map<string, StatusCounts>();
  for (const o of reg) {
    const c = cats.get(o.category) ?? cats.set(o.category, emptyCounts()).get(o.category)!;
    c[o.status]++; c.total++;
    overall[o.status]++; overall.total++;
  }
  return { overall, byCategory: [...cats].map(([category, counts]) => ({ category, counts })) };
}

export function needsYou(reg: readonly Opportunity[]): Opportunity[] {
  return reg.filter((o) => o.owner_action.trim() && o.status !== "unviable");
}

// ---- course-change rules (autopilot plan section 7) ----

export const SUSPEND_AFTER_ACTIONS = 500;

export interface SourceStats {
  /** First-touch utm_source (a growth system's utmSource, "kly", "meta"...). */
  source: string;
  label: string;
  /** Outputs of the channel (emails sent, pins posted, gifts made...). null = not counted. */
  actions: number | null;
  signups: number;
  payments: number;
  /** AdsFeatureFlag key that switches the channel off, when there is one the review may flip. */
  flag?: string;
  /** Is that flag currently ON? */
  flagOn?: boolean;
}

export type CourseAction = "turn_up" | "suspend" | "fix_offer" | "keep" | "no_data";
export interface CourseDecision { source: string; label: string; action: CourseAction; reason: string; /** flag to switch OFF automatically (suspend only). */ switchOff?: string }

/** One channel. Payments win: a channel that earns money is turned up. 500+ actions and no sign-ups: suspend. */
export function decideChannel(s: SourceStats): CourseDecision {
  const base = { source: s.source, label: s.label };
  if (s.payments > 0) return { ...base, action: "turn_up", reason: `${s.payments} payment${s.payments === 1 ? "" : "s"} from ${s.signups} sign-up${s.signups === 1 ? "" : "s"}: give it more volume.` };
  if (s.actions !== null && s.actions >= SUSPEND_AFTER_ACTIONS && s.signups === 0) {
    return { ...base, action: "suspend", reason: `${s.actions} actions and no sign-ups (rule: ${SUSPEND_AFTER_ACTIONS}). ${s.flag && s.flagOn ? "Switched off by the review" : s.flag ? "Already off" : "Recommend switching it off"}; rewrite or drop.`, switchOff: s.flag && s.flagOn ? s.flag : undefined };
  }
  if (s.actions !== null && s.actions >= SUSPEND_AFTER_ACTIONS && s.signups > 0) return { ...base, action: "fix_offer", reason: `${s.signups} sign-ups after ${s.actions} actions and no payment: look at the offer, not more volume.` };
  if (s.actions === 0 || (s.actions === null && s.signups === 0)) return { ...base, action: "no_data", reason: "Nothing recorded yet." };
  return { ...base, action: "keep", reason: `${s.actions ?? "?"} actions, ${s.signups} sign-ups, ${s.payments} payments: keep going, not enough evidence yet.` };
}

export function decideCourse(rows: readonly SourceStats[]): CourseDecision[] {
  return rows.map(decideChannel);
}

export interface EcosystemFacts {
  decisions: CourseDecision[];
  overall: StatusCounts;
  needs: Pick<Opportunity, "id" | "name" | "owner_action">[];
  payingCustomers: number;
  signups7d: number;
  now: Date;
}

/** Short plain-English owner report. Facts only; nothing here promises leads or sales. */
export function buildWeeklyReport(f: EcosystemFacts, adminUrl: string): { subject: string; text: string } {
  const act = f.decisions.filter((d) => d.action === "turn_up" || d.action === "suspend" || d.action === "fix_offer");
  const lines: string[] = [
    `Komendly growth ecosystem, week of ${f.now.toISOString().slice(0, 10)}.`,
    `Paying customers: ${f.payingCustomers} of 10. New sign-ups in the last 7 days: ${f.signups7d}.`,
    `Opportunities tracked: ${f.overall.total}. Operational ${f.overall.operational}, experimenting ${f.overall.experimenting}, waiting on something ${f.overall.awaiting_prerequisite}, suspended ${f.overall.suspended}.`,
    "",
    act.length ? "WHAT CHANGED OR SHOULD CHANGE" : "No course-change rule triggered this week.",
    ...act.map((d) => `- ${d.label}: ${d.reason}`),
    "",
    f.needs.length ? `NEEDS YOU (${f.needs.length})` : "Nothing needs you this week.",
    ...f.needs.slice(0, 8).map((n) => `- #${n.id} ${n.name}: ${n.owner_action}`),
    ...(f.needs.length > 8 ? [`- and ${f.needs.length - 8} more on the command center.`] : []),
    "",
    `Command center: ${adminUrl}`,
  ];
  return { subject: `Growth ecosystem: ${f.payingCustomers}/10 paying${act.length ? `, ${act.length} to act on` : ""}`, text: lines.join("\n") };
}

// ---- learnings log (docs/growth-ecosystem/learnings.md, append-only) ----

export interface LearningEntry {
  date: string; // YYYY-MM-DD
  kind: "evidence" | "assumption";
  title: string;
  note: string;
  /** Where the evidence comes from (file, scoreboard week, URL). Required for evidence, optional for assumptions. */
  source?: string;
  opportunityIds?: number[];
}

export function formatLearning(e: LearningEntry): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error("date must be YYYY-MM-DD");
  if (!e.title.trim() || !e.note.trim()) throw new Error("title and note are required");
  if (e.kind === "evidence" && !e.source?.trim()) throw new Error("evidence needs a source");
  const ids = e.opportunityIds?.length ? ` (#${e.opportunityIds.join(", #")})` : "";
  const one = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
  return [`## ${e.date} [${e.kind.toUpperCase()}] ${one(e.title)}${ids}`, "", one(e.note), ...(e.source?.trim() ? ["", `Source: ${one(e.source)}`] : []), ""].join("\n");
}

/** Append-only: the existing text is always kept as a prefix. */
export function appendLearning(existing: string, e: LearningEntry): string {
  const base = existing.endsWith("\n") || existing === "" ? existing : existing + "\n";
  return `${base}${base.trim() ? "\n" : ""}${formatLearning(e)}`;
}

export interface ParsedLearning { date: string; kind: "EVIDENCE" | "ASSUMPTION"; title: string; body: string }
export function parseLearnings(md: string): ParsedLearning[] {
  const out: ParsedLearning[] = [];
  for (const block of md.split(/^## /m).slice(1)) {
    const [head, ...rest] = block.split("\n");
    const m = head.match(/^(\d{4}-\d{2}-\d{2}) \[(EVIDENCE|ASSUMPTION)\] (.*)$/);
    if (m) out.push({ date: m[1], kind: m[2] as ParsedLearning["kind"], title: m[3], body: rest.join("\n").trim() });
  }
  return out;
}

// ---- sign-ups and payments by first-touch source ----

export interface SourceSignup { workspaceId: string; utmSource?: string | null; referrerHost?: string | null; klyLead?: boolean; referral?: boolean }

/** Source key of one sign-up: DB links first (Kly lead, referral), then utm_source, then the referring host, else "direct". */
export function sourceKey(s: SourceSignup): string {
  if (s.klyLead) return "kly";
  if (s.referral) return "referral";
  const u = s.utmSource?.toLowerCase().trim();
  if (u) return u;
  const h = s.referrerHost?.toLowerCase().replace(/^www\./, "").trim();
  return h ? `ref:${h}` : "direct";
}

export function countBySource(signups: readonly SourceSignup[], payerWorkspaceIds: ReadonlySet<string>): Map<string, { signups: number; payments: number }> {
  const m = new Map<string, { signups: number; payments: number }>();
  for (const s of signups) {
    const k = sourceKey(s);
    const row = m.get(k) ?? m.set(k, { signups: 0, payments: 0 }).get(k)!;
    row.signups++;
    if (payerWorkspaceIds.has(s.workspaceId)) row.payments++;
  }
  return m;
}

export const GROWTH_REVIEW_FLAG = "growth_weekly_review";
export const GROWTH_REVIEW_EVENT = "growth_review_sent";
