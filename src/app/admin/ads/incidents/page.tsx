import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { parseIncident, type IncidentRec } from "@/lib/ops/incidents";
import { AdminAdsShell } from "../_components/admin-ads-shell";

export const dynamic = "force-dynamic";

const o = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const ts = (v: string | null) => (v ? v.slice(0, 16).replace("T", " ") : "");

export default async function AdminAdsIncidentsPage() {
  return (
    <AdminAdsShell title="Incidents" description="Opened automatically from funnel checks, heartbeats, deliverability, payments and infra checks. Containment is limited to switching a system flag off, pausing a domain, or the maintenance flag. Times UTC.">
      <Incidents />
    </AdminAdsShell>
  );
}

async function Incidents() {
  const now = Date.now();
  const [events, infra, review, expDigest] = await Promise.all([
    prisma.adsEvent.findMany({ where: { name: "incident", createdAt: { gte: new Date(now - 60 * 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.adsEvent.findMany({ where: { name: "infra_check" }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.adsEvent.findFirst({ where: { name: "incident_review" }, orderBy: { createdAt: "desc" } }),
    prisma.adsEvent.findFirst({ where: { name: "infra_expiring_digest" }, orderBy: { createdAt: "desc" } }),
  ]);
  const recs = events.map((e) => parseIncident(e.id, e.props)).filter((r): r is IncidentRec => r !== null);
  const open = recs.filter((r) => r.status !== "resolved").sort((a, b) => a.severity.localeCompare(b.severity));
  const closed = recs.filter((r) => r.status === "resolved").slice(0, 30);
  const slow = infra.find((e) => o(e.props).kind === "slow"), fast = infra.find((e) => o(e.props).kind === "fast");
  const expiry = (Array.isArray(o(slow?.props).expiry) ? o(slow?.props).expiry : []) as { name: string; days: number | null; severity: string | null }[];
  const http = (Array.isArray(o(fast?.props).http) ? o(fast?.props).http : []) as { name: string; status: number | null; ms: number | null; error?: string }[];
  const db = o(o(fast?.props).db);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Open ({open.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {open.length === 0 && <p className="text-muted-foreground">No open incidents.</p>}
          {open.map((r) => <Row key={r.incidentId} r={r} />)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Infrastructure (read-only checks)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!fast && !slow && <p className="text-muted-foreground">No infra_check yet (needs sys_infra_watch on).</p>}
          {fast && <p>Last fast check {ts(fast.createdAt.toISOString())}: {http.map((h) => `${h.name} ${h.error ? "error" : h.status} ${h.ms ?? "?"}ms`).join(" · ")}{db.connections ? ` · DB ${String(db.connections)}/${String(db.maxConnections)} connections, ${(Number(db.sizeBytes) / 1e9).toFixed(2)} GB, ${String(db.slowQueries)} slow` : ""}</p>}
          {expiry.length > 0 && (
            <ul className="list-disc pl-5">
              {expiry.map((e) => <li key={e.name}>{e.name}: {e.days === null ? "unknown" : e.days < 0 ? "EXPIRED" : `${e.days} day(s)`} {e.severity && <Badge variant={e.severity === "P3" ? "secondary" : "destructive"}>{e.severity}</Badge>}</li>)}
            </ul>
          )}
          {expDigest && <p className="text-muted-foreground">Last weekly expiring-soon email: week {String(o(expDigest.props).week)} ({String(o(expDigest.props).items)} items).</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recently resolved ({closed.length}){review ? ` · last review ${String(o(review.props).day)}: ${String(o(review.props).proposals)} permanent-fix proposal(s) filed` : ""}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">{closed.map((r) => <Row key={r.incidentId} r={r} />)}</CardContent>
      </Card>
    </div>
  );
}

function Row({ r }: { r: IncidentRec }) {
  return (
    <div className="space-y-1 border-b pb-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={r.severity === "P1" ? "destructive" : r.severity === "P2" ? "default" : "secondary"}>{r.severity}</Badge>
        <Badge variant="outline">{r.status}</Badge>
        <span className="font-medium">{r.title}</span>
        {r.recurrence > 0 && <Badge variant="outline">recurred x{r.recurrence}</Badge>}
        <span className="text-muted-foreground">detected {ts(r.detectedAt)}{r.resolvedAt ? ` · resolved ${ts(r.resolvedAt)}` : ""}</span>
      </div>
      {r.signals.slice(-2).map((s, i) => <p key={i} className="text-muted-foreground">{s.detail}</p>)}
      {r.containment.length > 0 && <p>Containment: {r.containment.map((c) => `${c.action}${c.ok ? "" : " (failed)"}`).join(", ")}. Reverse by turning the flag back on at <a className="underline" href="/admin/ads/growth">Growth</a>.</p>}
      {r.rootCause && <p>Root cause: {r.rootCause}</p>}
      {r.correctiveAction && <p>Corrective action: {r.correctiveAction}</p>}
    </div>
  );
}
