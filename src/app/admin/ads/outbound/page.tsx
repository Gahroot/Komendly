import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { LEAD_STATUSES, autoPauseReason, warmupLimit } from "@/lib/ads/outbound/policy";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { OutboundRunForm } from "../_components/outbound-run-form";
import { PostActionButton } from "../_components/post-action-button";
import { InputActionForm } from "../_components/input-action-form";

export const dynamic = "force-dynamic";

const API = "/api/admin/ads/outbound";

export default async function AdminOutboundPage() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [mailboxes, byStatus, sends, replies, runs, flag, suppressed] = await Promise.all([
    prisma.outboundMailbox.findMany({ orderBy: { address: "asc" } }),
    prisma.outboundLead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.outboundSend.findMany({ orderBy: { sentAt: "desc" }, take: 30, include: { lead: { select: { businessName: true, domain: true, status: true, giftToken: true } }, mailbox: { select: { address: true } } } }),
    prisma.outboundSend.findMany({ where: { replied: true }, orderBy: { sentAt: "desc" }, take: 15, include: { lead: { select: { businessName: true, email: true, status: true } } } }),
    prisma.outboundRun.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.adsFeatureFlag.findUnique({ where: { key: "outbound" } }),
    prisma.outboundSuppression.count(),
  ]);
  const health = await Promise.all(
    mailboxes.map(async (m) => {
      const [sentToday, recent] = await Promise.all([
        prisma.outboundSend.count({ where: { mailboxId: m.id, dryRun: false, sentAt: { gte: today } } }),
        prisma.outboundSend.findMany({ where: { mailboxId: m.id, dryRun: false }, orderBy: { sentAt: "desc" }, take: 100, select: { bounced: true, complained: true } }),
      ]);
      const bounces = recent.filter((r) => r.bounced).length;
      return { id: m.id, sentToday, limit: warmupLimit(m.warmupStartedAt, now, m.dailyCap), bounceRate: recent.length ? bounces / recent.length : 0, risk: autoPauseReason(recent), n: recent.length };
    }),
  );
  const counts = new Map(byStatus.map((s) => [s.status, s._count._all]));
  const on = flag?.enabled ?? false;
  return (
    <AdminAdsShell title="Cold outbound" description="'I made you a free ad': leads from public business sites, one hook ad each, paced sends from our Workspace mailboxes. Sending also needs OUTBOUND_ENABLED=1 on the engine.">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>Sending kill switch: <Badge variant={on ? "default" : "secondary"}>{on ? "ON" : "OFF"}</Badge></span>
        <PostActionButton url={API} body={{ action: "kill_switch", enabled: !on }} label={on ? "Stop all sending" : "Allow sending"} variant={on ? "destructive" : "outline"} confirm={{ title: on ? "Stop all outbound sending?" : "Allow outbound sending?", description: on ? "Every mailbox stops after the email in flight." : "Mailboxes send (paced, business hours) if the engine has OUTBOUND_ENABLED=1 and a postal address." }} />
        <span className="text-muted-foreground">{suppressed} suppressed addresses/domains</span>
        <InputActionForm url={API} body={{ action: "suppress" }} field="value" placeholder="email or domain" label="Suppress" variant="outline" required />
      </div>
      <Card>
        <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {LEAD_STATUSES.map((s) => <Badge key={s} variant="secondary" className="tabular-nums">{s}: {counts.get(s) ?? 0}</Badge>)}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Mailboxes</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Mailbox</TableHead><TableHead className="text-right">Today</TableHead><TableHead className="text-right">Bounce (last {"<="}100)</TableHead><TableHead className="text-right">Sent / replies</TableHead><TableHead>Health</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {mailboxes.map((m, i) => {
                  const h = health[i];
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{m.displayName}<div className="text-xs text-muted-foreground">{m.address} · warm-up since {formatDate(m.warmupStartedAt)}</div></TableCell>
                      <TableCell className="text-right tabular-nums">{h?.sentToday ?? 0} / {h?.limit ?? 0} <span className="text-xs text-muted-foreground">(cap {m.dailyCap})</span></TableCell>
                      <TableCell className="text-right tabular-nums">{((h?.bounceRate ?? 0) * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{m.sentTotal} / {m.repliedTotal}</TableCell>
                      <TableCell>{m.paused ? <Badge variant="destructive">paused{m.pausedReason ? `: ${m.pausedReason}` : ""}</Badge> : h?.risk ? <Badge variant="destructive">{h.risk}</Badge> : <Badge variant="secondary">ok</Badge>}</TableCell>
                      <TableCell>{m.paused ? <PostActionButton url={API} body={{ action: "resume", mailboxId: m.id }} label="Resume" /> : <PostActionButton url={API} body={{ action: "pause", mailboxId: m.id }} label="Pause" variant="destructive" />}</TableCell>
                    </TableRow>
                  );
                })}
                {mailboxes.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No mailboxes yet: set OUTBOUND_MAILBOXES on the engine.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader><CardTitle>Add leads</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <OutboundRunForm />
            <ul className="space-y-1 text-xs text-muted-foreground">
              {runs.map((r) => <li key={r.id}>{formatDate(r.createdAt)} · {r.niche} in {r.cities.join("; ")} · {r.status} · {r.found}/{r.count}</li>)}
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Recent sends</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Business</TableHead><TableHead>To</TableHead><TableHead>From</TableHead><TableHead>Step</TableHead><TableHead>Lead status</TableHead><TableHead>Flags</TableHead></TableRow></TableHeader>
            <TableBody>
              {sends.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(s.sentAt)}</TableCell>
                  <TableCell>{s.lead.giftToken ? <Link className="hover:underline" href={`/gift/${s.lead.giftToken}`} target="_blank">{s.lead.businessName}</Link> : s.lead.businessName}</TableCell>
                  <TableCell className="text-muted-foreground">{s.toEmail}</TableCell>
                  <TableCell className="text-muted-foreground">{s.mailbox.address}</TableCell>
                  <TableCell>{s.step}</TableCell>
                  <TableCell><Badge variant="secondary">{s.lead.status}</Badge></TableCell>
                  <TableCell className="text-xs">{[s.bounced && "bounced", s.complained && "complaint", s.replied && "replied", s.dryRun && "dry run"].filter(Boolean).join(", ") || "—"}</TableCell>
                </TableRow>
              ))}
              {sends.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Nothing sent yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Replies</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {replies.map((r) => <div key={r.id}><span className="font-medium">{r.lead.businessName}</span> <span className="text-muted-foreground">({r.lead.email}, {r.lead.status})</span><p className="text-muted-foreground">{r.replySnippet ?? ""}</p></div>)}
          {replies.length === 0 && <p className="text-muted-foreground">No replies yet.</p>}
        </CardContent>
      </Card>
    </AdminAdsShell>
  );
}
