import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/ads/billing-auth";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { PostActionButton } from "../_components/post-action-button";
import { AdminEmpty } from "../../_components/admin-empty";

export const dynamic = "force-dynamic";

export default async function AdminAdsInboxPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const sp = await searchParams;
  return (
    <AdminAdsShell title="Inbox" description="Replies to Nolan's emails (Resend inbound), newest first. Repliers stop getting marketing drips. Times UTC.">
      <Inbox showAll={sp.all === "1"} />
    </AdminAdsShell>
  );
}

const ts = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const p = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const s = (v: unknown): string => (typeof v === "string" ? v : "");

async function Inbox({ showAll }: { showAll: boolean }) {
  if (!(await getAdminUser())) return null;
  const [replies, handledEv] = await Promise.all([
    prisma.adsEvent.findMany({ where: { name: "email_replied" }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.adsEvent.findMany({ where: { name: "email_reply_handled" }, select: { props: true } }),
  ]);
  const handled = new Set(handledEv.map((e) => s(p(e.props).emailId)));
  const unread = replies.filter((r) => !handled.has(s(p(r.props).emailId))).length;
  const shown = showAll ? replies : replies.filter((r) => !handled.has(s(p(r.props).emailId)));

  const userIds = [...new Set(shown.map((r) => r.userId).filter((x): x is string => Boolean(x)))];
  const wsIds = [...new Set(shown.map((r) => r.workspaceId).filter((x): x is string => Boolean(x)))];
  const [users, workspaces, sent] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true, plan: true, subscriptionStatus: true } }),
    prisma.adsWorkspace.findMany({ where: { id: { in: wsIds } }, select: { id: true, name: true, adsPlan: true, subscriptionStatus: true } }),
    userIds.length
      ? prisma.adsEvent.findMany({ where: { name: "email_sent", userId: { in: userIds } }, orderBy: { createdAt: "desc" }, distinct: ["userId"], select: { userId: true, props: true, createdAt: true } })
      : Promise.resolve([]),
  ]);
  const userBy = new Map(users.map((u) => [u.id, u]));
  const wsBy = new Map(workspaces.map((w) => [w.id, w]));
  const lastSentBy = new Map(sent.map((e) => [e.userId, e]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant={unread ? "destructive" : "secondary"}>{unread} unread</Badge>
        <span className="text-muted-foreground">{replies.length} replies total</span>
        <Link className="hover:underline" href={showAll ? "/admin/ads/inbox" : "/admin/ads/inbox?all=1"}>{showAll ? "Show unread only" : "Show handled too"}</Link>
      </div>
      {!shown.length && <AdminEmpty>No {showAll ? "" : "unread "}replies.</AdminEmpty>}
      {shown.map((r) => {
        const pr = p(r.props);
        const emailId = s(pr.emailId);
        const u = r.userId ? userBy.get(r.userId) : undefined;
        const w = r.workspaceId ? wsBy.get(r.workspaceId) : undefined;
        const last = r.userId ? lastSentBy.get(r.userId) : undefined;
        const lp = p(last?.props);
        const at = s(pr.receivedAt) ? new Date(s(pr.receivedAt)) : r.createdAt;
        return (
          <Card key={r.id}>
            <CardContent className="space-y-2 pt-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {s(pr.fromName) || s(pr.from)} <span className="text-muted-foreground">&lt;{s(pr.from)}&gt;</span>
                    {handled.has(emailId) ? <Badge variant="outline" className="ml-2">handled</Badge> : <Badge className="ml-2">new</Badge>}
                  </div>
                  <div className="text-muted-foreground">{ts(Number.isFinite(at.getTime()) ? at : r.createdAt)} UTC · {s(pr.subject) || "(no subject)"}</div>
                </div>
                {!handled.has(emailId) && emailId && <PostActionButton url="/api/admin/ads/inbox" body={{ emailId }} label="Mark handled" />}
              </div>
              <div className="text-xs text-muted-foreground">
                {u ? (
                  <>
                    User: {u.name ? `${u.name} · ` : ""}{u.email} · testimonials {u.plan}/{u.subscriptionStatus}
                    {w && <> · workspace <Link className="hover:underline" href={`/admin/ads/workspaces/${w.id}`}>{w.name}</Link> ({w.adsPlan}/{w.subscriptionStatus})</>}
                  </>
                ) : (
                  "Unknown sender (no matching user)"
                )}
                {last && <> · last email we sent: <span className="font-mono">{s(lp.kind) || "?"}</span>{s(lp.subject) ? ` "${s(lp.subject)}"` : ""} ({ts(last.createdAt)})</>}
              </div>
              <pre className="whitespace-pre-wrap rounded bg-muted p-3 font-sans">{s(pr.text) || "(empty)"}</pre>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
