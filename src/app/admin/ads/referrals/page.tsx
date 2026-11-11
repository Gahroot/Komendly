import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { workspaceLabels } from "@/lib/ads/growth-queries";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";

export const dynamic = "force-dynamic";

const SOURCES = ["link", "gift", "partner"];
const STATUSES = ["signed_up", "trial_done", "rewarded", "paid", "rejected"];

export default async function AdminReferralsPage({ searchParams }: { searchParams: Promise<{ source?: string; status?: string }> }) {
  const q = await searchParams;
  const source = SOURCES.includes(q.source ?? "") ? q.source : undefined;
  const status = STATUSES.includes(q.status ?? "") ? q.status : undefined;
  const [rows, top] = await Promise.all([
    prisma.adsReferral.findMany({ where: { source, status }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.adsReferral.groupBy({ by: ["referrerWorkspaceId"], where: { status: { not: "rejected" } }, _count: { _all: true }, _sum: { rewardCredits: true }, orderBy: { _count: { referrerWorkspaceId: "desc" } }, take: 10 }),
  ]);
  const labels = await workspaceLabels([...rows.flatMap((r) => [r.referrerWorkspaceId, r.referredWorkspaceId]), ...top.map((t) => t.referrerWorkspaceId)]);
  const who = (id: string) => labels.get(id) ?? { name: id, email: "" };
  return (
    <AdminAdsShell title="Referrals" description="Every referred sign-up (link, gift and partner), including rejected ones.">
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">Source<select name="source" defaultValue={source ?? ""} className="rounded border bg-background px-2 py-1"><option value="">All</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="grid gap-1">Status<select name="status" defaultValue={status ?? ""} className="rounded border bg-background px-2 py-1"><option value="">All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <button className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground" type="submit">Filter</button>
      </form>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Referrals ({rows.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Referrer</TableHead><TableHead>Referred</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Reward</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                    <TableCell>{who(r.referrerWorkspaceId).name}<div className="text-xs text-muted-foreground">{r.code}</div></TableCell>
                    <TableCell>{who(r.referredWorkspaceId).name}<div className="text-xs text-muted-foreground">{who(r.referredWorkspaceId).email}</div></TableCell>
                    <TableCell><Badge variant="secondary">{r.source}</Badge></TableCell>
                    <TableCell>{r.status}{r.rejectReason && <div className="text-xs text-destructive">{r.rejectReason}</div>}{r.trialDoneAt && <div className="text-xs text-muted-foreground">trial {formatDate(r.trialDoneAt)}</div>}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.rewardCredits || "—"}{r.rewardedAt && <div className="text-xs text-muted-foreground">{formatDate(r.rewardedAt)}</div>}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No referrals yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top referrers</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Referrer</TableHead><TableHead className="text-right">Friends</TableHead><TableHead className="text-right">Credits</TableHead></TableRow></TableHeader>
              <TableBody>
                {top.map((t) => (
                  <TableRow key={t.referrerWorkspaceId}><TableCell>{who(t.referrerWorkspaceId).name}<div className="text-xs text-muted-foreground">{who(t.referrerWorkspaceId).email}</div></TableCell><TableCell className="text-right tabular-nums">{t._count._all}</TableCell><TableCell className="text-right tabular-nums">{t._sum.rewardCredits ?? 0}</TableCell></TableRow>
                ))}
                {top.length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">—</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminAdsShell>
  );
}
