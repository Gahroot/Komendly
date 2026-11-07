import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { PostActionButton } from "../_components/post-action-button";

export const dynamic = "force-dynamic";

export default async function AdminAdsAbusePage() {
  return (
    <AdminAdsShell title="Abuse queue" description="Open flags from trial checks, URL guard and rate limits. Highest severity first.">
      <Abuse />
    </AdminAdsShell>
  );
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

async function Abuse() {
  const flags = await prisma.abuseFlag.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { workspace: { select: { id: true, name: true, suspendedAt: true } } },
  });
  flags.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) || b.createdAt.getTime() - a.createdAt.getTime());
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>When</TableHead><TableHead>Severity</TableHead><TableHead>Kind</TableHead><TableHead>Workspace</TableHead><TableHead>Details</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {flags.map((f) => {
              const url = `/api/admin/ads/abuse/${f.id}`;
              return (
                <TableRow key={f.id}>
                  <TableCell className="text-muted-foreground">{formatDate(f.createdAt)}</TableCell>
                  <TableCell><Badge variant={f.severity === "high" ? "destructive" : f.severity === "medium" ? "default" : "secondary"}>{f.severity}</Badge></TableCell>
                  <TableCell>{f.kind}</TableCell>
                  <TableCell>
                    {f.workspace ? <Link className="hover:underline" href={`/admin/ads/workspaces/${f.workspace.id}`}>{f.workspace.name}</Link> : "—"}
                    {f.workspace?.suspendedAt && <Badge variant="destructive" className="ml-2">suspended</Badge>}
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">{JSON.stringify(f.details)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <PostActionButton url={url} body={{ action: "dismiss" }} label="Dismiss" variant="ghost" />
                      <PostActionButton url={url} body={{ action: "action" }} label="Mark actioned" />
                      {f.workspace && !f.workspace.suspendedAt && (
                        <PostActionButton url={url} body={{ action: "suspend" }} label="Suspend" variant="destructive"
                          confirm={{ title: `Suspend ${f.workspace.name}?`, description: "The workspace can't start runs, trials or checkouts until unsuspended." }} />
                      )}
                      {f.workspace?.suspendedAt && <PostActionButton url={url} body={{ action: "unsuspend" }} label="Unsuspend" />}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {flags.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No open flags.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
