// Unified support inbox (pure). Derived from AdsEvent rows, nothing new is stored except `support_ticket`
// (failed-job tickets written by the engine). Statuses: new | auto_resolved | waiting_customer | needs_owner | resolved.
export const FIRST_RESPONSE_MS = 15 * 60_000;
export const OWNER_DUE_MS = { paying: 4 * 3_600_000, other: 24 * 3_600_000 } as const;
export const SUPPORT_TICKET_EVENT = "support_ticket";

export type TicketStatus = "new" | "auto_resolved" | "waiting_customer" | "needs_owner" | "resolved";
export type TicketSource = "reply" | "failed_job";
export type SlaState = "met" | "pending" | "breached" | "n/a";

export interface ReplyIn { emailId: string; at: Date; from: string; subject: string; text: string; userId: string | null; workspaceId: string | null }
export interface NeedsHumanIn { emailId: string; at: Date; category: string; paying: boolean; refundEligible: boolean | null }
export interface AutoRepliedIn { emailId: string; at: Date; category: string }
export interface HandledIn { emailId: string; at: Date }
export interface FailedJobTicketIn { jobId: string; at: Date; type: string; cause: string; userId: string | null; workspaceId: string | null; resolved: boolean }
export interface SupportInput { replies: ReplyIn[]; needsHuman: NeedsHumanIn[]; autoReplied: AutoRepliedIn[]; handled: HandledIn[]; failedJobs: FailedJobTicketIn[] }

export interface Ticket {
  id: string; source: TicketSource; status: TicketStatus; openedAt: Date; category: string | null; subject: string; excerpt: string;
  userId: string | null; workspaceId: string | null; paying: boolean; refundEligible: boolean | null;
  firstResponseAt: Date | null; sla: SlaState; ownerDueAt: Date | null; ownerOverdue: boolean;
}

/** Categories the auto-responder fully answers: customer can stop here. */
const SELF_SERVE = new Set(["how_to", "interested", "objection"]);
/** Categories where the auto-reply is only an acknowledgement; we wait for the customer (or the owner). */
const ACK_ONLY = new Set(["support_problem", "billing"]);

export function slaState(openedAt: Date, firstResponseAt: Date | null, now: Date): SlaState {
  if (firstResponseAt) return firstResponseAt.getTime() - openedAt.getTime() <= FIRST_RESPONSE_MS ? "met" : "breached";
  return now.getTime() - openedAt.getTime() > FIRST_RESPONSE_MS ? "breached" : "pending";
}

export function buildTickets(input: SupportInput, now: Date): Ticket[] {
  const nh = new Map(input.needsHuman.map((x) => [x.emailId, x]));
  const ar = new Map(input.autoReplied.map((x) => [x.emailId, x]));
  const hd = new Set(input.handled.map((x) => x.emailId));
  const out: Ticket[] = [];
  for (const r of input.replies) {
    const h = nh.get(r.emailId), a = ar.get(r.emailId);
    const category = h?.category ?? a?.category ?? null;
    const paying = h?.paying ?? false;
    let status: TicketStatus = "new";
    if (hd.has(r.emailId)) status = "resolved";
    else if (h) status = "needs_owner";
    else if (a && SELF_SERVE.has(a.category)) status = "auto_resolved";
    else if (a && ACK_ONLY.has(a.category)) status = "waiting_customer";
    else if (a) status = "waiting_customer";
    const ownerOpen = status === "needs_owner";
    const ownerDueAt = ownerOpen ? new Date(r.at.getTime() + (paying ? OWNER_DUE_MS.paying : OWNER_DUE_MS.other)) : null;
    out.push({
      id: `reply:${r.emailId}`, source: "reply", status, openedAt: r.at, category, subject: r.subject.slice(0, 160), excerpt: r.text.replace(/\s+/g, " ").slice(0, 240),
      userId: r.userId, workspaceId: r.workspaceId, paying, refundEligible: h?.refundEligible ?? null,
      firstResponseAt: a?.at ?? null, sla: h && !a ? "n/a" : slaState(r.at, a?.at ?? null, now), ownerDueAt, ownerOverdue: Boolean(ownerDueAt && now > ownerDueAt),
    });
  }
  for (const j of input.failedJobs) {
    out.push({
      id: `job:${j.jobId}`, source: "failed_job", status: j.resolved ? "resolved" : "new", openedAt: j.at, category: "failed_job", subject: `${j.type} failed`, excerpt: j.cause.slice(0, 240),
      userId: j.userId, workspaceId: j.workspaceId, paying: false, refundEligible: null, firstResponseAt: null, sla: "n/a", ownerDueAt: null, ownerOverdue: false,
    });
  }
  return out.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
}

export function groupByStatus(tickets: Ticket[]): Record<TicketStatus, Ticket[]> {
  const g: Record<TicketStatus, Ticket[]> = { new: [], auto_resolved: [], waiting_customer: [], needs_owner: [], resolved: [] };
  for (const t of tickets) g[t.status].push(t);
  return g;
}

/** "Fix the cause" destination for a customer_success_finding cause key. */
export function fixLink(cause: string): { href: string; label: string } {
  switch (cause) {
    case "download_failed": case "pack_failed": return { href: "/admin/ads/jobs", label: "Failed jobs" };
    case "stuck_before_download": case "how_to": return { href: "/admin/ads/funnel", label: "Funnel" };
    case "login_problem": return { href: "/admin/ads/emails", label: "Email templates" };
    case "meta_connect": return { href: "/admin/ads/partners", label: "Partner setup" };
    case "refund": case "billing": return { href: "/admin/ads/refunds", label: "Refunds" };
    case "price_objection": case "no_results": return { href: "/admin/ads/revenue", label: "Revenue" };
    default: return { href: "/admin/ads/inbox", label: "Inbox" };
  }
}

export interface OpsHealthSignal { replies: number; unanswered: number; withOutcome: number; ownerOverdue: number }
/** unanswered = replies past the SLA with no recorded outcome. Unsubscribes/OOO also leave no outcome, so callers
 * only treat the auto-responder as down when several are unanswered AND none got any outcome (withOutcome = 0). */
export function supportHealth(tickets: Ticket[], now: Date): OpsHealthSignal {
  const replies = tickets.filter((t) => t.source === "reply");
  return {
    replies: replies.length,
    unanswered: replies.filter((t) => t.status === "new" && now.getTime() - t.openedAt.getTime() > FIRST_RESPONSE_MS).length,
    withOutcome: replies.filter((t) => t.status !== "new" && t.status !== "resolved").length,
    ownerOverdue: replies.filter((t) => t.ownerOverdue).length,
  };
}
