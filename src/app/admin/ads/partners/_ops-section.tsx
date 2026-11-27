import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/ads/billing-format";
import { systemEnabled } from "@/lib/growth/systems";
import { PARTNER_OPS_TERMS } from "@/lib/ops/partners/commission";
import { loadPartnerOps } from "@/lib/ops/partners/load";
import { prisma } from "@/lib/prisma";

/** Partner operations (flag sys_partner_ops): monthly statements, pending payouts, health. Read-only; payouts are marked with the existing "mark paid" action above. */
export async function PartnerOpsSection() {
  if (!(await systemEnabled(prisma, "partner_ops"))) return null;
  const ops = await loadPartnerOps(prisma, new Date());
  return (
    <Card>
      <CardHeader><CardTitle>Statements for {ops.month} · pending payouts {formatCents(ops.pendingPayoutCents)}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Conservative ops terms: {PARTNER_OPS_TERMS.commissionPct}% for {PARTNER_OPS_TERMS.commissionMonths} months on cleared, non-refunded payments (no test/internal/self-referral). The owner approves every payout and pays it manually (PayPal/Wise); nothing is sent automatically. A &quot;terms differ&quot; flag means the live program rate differs, reconcile before paying.</p>
        <Table>
          <TableHeader><TableRow><TableHead>Partner</TableHead><TableHead>Health</TableHead><TableHead className="text-right">Signups</TableHead><TableHead className="text-right">Paying</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Clawed back</TableHead><TableHead className="text-right">Payable</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {ops.rows.map((r) => (
              <TableRow key={r.statement.partnerId}>
                <TableCell>{r.input.name}</TableCell>
                <TableCell><Badge variant="outline">{r.health.replace("_", " ")}</Badge></TableCell>
                <TableCell className="text-right">{r.statement.referredSignups}</TableCell>
                <TableCell className="text-right">{r.statement.payingCustomers}</TableCell>
                <TableCell className="text-right">{formatCents(r.statement.grossCents)}</TableCell>
                <TableCell className="text-right">{formatCents(r.statement.refundsClawedBackCents)}</TableCell>
                <TableCell className="text-right">{formatCents(r.statement.payableCents)}</TableCell>
                <TableCell>{r.statement.status.replace(/_/g, " ")}{r.statement.reconciliation.differs ? <Badge variant="destructive" className="ml-2">terms differ</Badge> : null}</TableCell>
              </TableRow>
            ))}
            {!ops.rows.length && <TableRow><TableCell colSpan={8}>No approved partners yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
