// Churn & failed-payment win-back (system winback): queue, sent, recovered, churn reasons, step previews. Read-only.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { parseBeat, systemEnabled, systemHeartbeatId } from "@/lib/growth/systems";
import { CHURN_REASONS, fallbackWinbackCopy, loadWinbackRows, WINBACK_STEPS, WINBACK_SYSTEM, winbackBackfillDays, winbackCopyContext, winbackNext, winbackStop, type WinbackCase } from "@/lib/growth/winback";

const DAY = 86_400_000;

export async function WinbackSection() {
  const now = new Date();
  const days = winbackBackfillDays();
  const [enabled, beatRow, rows, sent30, recovered, reasons] = await Promise.all([
    systemEnabled(prisma, WINBACK_SYSTEM),
    prisma.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId(WINBACK_SYSTEM) } }),
    loadWinbackRows(prisma, new Date(now.getTime() - days * DAY)),
    prisma.adsEvent.count({ where: { name: "winback_email_sent", createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    prisma.adsEvent.groupBy({ by: ["name"], where: { name: { in: ["payment_recovered", "winback_recovered"] } }, _count: true }),
    prisma.adsEvent.findMany({ where: { name: "churn_reason" }, orderBy: { createdAt: "desc" }, take: 50, select: { props: true } }),
  ]);
  const beat = beatRow ? parseBeat(beatRow.meta) : null;
  const count = (n: string) => recovered.find((r) => r.name === n)?._count ?? 0;
  const reasonCounts = new Map<string, number>();
  for (const r of reasons) {
    const k = String((r.props as { reason?: unknown })?.reason ?? "");
    reasonCounts.set(k, (reasonCounts.get(k) ?? 0) + 1);
  }
  const list = rows.map((r) => ({ ...r, stop: winbackStop(r.state, now, days), next: winbackNext(r.state, now, days) }))
    .sort((a, b) => Number(Boolean(a.stop)) - Number(Boolean(b.stop)) || b.c.at.getTime() - a.c.at.getTime());
  const sample = (kind: WinbackCase["kind"]): WinbackCase => ({ key: "preview", kind, billing: "ads", userId: "preview", workspaceId: null, at: now, invoiceId: null, plan: "starter", resolved: false });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">Churn &amp; failed-payment win-back <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "on" : "off"}</Badge></CardTitle>
        <CardDescription>
          Flag <span className="font-mono">sys_winback</span>. Engine loop hourly. Failed payment: 1h, day 3, day 7 (update-card link). Churn: day 3 (reasons), day 14, day 30 (20% off, ads only).
          Queue: {list.filter((r) => !r.stop).length} · sent 30d: {sent30} · payments recovered: {count("payment_recovered")} · won back: {count("winback_recovered")}
          {beat?.lastRunAt ? ` · last run ${formatDate(new Date(beat.lastRunAt))}${beat.lastError ? ` (error: ${beat.lastError})` : ""}` : " · never ran"}. Window: last {days} days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Table>
          <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Case</TableHead><TableHead>When</TableHead><TableHead>Sent</TableHead><TableHead>Next / stopped</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={r.c.key}>
                <TableCell className="font-mono text-xs">{r.user.email}</TableCell>
                <TableCell className="text-xs">{r.c.kind} · {r.c.billing}{r.c.plan ? ` · ${r.c.plan}` : ""}</TableCell>
                <TableCell>{formatDate(r.c.at)}</TableCell>
                <TableCell className="text-xs">{r.state.sent.map((x) => x.step).join(", ") || "—"}</TableCell>
                <TableCell>{r.recovered ? <Badge>recovered</Badge> : r.stop ? <Badge variant="secondary">{r.stop}</Badge> : r.next ? <Badge variant="outline">{r.next.step} @ {formatDate(r.next.at)}</Badge> : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {reasonCounts.size > 0 && (
          <div className="text-sm"><span className="font-medium">Churn reasons: </span>{[...reasonCounts].map(([k, n]) => `${CHURN_REASONS[k as keyof typeof CHURN_REASONS] ?? k} (${n})`).join(" · ")}</div>
        )}
        <div className="space-y-2">
          <div className="text-sm font-medium">Step previews (fallback copy; the engine may personalise it with Codex)</div>
          {(["failed", "churn"] as const).flatMap((kind) => WINBACK_STEPS[kind].map(({ step }) => {
            const c = fallbackWinbackCopy(winbackCopyContext(sample(kind), step, { firstName: "Sam", brandName: null, readyAdCount: 0, headlines: [] }));
            return (
              <details key={step} className="rounded border p-2 text-sm">
                <summary className="cursor-pointer"><span className="font-mono text-xs">{step}</span> · {c.subject}</summary>
                <div className="mt-2 space-y-2 text-muted-foreground">{c.paragraphs.map((p, i) => <p key={i}>{p}</p>)}<p className="font-medium">[{c.ctaLabel}]</p></div>
              </details>
            );
          }))}
        </div>
      </CardContent>
    </Card>
  );
}
