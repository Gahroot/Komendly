import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BREACH_TEXT, money, RESULTS_EMPTY } from "@/lib/growth/proof";
import { loadConsentedForAdmin, loadGuaranteeBreaches } from "@/lib/growth/proof-server";

/** Live-in-7-days breaches (surface only, never auto-refund) + consented case studies. */
export async function ProofCard() {
  const [breaches, studies] = await Promise.all([loadGuaranteeBreaches().catch(() => []), loadConsentedForAdmin().catch(() => [])]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Live-in-7-days breaches</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {breaches.length === 0 ? <p className="text-sm text-muted-foreground">None: every paying team customer past day 7 has live ads.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Where it stands</TableHead><TableHead className="text-right">Days late</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {breaches.map((b) => (
                  <TableRow key={b.workspaceId}>
                    <TableCell className="font-medium">{b.name}<span className="block text-xs text-muted-foreground">{b.ownerEmail}</span></TableCell>
                    <TableCell>{BREACH_TEXT[b.breach.cause]}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.breach.daysLate}</TableCell>
                    <TableCell>{b.refunded ? "refund on record" : b.alerted ? "Nolan emailed" : "not yet emailed"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Refunds are never automatic: issue them in Stripe / Refunds if due.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Consented case studies</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {studies.length === 0 ? <p className="text-sm text-muted-foreground">{RESULTS_EMPTY.replace("Our first", "No")}. Public page: /results.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Business</TableHead><TableHead>Window</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Leads</TableHead><TableHead>Public</TableHead></TableRow></TableHeader>
              <TableBody>
                {studies.map((s) => (
                  <TableRow key={s.workspaceId}>
                    <TableCell className="font-medium">{s.businessName}<span className="block text-xs text-muted-foreground">yes on {s.consentedAt.slice(0, 10)} (day {s.day})</span></TableCell>
                    <TableCell>{s.measured.from} to {s.measured.to}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(s.measured.spendMinor, s.measured.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.measured.leadsMeta}</TableCell>
                    <TableCell>{s.measured.tooEarly ? "no (too early)" : "yes"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
