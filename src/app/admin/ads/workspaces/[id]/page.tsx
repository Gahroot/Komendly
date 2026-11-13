import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { AdjustCreditsForm } from "../../_components/adjust-credits-form";
import { AdminAdsShell } from "../../_components/admin-ads-shell";
import { PostActionButton } from "../../_components/post-action-button";
import { StatCard } from "../../_components/stat-card";
import { AdminEmpty } from "../../../_components/admin-empty";

export const dynamic = "force-dynamic";

export default async function AdminAdsWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await prisma.adsWorkspace.findUnique({ where: { id } });
  if (!ws) notFound();
  return (
    <AdminAdsShell title={ws.name} description={`Workspace ${ws.id}`}>
      <Detail id={id} />
    </AdminAdsShell>
  );
}

async function Detail({ id }: { id: string }) {
  const [ws, ledger, runs, flags] = await Promise.all([
    prisma.adsWorkspace.findUniqueOrThrow({ where: { id } }),
    prisma.creditLedger.findMany({ where: { workspaceId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.adRun.findMany({ where: { workspaceId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.abuseFlag.findMany({ where: { workspaceId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Plan" value={ws.adsPlan} hint={ws.subscriptionStatus} />
        <StatCard label="Credit balance" value={String(ws.creditBalance)} />
        <StatCard label="Trial used" value={ws.trialUsedAt ? "yes" : "no"} hint={formatDate(ws.trialUsedAt)} />
        <StatCard label="Suspended" value={ws.suspendedAt ? "yes" : "no"} hint={formatDate(ws.suspendedAt)} tone={ws.suspendedAt ? "bad" : "default"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <AdjustCreditsForm workspaceId={ws.id} />
            {ws.suspendedAt ? (
              <PostActionButton url={`/api/admin/ads/workspaces/${ws.id}/suspend`} body={{ suspended: false }} label="Unsuspend" />
            ) : (
              <PostActionButton url={`/api/admin/ads/workspaces/${ws.id}/suspend`} body={{ suspended: true }} label="Suspend workspace" variant="destructive"
                confirm={{ title: `Suspend ${ws.name}?`, description: "Blocks runs, trials and checkouts until unsuspended." }} />
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Credit ledger</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Delta</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
              <TableBody>
                {ledger.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">{formatDate(l.createdAt)}</TableCell>
                    <TableCell>{l.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.delta > 0 ? `+${l.delta}` : l.delta}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.balanceAfter}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{l.note ?? l.stripeRef ?? ""}</TableCell>
                  </TableRow>
                ))}
                {ledger.length === 0 && <TableRow><TableCell colSpan={5}><AdminEmpty>No ledger entries yet.</AdminEmpty></TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Runs</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Created</TableHead><TableHead>URL</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Credits</TableHead></TableRow></TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="max-w-48 truncate">{r.url}{r.isTrial && <Badge variant="secondary" className="ml-2">trial</Badge>}</TableCell>
                    <TableCell><Badge variant={r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{r.creditsReserved}</TableCell>
                  </TableRow>
                ))}
                {runs.length === 0 && <TableRow><TableCell colSpan={4}><AdminEmpty>No runs yet.</AdminEmpty></TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Abuse flags</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Kind</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {flags.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="text-muted-foreground">{formatDate(f.createdAt)}</TableCell>
                    <TableCell>{f.kind}</TableCell>
                    <TableCell><Badge variant={f.severity === "high" ? "destructive" : "secondary"}>{f.severity}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{f.status}</TableCell>
                  </TableRow>
                ))}
                {flags.length === 0 && <TableRow><TableCell colSpan={4}><AdminEmpty>No flags. All tidy.</AdminEmpty></TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
