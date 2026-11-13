import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { WORKER_HOST_LABEL, workerHost } from "@/lib/ads/worker-host";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { AdminEmpty } from "../../_components/admin-empty";

export const dynamic = "force-dynamic";
const STALE_MS = 2 * 60 * 1000;

export default async function AdminAdsEnginePage() {
  return (
    <AdminAdsShell title="Engine" description="Worker heartbeats, provider login status and queue depth.">
      <Engine />
    </AdminAdsShell>
  );
}

async function loadEngine() {
  const [beats, depth] = await Promise.all([
    prisma.engineHeartbeat.findMany({ orderBy: [{ kind: "asc" }, { id: "asc" }] }),
    prisma.adJob.groupBy({ by: ["type", "status"], _count: { _all: true } }),
  ]);
  return { beats, depth, now: Date.now() };
}

async function Engine() {
  const { beats, depth, now } = await loadEngine();
  const providers = beats.filter((b) => b.kind === "provider");
  const workers = beats.filter((b) => b.kind !== "provider");
  const codex = providers.find((p) => p.id === "provider:codex");
  const providerDown = providers.filter((p) => !p.ok);
  const statuses = ["queued", "running", "failed", "dead", "succeeded", "canceled"] as const;
  const types = [...new Set(depth.map((d) => d.type))].sort();
  const count = (type: string, status: string) => depth.find((d) => d.type === type && d.status === status)?._count._all ?? 0;

  return (
    <div className="space-y-6">
      {(providerDown.length > 0 || !codex) && (
        <div role="alert" className="flex gap-3 rounded-xl border border-destructive bg-destructive/10 p-4 text-destructive">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">{!codex ? "No heartbeat from provider:codex" : "Provider login problem"}</p>
            <p className="text-sm">
              {!codex ? "The engine hasn't reported Codex login status. Generation may be stalled." : providerDown.map((p) => `${p.id}: ${p.message ?? "not ok"}`).join(" · ")}
            </p>
            <p className="mt-1 text-sm">Re-login the provider on the Railway engine service, then confirm the heartbeat turns green.</p>
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Heartbeats</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Host</TableHead><TableHead>Status</TableHead><TableHead>Message</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
              <TableBody>
                {[...providers, ...workers].map((b) => {
                  const stale = now - b.updatedAt.getTime() > STALE_MS;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.id}</TableCell>
                      <TableCell><Badge variant="outline">{WORKER_HOST_LABEL[workerHost(b.id, b.kind, b.meta)]}</Badge></TableCell>
                      <TableCell><Badge variant={!b.ok ? "destructive" : stale ? "secondary" : "default"}>{!b.ok ? "down" : stale ? "stale" : "ok"}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">{b.message ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(b.updatedAt)}</TableCell>
                    </TableRow>
                  );
                })}
                {beats.length === 0 && <TableRow><TableCell colSpan={5}><AdminEmpty>No heartbeats yet.</AdminEmpty></TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Queue depth</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead>{statuses.map((s) => <TableHead key={s} className="text-right">{s}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t}>
                    <TableCell>{t}</TableCell>
                    {statuses.map((s) => <TableCell key={s} className="text-right tabular-nums">{count(t, s)}</TableCell>)}
                  </TableRow>
                ))}
                {types.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Queue is empty.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
