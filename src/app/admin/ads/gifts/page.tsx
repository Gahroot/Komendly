import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents, formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { OutreachGiftForm } from "../_components/outreach-gift-form";

export const dynamic = "force-dynamic";

const SOURCES = ["trial_ready", "paid_monthly", "partner_demo", "admin_outreach"];

export default async function AdminGiftsPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const q = await searchParams;
  const source = SOURCES.includes(q.source ?? "") ? q.source : undefined;
  const gifts = await prisma.adsGift.findMany({ where: { source }, orderBy: { createdAt: "desc" }, take: 200 });
  const senders = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(gifts.map((g) => g.senderUserId))] } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  return (
    <AdminAdsShell title="Gift packs" description="3-ad packs made for someone else's website. Views exclude bots.">
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Gifts ({gifts.length})</CardTitle>
            <form className="flex items-center gap-2 text-sm"><select name="source" defaultValue={source ?? ""} className="rounded border bg-background px-2 py-1"><option value="">All sources</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select><button className="rounded-md border px-2 py-1" type="submit">Filter</button></form>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Sender</TableHead><TableHead>Recipient</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Views</TableHead><TableHead>Claimed</TableHead><TableHead className="text-right">Cost</TableHead></TableRow></TableHeader>
              <TableBody>
                {gifts.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(g.createdAt)}</TableCell>
                    <TableCell>{g.senderName}<div className="text-xs text-muted-foreground">{senders.get(g.senderUserId) ?? ""}</div></TableCell>
                    <TableCell className="max-w-48"><Link className="hover:underline" href={`/gift/${g.token}`} target="_blank">{g.recipientUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</Link>{g.recipientName && <div className="text-xs text-muted-foreground">{g.recipientName}</div>}</TableCell>
                    <TableCell><Badge variant="secondary">{g.source}</Badge></TableCell>
                    <TableCell>{g.status}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.viewCount}</TableCell>
                    <TableCell className="text-muted-foreground">{g.claimedAt ? formatDate(g.claimedAt) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(Math.round(Number(g.costMicros) / 1e4))}</TableCell>
                  </TableRow>
                ))}
                {gifts.length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">No gifts yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader><CardTitle>Make an outreach gift</CardTitle></CardHeader>
          <CardContent><OutreachGiftForm /></CardContent>
        </Card>
      </div>
    </AdminAdsShell>
  );
}
