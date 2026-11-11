import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/ads/billing-auth";
import { loadLifecycleCandidates } from "@/lib/ads/lifecycle/load";
import { dueEmail, LIFECYCLE_KINDS, nextEmail, scheduleStatus, suppressedReason, type ScheduleStatus } from "@/lib/ads/lifecycle/select";

const DAY = 86_400_000;
const STATUS_VARIANT: Record<ScheduleStatus, "default" | "secondary" | "outline"> = { sent: "default", due: "default", upcoming: "outline", missed: "secondary", suppressed: "secondary" };

/** Per-kind sends and clicks in the last 7 / 30 days. */
function kindStats(events: Array<{ name: string; createdAt: Date; props: unknown }>, now: Date) {
  const kinds = new Map<string, { sent7: number; sent30: number; clicks7: number; clicks30: number }>();
  for (const k of [...LIFECYCLE_KINDS, "gift_ready", "referral_reward"]) kinds.set(k, { sent7: 0, sent30: 0, clicks7: 0, clicks30: 0 });
  for (const e of events) {
    const kind = (e.props as { kind?: unknown } | null)?.kind;
    if (typeof kind !== "string") continue;
    const row = kinds.get(kind) ?? { sent7: 0, sent30: 0, clicks7: 0, clicks30: 0 };
    const recent = now.getTime() - e.createdAt.getTime() < 7 * DAY;
    if (e.name === "email_sent") {
      row.sent30++;
      if (recent) row.sent7++;
    } else {
      row.clicks30++;
      if (recent) row.clicks7++;
    }
    kinds.set(kind, row);
  }
  return [...kinds.entries()];
}
import { AdminAdsShell } from "../_components/admin-ads-shell";

export const dynamic = "force-dynamic";

/** Dry-run view: who the engine would email now and next. Sends nothing. */
export default async function AdminAdsEmailsPage() {
  return (
    <AdminAdsShell title="Lifecycle emails" description="Dry run: who the engine's lifecycle loop would email now, and what comes next. Nothing is sent from this page.">
      <Emails />
    </AdminAdsShell>
  );
}

async function Emails() {
  if (!(await getAdminUser())) return null;
  const now = new Date();
  const [flag, candidates, recent, month] = await Promise.all([
    prisma.adsFeatureFlag.findUnique({ where: { key: "lifecycle_email" } }),
    loadLifecycleCandidates(prisma, now),
    prisma.adsEvent.findMany({ where: { name: { in: ["email_sent", "email_unsubscribed"] } }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.adsEvent.findMany({ where: { name: { in: ["email_sent", "email_clicked"] }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, select: { name: true, createdAt: true, props: true } }),
  ]);
  const stats = kindStats(month, now);
  const rows = candidates
    .map((c) => ({ c, due: dueEmail(c, now), next: nextEmail(c, now), why: suppressedReason(c) }))
    .sort((a, b) => Number(Boolean(b.due)) - Number(Boolean(a.due)) || b.c.signedUpAt.getTime() - a.c.signedUpAt.getTime());
  const emailOf = new Map(candidates.map((c) => [c.userId, c.email]));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Sending <Badge variant={flag?.enabled ? "default" : "secondary"}>{flag?.enabled ? "on" : "off"}</Badge></CardTitle>
          <CardDescription>Flag <span className="font-mono">lifecycle_email</span> (Flags tab). Engine env <span className="font-mono">LIFECYCLE_DRY_RUN=1</span> logs instead of sending. The loop runs every 10 minutes.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader><CardTitle>Sent and clicked per kind</CardTitle><CardDescription>Clicks come from the tracked links (/api/ads/email-click). Opens are not tracked.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Sent 7d</TableHead><TableHead>Sent 30d</TableHead><TableHead>Clicks 7d</TableHead><TableHead>Clicks 30d</TableHead></TableRow></TableHeader>
            <TableBody>
              {stats.map(([kind, s]) => (
                <TableRow key={kind}>
                  <TableCell className="font-mono text-xs">{kind}</TableCell>
                  <TableCell>{s.sent7}</TableCell><TableCell>{s.sent30}</TableCell><TableCell>{s.clicks7}</TableCell><TableCell>{s.clicks30}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Candidates ({rows.length})</CardTitle><CardDescription>Ads sign-ups or finished trials in the schedule window (about 7 months), plus everyone who signed up before the free-ads announcement while it is open.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Signed up</TableHead><TableHead>Trial ready</TableHead><TableHead>Due now</TableHead><TableHead>Next</TableHead><TableHead>Schedule</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map(({ c, due, next, why }) => (
                <TableRow key={c.userId}>
                  <TableCell className="font-mono text-xs">{c.email}{!c.emailVerifiedAt && <Badge variant="outline" className="ml-2">unverified</Badge>}</TableCell>
                  <TableCell>{formatDate(c.signedUpAt)}</TableCell>
                  <TableCell>{c.trialCompletedAt ? `${formatDate(c.trialCompletedAt)} (${c.readyAdCount} ads)` : "—"}</TableCell>
                  <TableCell>{why ? <Badge variant="secondary">skip: {why}</Badge> : due ? <Badge>{due.kind}</Badge> : "—"}</TableCell>
                  <TableCell>{next ? `${next.kind} @ ${formatDate(next.from)}` : "—"}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex max-w-xl flex-wrap gap-1">
                      {scheduleStatus(c, now).map((s) => (
                        <Badge key={s.kind} variant={STATUS_VARIANT[s.status]} title={`${s.status} · ${formatDate(s.from)} → ${formatDate(s.until)}${s.sentAt ? ` · sent ${formatDate(s.sentAt)}` : ""}`}>{s.kind}: {s.status}</Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent sends / unsubscribes</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Event</TableHead><TableHead>User</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
            <TableBody>
              {recent.map((e) => {
                const p = (e.props ?? {}) as Record<string, unknown>;
                return (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.createdAt)}</TableCell>
                    <TableCell>{e.name}</TableCell>
                    <TableCell className="font-mono text-xs">{(e.userId && emailOf.get(e.userId)) ?? e.userId}</TableCell>
                    <TableCell className="text-xs">{[p.kind, p.subject, p.source].filter((x) => typeof x === "string").join(" · ")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
