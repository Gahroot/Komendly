import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ads/billing-format";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { AdminEmpty } from "../../_components/admin-empty";

export const dynamic = "force-dynamic";

export default async function AdminAdsChurnPage() {
  return (
    <AdminAdsShell title="Churn" description="Canceled and past-due workspaces, with the cancellation reason when Stripe has one.">
      <Churn />
    </AdminAdsShell>
  );
}

function reasonOf(props: unknown): string {
  if (!props || typeof props !== "object") return "—";
  const p = props as Record<string, unknown>;
  return [p.feedback, p.reason, p.comment].filter((x): x is string => typeof x === "string" && x.length > 0).join(" · ") || "—";
}

async function Churn() {
  const rows = await prisma.adsWorkspace.findMany({
    where: { subscriptionStatus: { in: ["canceled", "past_due", "unpaid"] } },
    orderBy: [{ canceledAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: { id: true, name: true, adsPlan: true, subscriptionStatus: true, canceledAt: true, currentPeriodEnd: true },
  });
  const events = await prisma.adsEvent.findMany({
    where: { name: "churned", workspaceId: { in: rows.map((r) => r.id) } },
    orderBy: { createdAt: "desc" },
    select: { workspaceId: true, props: true },
  });
  const reasons = new Map<string, string>();
  for (const e of events) if (e.workspaceId && !reasons.has(e.workspaceId)) reasons.set(e.workspaceId, reasonOf(e.props));
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Workspace</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Canceled</TableHead><TableHead>Period end</TableHead><TableHead>Reason</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Link className="hover:underline" href={`/admin/ads/workspaces/${r.id}`}>{r.name}</Link></TableCell>
                <TableCell>{r.adsPlan}</TableCell>
                <TableCell><Badge variant={r.subscriptionStatus === "canceled" ? "secondary" : "destructive"}>{r.subscriptionStatus}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{formatDate(r.canceledAt)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(r.currentPeriodEnd)}</TableCell>
                <TableCell className="text-muted-foreground">{reasons.get(r.id) ?? "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={6}><AdminEmpty>Nobody&apos;s churned or past due. Good stuff.</AdminEmpty></TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
