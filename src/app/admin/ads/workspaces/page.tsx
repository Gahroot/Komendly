import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";

export const dynamic = "force-dynamic";

export default async function AdminAdsWorkspacesPage() {
  return (
    <AdminAdsShell title="Workspaces" description="Most recently active workspaces.">
      <Workspaces />
    </AdminAdsShell>
  );
}

async function Workspaces() {
  const rows = await prisma.adsWorkspace.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { _count: { select: { runs: true, abuseFlags: true } } },
  });
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Workspace</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Credits</TableHead><TableHead className="text-right">Runs</TableHead><TableHead className="text-right">Flags</TableHead><TableHead>Created</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <Link className="hover:underline" href={`/admin/ads/workspaces/${w.id}`}>{w.name}</Link>
                  {w.suspendedAt && <Badge variant="destructive" className="ml-2">suspended</Badge>}
                </TableCell>
                <TableCell>{w.adsPlan}</TableCell>
                <TableCell className="text-muted-foreground">{w.subscriptionStatus}</TableCell>
                <TableCell className="text-right tabular-nums">{w.creditBalance}</TableCell>
                <TableCell className="text-right tabular-nums">{w._count.runs}</TableCell>
                <TableCell className="text-right tabular-nums">{w._count.abuseFlags}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(w.createdAt)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No workspaces yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
