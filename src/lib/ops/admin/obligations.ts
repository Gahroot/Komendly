// Obligations registry logic (docs/ops/obligations.json). Pure. No legal/tax advice: items that need a professional are
// flagged, never interpreted. Unknown dates stay null and surface as "needs your input".
export type Recurrence = "once" | "weekly" | "monthly" | "quarterly" | "annual";
export type Obligation = {
  id: string; title: string; category: string; owner: "owner" | "professional" | "system";
  recurrence: Recurrence; dueDate: string | null; lastDone: string | null; needsProfessional: boolean;
  trigger?: "revenue"; note?: string; dateApproximate?: boolean;
};
export type DueState = "done" | "overdue" | "due_soon" | "upcoming" | "unscheduled" | "waiting";
export type Evaluated = Obligation & { state: DueState; due: string | null; daysUntil: number | null };

const RECURRENCES = ["once", "weekly", "monthly", "quarterly", "annual"];
const DAY = 86_400_000;
export const DUE_SOON_DAYS = 30;

export function parseObligations(raw: unknown): Obligation[] {
  const items = (raw && typeof raw === "object" ? (raw as { items?: unknown }).items : null) as unknown;
  if (!Array.isArray(items)) return [];
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)) ? v.slice(0, 10) : null);
  return items.flatMap((i): Obligation[] => {
    if (!i || typeof i !== "object" || typeof i.id !== "string" || typeof i.title !== "string") return [];
    return [{
      id: i.id, title: i.title, category: String(i.category ?? "other"),
      owner: i.owner === "professional" || i.owner === "system" ? i.owner : "owner",
      recurrence: RECURRENCES.includes(i.recurrence) ? i.recurrence : "once",
      dueDate: date(i.dueDate), lastDone: date(i.lastDone), needsProfessional: i.needsProfessional === true,
      trigger: i.trigger === "revenue" ? "revenue" : undefined, note: typeof i.note === "string" ? i.note : undefined, dateApproximate: i.dateApproximate === true,
    }];
  });
}

export function addInterval(d: Date, r: Recurrence): Date | null {
  const x = new Date(d.getTime());
  if (r === "weekly") return new Date(d.getTime() + 7 * DAY);
  const months = r === "monthly" ? 1 : r === "quarterly" ? 3 : r === "annual" ? 12 : 0;
  if (!months) return null;
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

/** Next due date: a recurring item with lastDone is due one interval after it; otherwise the stated dueDate. */
export function nextDue(o: Obligation): Date | null {
  const last = o.lastDone ? new Date(o.lastDone) : null;
  if (o.recurrence !== "once" && last) return addInterval(last, o.recurrence);
  return o.dueDate ? new Date(o.dueDate) : null;
}

export function evaluate(o: Obligation, now: Date, ctx: { hasRevenue: boolean; overrides?: Record<string, string> } = { hasRevenue: false }): Evaluated {
  const ov = ctx.overrides?.[o.id];
  const eff = ov ? { ...o, dueDate: ov.slice(0, 10), lastDone: o.recurrence === "once" ? o.lastDone : null } : o;
  const base = { ...o, due: null as string | null, daysUntil: null as number | null };
  if (o.trigger === "revenue" && !ctx.hasRevenue) return { ...base, state: "waiting" };
  if (o.recurrence === "once" && o.lastDone && (!eff.dueDate || o.lastDone >= eff.dueDate)) return { ...base, state: "done" };
  const due = nextDue(eff);
  if (!due) return { ...base, state: "unscheduled" };
  const days = Math.ceil((due.getTime() - now.getTime()) / DAY);
  return { ...base, due: due.toISOString().slice(0, 10), daysUntil: days, state: days < 0 ? "overdue" : days <= DUE_SOON_DAYS ? "due_soon" : "upcoming" };
}

export function evaluateAll(list: readonly Obligation[], now: Date, ctx: { hasRevenue: boolean; overrides?: Record<string, string> }): Evaluated[] {
  const order: Record<DueState, number> = { overdue: 0, due_soon: 1, unscheduled: 2, upcoming: 3, waiting: 4, done: 5 };
  return list.map((o) => evaluate(o, now, ctx)).sort((a, b) => order[a.state] - order[b.state] || (a.daysUntil ?? 9e9) - (b.daysUntil ?? 9e9));
}

export const whoLabel = (o: Obligation) => (o.needsProfessional ? "needs a professional (accountant/lawyer)" : o.owner === "system" ? "automatic check" : "needs you");

/** Weekly digest section: ONLY what is overdue or due in the next 30 days. null = nothing, send nothing. */
export function digestSection(list: readonly Evaluated[]): { subject: string; text: string; count: number } | null {
  const due = list.filter((e) => e.state === "overdue" || e.state === "due_soon");
  if (!due.length) return null;
  const lines = due.map((e) => `- ${e.state === "overdue" ? "OVERDUE " : ""}${e.title}: ${e.due}${e.dateApproximate ? " (approx.)" : ""} (${e.state === "overdue" ? `${-(e.daysUntil ?? 0)}d late` : `in ${e.daysUntil}d`}), ${whoLabel(e)}`);
  return { subject: `Business admin: ${due.length} item${due.length === 1 ? "" : "s"} due in the next 30 days`, text: `Due in the next 30 days:\n${lines.join("\n")}\n\nItems marked "needs a professional" need an accountant or lawyer; this digest gives no legal or tax advice. Registry: docs/ops/obligations.json`, count: due.length };
}

export const needsInputCount = (list: readonly Evaluated[]) => list.filter((e) => e.state === "unscheduled").length;
