import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminUser } from "@/lib/ads/billing-auth";
import { loadStudioSessions } from "@/lib/hub/hq-queries";

export const metadata: Metadata = { title: "Studio sessions" };
export const dynamic = "force-dynamic";

export default async function AdminStudioPage() {
  if (!(await getAdminUser())) return <p className="text-destructive">Admin access required.</p>;
  const rows = await loadStudioSessions(50);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ozzy Studio</p>
        <h1 className="text-2xl font-semibold">Recent sessions</h1>
        <p className="text-sm text-muted-foreground">The 50 most recently active Studio chats.</p>
      </div>
      <Card className="p-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead className="text-right">Renders</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No Studio sessions yet.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-56 truncate font-medium">{r.title}{r.freeVideo ? <Badge variant="outline" className="ml-2">free</Badge> : null}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{r.email}<span className="block text-xs">{r.workspace}</span></TableCell>
                  <TableCell><Badge variant={r.status === "error" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{r.messages}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.renders}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.credits}</TableCell>
                  <TableCell className="text-right tabular-nums">${r.costUsd.toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.lastActivityAt.toLocaleString("en-AU")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
