// Abandoned-checkout recovery (system checkout_recovery): queue, sent, recovered, and a preview of each step.
// Same rules as the engine loop (loadRecoveryRows / nextStepAt). Read-only.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { parseBeat, systemEnabled, systemHeartbeatId } from "@/lib/growth/systems";
import { backfillDays, fallbackRecoveryCopy, itemInfo, loadRecoveryRows, nextStepAt, RECOVERY_STEPS, RECOVERY_SYSTEM, recoveryCopyContext, stopReason, type StartedCheckout } from "@/lib/growth/checkout-recovery";

const DAY = 86_400_000;
const SAMPLE: StartedCheckout = { key: "preview", billing: "testimonials", userId: "preview", workspaceId: null, item: { kind: "first_video", key: "first_video" }, startedAt: new Date(0), sessionId: null };

export async function RecoverySection() {
  const now = new Date();
  const days = backfillDays();
  const [enabled, beatRow, rows, sent30, recovered] = await Promise.all([
    systemEnabled(prisma, RECOVERY_SYSTEM),
    prisma.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId(RECOVERY_SYSTEM) } }),
    loadRecoveryRows(prisma, new Date(now.getTime() - days * DAY)),
    prisma.adsEvent.count({ where: { name: "recovery_email_sent", createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    prisma.adsEvent.findMany({ where: { name: "checkout_recovered" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, userId: true, props: true, createdAt: true } }),
  ]);
  const beat = beatRow ? parseBeat(beatRow.meta) : null;
  const list = rows
    .map((r) => ({ ...r, stop: stopReason(r.state, now, days), next: nextStepAt(r.state, now, days) }))
    .sort((a, b) => Number(Boolean(a.stop)) - Number(Boolean(b.stop)) || b.checkout.startedAt.getTime() - a.checkout.startedAt.getTime());
  const queued = list.filter((r) => !r.stop).length;
  const emailOf = new Map(rows.map((r) => [r.user.id, r.user.email]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Abandoned-checkout recovery <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "on" : "off"}</Badge>
        </CardTitle>
        <CardDescription>
          Flag <span className="font-mono">sys_checkout_recovery</span>. Engine loop every 15 min (1h, 24h, 72h, ~6.5d; 20% off only on the last). Queue: {queued} · sent 30d: {sent30} · recovered: {recovered.length}
          {beat?.lastRunAt ? ` · last run ${formatDate(new Date(beat.lastRunAt))}${beat.lastError ? ` (error: ${beat.lastError})` : ""}` : " · never ran"}. Window: last {days} days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Table>
          <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Item</TableHead><TableHead>Started</TableHead><TableHead>Sent</TableHead><TableHead>Next / stopped</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={r.checkout.key}>
                <TableCell className="font-mono text-xs">{r.user.email}</TableCell>
                <TableCell className="text-xs">{r.checkout.billing} · {itemInfo(r.checkout.item)?.name ?? r.checkout.item.key}</TableCell>
                <TableCell>{formatDate(r.checkout.startedAt)}</TableCell>
                <TableCell className="text-xs">{r.state.sent.map((x) => x.step).join(", ") || "—"}</TableCell>
                <TableCell>{r.recovered ? <Badge>recovered</Badge> : r.stop ? <Badge variant="secondary">{r.stop}</Badge> : r.next ? <Badge variant="outline">{r.next.step} @ {formatDate(r.next.at)}</Badge> : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {recovered.length > 0 && (
          <div className="text-sm">
            <div className="font-medium">Recovered</div>
            <ul className="text-xs">
              {recovered.map((e) => {
                const p = (e.props ?? {}) as Record<string, unknown>;
                return <li key={e.id}>{formatDate(e.createdAt)} · {(e.userId && emailOf.get(e.userId)) ?? e.userId} · {String(p.billing ?? "")} · after {String(p.step ?? "")} · ${((Number(p.amountCents) || 0) / 100).toFixed(2)}</li>;
              })}
            </ul>
          </div>
        )}
        <div className="space-y-2">
          <div className="text-sm font-medium">Step previews (fallback copy; the engine may personalise it with Codex)</div>
          {RECOVERY_STEPS.map(({ step }) => {
            const c = fallbackRecoveryCopy(recoveryCopyContext(SAMPLE, step, { firstName: "Sam", brandName: null, readyAdCount: 0, headlines: [], now }));
            return (
              <details key={step} className="rounded border p-2 text-sm">
                <summary className="cursor-pointer"><span className="font-mono text-xs">{step}</span> · {c.subject}</summary>
                <div className="mt-2 space-y-2 text-muted-foreground">
                  {c.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                  <p className="font-medium">[{c.ctaLabel}]</p>
                </div>
              </details>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
