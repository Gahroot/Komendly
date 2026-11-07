import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { PostActionButton } from "../_components/post-action-button";

export const dynamic = "force-dynamic";

export default async function AdminAdsJobsPage() {
  return (
    <AdminAdsShell title="Failed jobs" description="Failed (retrying) and dead (retries exhausted) engine jobs.">
      <Jobs />
    </AdminAdsShell>
  );
}

async function Jobs() {
  const jobs = await prisma.adJob.findMany({
    where: { status: { in: ["failed", "dead"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: { id: true, type: true, status: true, runId: true, attempts: true, maxAttempts: true, lastError: true, createdAt: true, finishedAt: true },
  });
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Job</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Error</TableHead><TableHead>Run</TableHead><TableHead>Finished</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((j) => (
              <TableRow key={j.id}>
                <TableCell><div className="font-medium">{j.type}</div><div className="font-mono text-xs text-muted-foreground">{j.id}</div></TableCell>
                <TableCell><Badge variant={j.status === "dead" ? "destructive" : "secondary"}>{j.status}</Badge></TableCell>
                <TableCell className="tabular-nums">{j.attempts}/{j.maxAttempts}</TableCell>
                <TableCell className="max-w-sm truncate text-xs text-muted-foreground" title={j.lastError ?? ""}>{j.lastError ?? "—"}</TableCell>
                <TableCell>{j.runId ? <Link className="font-mono text-xs hover:underline" href={`/ads/runs/${j.runId}`}>{j.runId.slice(0, 10)}…</Link> : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(j.finishedAt ?? j.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <PostActionButton url={`/api/admin/ads/jobs/${j.id}`} body={{ action: "retry" }} label="Retry" />
                    <PostActionButton url={`/api/admin/ads/jobs/${j.id}`} body={{ action: "cancel" }} label="Cancel" variant="ghost"
                      confirm={{ title: "Cancel this job?", description: "The engine will not run it again." }} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {jobs.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No failed jobs.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
