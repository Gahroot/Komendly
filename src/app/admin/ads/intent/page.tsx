import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { AdminEmpty } from "../../_components/admin-empty";

export const dynamic = "force-dynamic";

interface Props { url?: string; title?: string; text?: string; score?: number; draft?: string; source?: string; status?: string }

export default async function AdminIntentPage() {
  const rows = await prisma.adsEvent.findMany({ where: { name: "intent_opportunity" }, orderBy: { createdAt: "desc" }, take: 200 });
  const items = rows.map((r) => ({ id: r.id, at: r.createdAt, p: r.props as Props }));
  const open = items.filter((i) => (i.p.status ?? "new") === "new").sort((a, b) => (b.p.score ?? 0) - (a.p.score ?? 0));
  const safeUrl = (u?: string) => (u && /^https?:\/\//.test(u) ? u : undefined);
  return (
    <AdminAdsShell title="Intent opportunities" description="Public posts asking for ad help, found by Kly. Nothing is posted automatically; reply by hand or via the desktop agent, then mark done.">
      <Card>
        <CardHeader><CardTitle>Open ({open.length}) of last {items.length}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Found</TableHead><TableHead>Score</TableHead><TableHead>Post</TableHead><TableHead>Draft reply</TableHead></TableRow></TableHeader>
            <TableBody>
              {open.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(i.at)}</TableCell>
                  <TableCell className="tabular-nums"><Badge variant="secondary">{i.p.score ?? 0}</Badge><div className="text-xs text-muted-foreground">{i.p.source}</div></TableCell>
                  <TableCell className="max-w-md">
                    {safeUrl(i.p.url) ? <a className="font-medium hover:underline" href={safeUrl(i.p.url)} target="_blank" rel="noreferrer noopener">{i.p.title || i.p.url}</a> : i.p.title}
                    <div className="line-clamp-3 text-xs text-muted-foreground">{i.p.text}</div>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap text-xs">{i.p.draft}</TableCell>
                </TableRow>
              ))}
              {open.length === 0 && <TableRow><TableCell colSpan={4}><AdminEmpty>No open opportunities. Enable KLY_INTENT_ENABLED=1 on the Kly service to start collecting.</AdminEmpty></TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminAdsShell>
  );
}
