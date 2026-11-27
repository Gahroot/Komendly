import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isBillingConfigured } from "@/lib/ads/billing-stripe";
import { formatCents } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { recommendRefund } from "@/lib/ops/refund";
import { buildTickets, fixLink, groupByStatus, SUPPORT_TICKET_EVENT, type Ticket, type TicketStatus } from "@/lib/ops/support";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { PostActionButton } from "../_components/post-action-button";
import { RefundDialog } from "../_components/refund-dialog";

export const dynamic = "force-dynamic";

const DAYS = 14;
const o = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const s = (v: unknown) => (typeof v === "string" ? v : "");
const ts = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const TITLES: Record<TicketStatus, string> = { needs_owner: "Needs you", new: "New", waiting_customer: "Waiting on the customer", auto_resolved: "Auto-resolved", resolved: "Resolved" };

export default async function AdminAdsSupportPage() {
  return (
    <AdminAdsShell title="Support" description={`One inbox: customer replies, failed-job tickets and the auto-responder's outcomes (last ${DAYS} days, UTC). Refunds are only ever recommended here; you approve each one.`}>
      <Support />
    </AdminAdsShell>
  );
}

async function Support() {
  const now = new Date();
  const since = new Date(now.getTime() - DAYS * 86_400_000);
  const ev = (name: string, take = 300) => prisma.adsEvent.findMany({ where: { name, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take });
  const [replies, needs, autos, handled, jobEv, findings] = await Promise.all([ev("email_replied"), ev("email_needs_human"), ev("email_auto_replied"), ev("email_reply_handled"), ev(SUPPORT_TICKET_EVENT, 100), prisma.adsEvent.findMany({ where: { name: "customer_success_finding", createdAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 20 })]);
  const runIds = jobEv.map((e) => s(o(e.props).runId)).filter(Boolean);
  const runs = await prisma.adRun.findMany({ where: { id: { in: runIds } }, select: { id: true, status: true } });
  const okRun = new Set(runs.filter((r) => r.status === "completed" || r.status === "partial").map((r) => r.id));
  const tickets = buildTickets({
    replies: replies.map((e) => { const p = o(e.props); return { emailId: s(p.emailId) || e.id, at: e.createdAt, from: s(p.from), subject: s(p.subject), text: s(p.text), userId: e.userId, workspaceId: e.workspaceId }; }),
    needsHuman: needs.map((e) => { const p = o(e.props); return { emailId: s(p.emailId), at: e.createdAt, category: s(p.category), paying: p.paying === true, refundEligible: typeof p.refundEligible === "boolean" ? p.refundEligible : null }; }),
    autoReplied: autos.map((e) => { const p = o(e.props); return { emailId: s(p.emailId), at: e.createdAt, category: s(p.category) }; }),
    handled: handled.map((e) => ({ emailId: s(o(e.props).emailId), at: e.createdAt })),
    failedJobs: jobEv.map((e) => { const p = o(e.props); return { jobId: s(p.jobId), at: e.createdAt, type: s(p.type), cause: s(p.cause), userId: e.userId, workspaceId: e.workspaceId, resolved: okRun.has(s(p.runId)) }; }),
  }, now);
  const g = groupByStatus(tickets);
  const breached = tickets.filter((t) => t.source === "reply" && t.sla === "breached").length;
  const stripeEnabled = isBillingConfigured();
  const order: TicketStatus[] = ["needs_owner", "new", "waiting_customer", "auto_resolved"];
  const wsIds = [...new Set(g.needs_owner.map((t) => t.workspaceId).filter((x): x is string => Boolean(x)))];
  const wsRows = await prisma.adsWorkspace.findMany({ where: { id: { in: wsIds } }, select: { id: true, name: true, subscriptionStatus: true, stripeSubscriptionId: true } });
  const wsById = new Map(wsRows.map((w) => [w.id, w]));
  const recs = new Map<string, ReturnType<typeof recommendRefund>>();
  for (const t of g.needs_owner) {
    if (!t.workspaceId || !/refund|billing/.test(t.category ?? "")) continue;
    const [first, refunds, failed] = await Promise.all([
      prisma.adsEvent.findFirst({ where: { name: "paid_converted", workspaceId: t.workspaceId }, orderBy: { createdAt: "asc" }, select: { props: true, createdAt: true } }),
      prisma.adsRefund.count({ where: { workspaceId: t.workspaceId } }),
      prisma.adJob.count({ where: { workspaceId: t.workspaceId, status: "failed", createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } } }),
    ]);
    const amount = Number(o(first?.props).amountCents);
    recs.set(t.id, recommendRefund({ firstPaid: first && Number.isFinite(amount) ? { amountCents: amount, at: first.createdAt } : null, subscriptionLive: Boolean(wsById.get(t.workspaceId)?.stripeSubscriptionId), workspaceRefunds: refunds, failedJobs: failed, downloaded: false, now }));
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Needs you", g.needs_owner.length], ["New", g.new.length], ["Auto-resolved", g.auto_resolved.length], ["Past 15 min first-response SLA", breached]].map(([l, n]) => (
          <Card key={String(l)}><CardContent className="pt-6"><div className="text-2xl font-semibold tabular-nums">{n}</div><div className="text-sm text-muted-foreground">{l}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Recurring causes (customer-success agent, last 3 days)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {findings.length === 0 && <p className="text-muted-foreground">No findings yet (needs sys_success_agent on).</p>}
          {findings.map((f) => { const p = o(f.props); const l = fixLink(s(p.cause)); return (
            <div key={f.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={p.ourBug === true ? "destructive" : "secondary"}>{s(p.severity) || "n/a"}</Badge>
              <span className="font-medium">{s(p.label) || s(p.cause)}</span><span className="text-muted-foreground">x{String(p.count ?? "?")}: {s(p.suggestedFix)}</span>
              <Link className="underline" href={l.href}>Fix the cause: {l.label}</Link>
            </div>); })}
        </CardContent>
      </Card>

      {order.map((st) => (
        <Card key={st}>
          <CardHeader><CardTitle>{TITLES[st]} ({g[st].length})</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {g[st].length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
            {g[st].slice(0, 40).map((t) => <TicketRow key={t.id} t={t} rec={recs.get(t.id)} ws={t.workspaceId ? wsById.get(t.workspaceId) : undefined} stripeEnabled={stripeEnabled} />)}
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">KB answers the auto-responder can cite: docs/ops/support-kb.md. Resolved items: {g.resolved.length}.</p>
    </div>
  );
}

function TicketRow({ t, rec, ws, stripeEnabled }: { t: Ticket; rec?: ReturnType<typeof recommendRefund>; ws?: { id: string; name: string }; stripeEnabled: boolean }) {
  const emailId = t.id.startsWith("reply:") ? t.id.slice(6) : "";
  return (
    <div className="space-y-1 border-b pb-3 text-sm last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground tabular-nums">{ts(t.openedAt)}</span>
        {t.category && <Badge variant="secondary">{t.category}</Badge>}
        {t.paying && <Badge>paying</Badge>}
        {t.sla === "breached" && <Badge variant="destructive">SLA missed</Badge>}
        {t.ownerOverdue && <Badge variant="destructive">overdue</Badge>}
        <span className="font-medium">{t.subject}</span>
      </div>
      <p className="text-muted-foreground">{t.excerpt}</p>
      <div className="flex flex-wrap items-center gap-2">
        {emailId && t.status !== "resolved" && <PostActionButton url="/api/admin/ads/inbox" body={{ emailId }} label="Mark handled" />}
        {t.source === "failed_job" && <Link className="underline" href="/admin/ads/jobs">Open failed jobs</Link>}
        {rec && (
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={rec.verdict === "recommend_refund" ? "default" : "outline"}>{rec.verdict.replace(/_/g, " ")}{rec.amountCents ? ` (${formatCents(rec.amountCents)})` : ""}</Badge>
            <span className="text-muted-foreground">{rec.reasons.join(" ")}</span>
            {ws && rec.verdict !== "recommend_decline" && <RefundDialog workspaceId={ws.id} workspaceName={ws.name} stripeEnabled={stripeEnabled} />}
          </span>
        )}
      </div>
    </div>
  );
}
