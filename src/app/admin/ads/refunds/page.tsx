import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isBillingConfigured } from "@/lib/ads/billing-stripe";
import { formatCents, formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { RefundDialog } from "../_components/refund-dialog";
import { AdminEmpty } from "../../_components/admin-empty";

export const dynamic = "force-dynamic";

export default async function AdminAdsRefundsPage() {
  return (
    <AdminAdsShell title="Refunds" description="Issue refunds (Stripe and/or credit-only). Every refund claws back credits through the ledger.">
      <Refunds />
    </AdminAdsShell>
  );
}

async function Refunds() {
  const [refunds, paying] = await Promise.all([
    prisma.adsRefund.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { workspace: { select: { name: true } } } }),
    prisma.adsWorkspace.findMany({
      where: { OR: [{ stripeCustomerId: { not: null } }, { adsPlan: { not: "trial" } }] },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, name: true, adsPlan: true, subscriptionStatus: true, creditBalance: true },
    }),
  ]);
  const actorIds = [...new Set(refunds.map((r) => r.actorId))].sort();
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  const stripeEnabled = isBillingConfigured();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Issue a refund</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Workspace</TableHead><TableHead>Plan</TableHead><TableHead className="text-right">Credits</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {paying.map((w) => (
                <TableRow key={w.id}>
                  <TableCell><Link className="hover:underline" href={`/admin/ads/workspaces/${w.id}`}>{w.name}</Link></TableCell>
                  <TableCell className="text-muted-foreground">{w.adsPlan} · {w.subscriptionStatus}</TableCell>
                  <TableCell className="text-right tabular-nums">{w.creditBalance}</TableCell>
                  <TableCell className="text-right"><RefundDialog workspaceId={w.id} workspaceName={w.name} stripeEnabled={stripeEnabled} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Refund history</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>When</TableHead><TableHead>Workspace</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Credits</TableHead><TableHead>By</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {refunds.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                  <TableCell>{r.workspace.name}<div className="text-xs text-muted-foreground">{r.reason ?? ""}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{r.amountCents ? formatCents(r.amountCents) : "credit-only"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.credits}</TableCell>
                  <TableCell className="text-muted-foreground">{actors.get(r.actorId) ?? r.actorId}</TableCell>
                </TableRow>
              ))}
              {refunds.length === 0 && <TableRow><TableCell colSpan={5}><AdminEmpty>No refunds yet. Nice.</AdminEmpty></TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
