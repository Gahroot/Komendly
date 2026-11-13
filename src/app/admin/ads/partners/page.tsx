import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents, formatDate } from "@/lib/ads/billing-format";
import { effectiveStatus, summarizeCommissions } from "@/lib/ads/commissions";
import { workspaceLabels } from "@/lib/ads/growth-queries";
import { partnerStats } from "@/lib/ads/partner-admin";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { InputActionForm } from "../_components/input-action-form";
import { PostActionButton } from "../_components/post-action-button";
import { StatCard } from "../_components/stat-card";
import { AdminEmpty } from "../../_components/admin-empty";

export const dynamic = "force-dynamic";

const API = "/api/admin/ads/partners";

export default async function AdminPartnersPage() {
  const now = new Date();
  const [partners, commissions] = await Promise.all([
    prisma.adsPartner.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.adsCommission.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  const users = new Map((await prisma.user.findMany({ where: { id: { in: partners.map((p) => p.userId) } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u]));
  const clients = await workspaceLabels(commissions.map((c) => c.referredWorkspaceId));
  const applied = partners.filter((p) => p.status === "applied");
  const active = partners.filter((p) => p.status !== "applied");
  const stats = new Map(await Promise.all(active.filter((p) => p.status === "approved").map(async (p) => [p.id, await partnerStats(p)] as const)));
  const all = summarizeCommissions(commissions, now);
  const name = (p: (typeof partners)[number]) => p.company || users.get(p.userId)?.name || users.get(p.userId)?.email || p.id;
  const byId = new Map(partners.map((p) => [p.id, p]));

  return (
    <AdminAdsShell title="Partners" description="Applications, partners, commissions and manual payouts (PayPal/Wise, monthly, $50 minimum).">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Applications waiting" value={String(applied.length)} tone={applied.length ? "bad" : "default"} />
        <StatCard label="Pending" value={formatCents(all.pendingCents)} hint="in the 30-day refund window" />
        <StatCard label="Payable now" value={formatCents(all.payableCents)} tone={all.payableCents ? "good" : "default"} />
        <StatCard label="Paid out" value={formatCents(all.paidCents)} hint={`${formatCents(all.voidCents)} voided by refunds`} />
      </div>

      <Card>
        <CardHeader><CardTitle>Applications</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {applied.map((p) => {
            const u = users.get(p.userId);
            return (
              <div key={p.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto]">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{u?.name ?? u?.email} <span className="text-muted-foreground">· {u?.email}</span></p>
                  <p className="text-muted-foreground">{p.company ?? "—"} · {p.website ? <a className="underline" href={p.website} target="_blank" rel="noreferrer">{p.website}</a> : "no site"} · {p.role} · {p.clientCount ?? 0} clients · payout {p.payoutMethod} {p.payoutEmail}</p>
                  <p>&ldquo;{p.pitch}&rdquo;</p>
                  <p className="text-xs text-muted-foreground">Applied {formatDate(p.createdAt)}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <InputActionForm url={API} body={{ action: "approve", partnerId: p.id }} field="note" placeholder="Note (optional)" label="Approve" />
                  <InputActionForm url={API} body={{ action: "reject", partnerId: p.id }} field="note" placeholder="Reason (shown to them)" label="Reject" variant="outline" />
                </div>
              </div>
            );
          })}
          {applied.length === 0 && <AdminEmpty>No applications waiting. Ozzy will shout when one lands.</AdminEmpty>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Partners</CardTitle><a className="text-sm underline" href={`${API}/payables`}>Export payables CSV</a></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Partner</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Clicks</TableHead><TableHead className="text-right">Sign-ups</TableHead><TableHead className="text-right">Trials</TableHead><TableHead className="text-right">Paying</TableHead><TableHead className="text-right">Payable</TableHead><TableHead>Payout</TableHead></TableRow></TableHeader>
            <TableBody>
              {active.map((p) => {
                const s = stats.get(p.id);
                const sum = summarizeCommissions(commissions.filter((c) => c.partnerId === p.id), now);
                return (
                  <TableRow key={p.id}>
                    <TableCell>{name(p)}<div className="text-xs text-muted-foreground">{users.get(p.userId)?.email} · {p.payoutMethod} {p.payoutEmail}</div></TableCell>
                    <TableCell><Badge variant={p.status === "approved" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{s?.clicks ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s?.signups ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s?.trials ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s?.paying ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(sum.payableCents)}<div className="text-xs text-muted-foreground">{formatCents(sum.pendingCents)} pending</div></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {sum.payableCents > 0 && <InputActionForm url={API} body={{ action: "mark_paid", partnerId: p.id }} field="payoutRef" placeholder="Payout ref" label="Mark paid" required />}
                        {p.status === "approved" && <PostActionButton url={API} body={{ action: "pause", partnerId: p.id }} label="Pause" confirm={{ title: `Pause ${name(p)}?`, description: "Their link stops earning commission on new payments." }} />}
                        {p.status !== "approved" && <PostActionButton url={API} body={{ action: "approve", partnerId: p.id }} label="Approve" />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {active.length === 0 && <TableRow><TableCell colSpan={8}><AdminEmpty>No partners yet.</AdminEmpty></TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Commissions</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Partner</TableHead><TableHead>Client</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Commission</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {commissions.slice(0, 100).map((c) => {
                const st = effectiveStatus(c, now);
                const p = byId.get(c.partnerId);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                    <TableCell>{p ? name(p) : c.partnerId}</TableCell>
                    <TableCell>{clients.get(c.referredWorkspaceId)?.name ?? c.referredWorkspaceId}</TableCell>
                    <TableCell className="font-mono text-xs">{c.stripeInvoiceId}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(c.amountCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(c.commissionCents)}</TableCell>
                    <TableCell>
                      <Badge variant={st === "void" ? "destructive" : st === "paid" ? "default" : "secondary"}>{st}</Badge>
                      <div className="text-xs text-muted-foreground">{st === "pending" ? `payable ${formatDate(c.availableAt)}` : st === "paid" ? `${formatDate(c.paidAt)} · ${c.payoutRef ?? ""}` : st === "void" ? c.voidReason : ""}</div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {commissions.length === 0 && <TableRow><TableCell colSpan={7}><AdminEmpty>No commissions yet.</AdminEmpty></TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminAdsShell>
  );
}
