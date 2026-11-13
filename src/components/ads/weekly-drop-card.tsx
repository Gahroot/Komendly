// "This week's ads" (latest Weekly Drop run) for Ad Department members; a locked teaser for everyone else.
import Link from "next/link";
import { Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdDepartment, WEEKLY_KIND, WEEKLY_TEASER, weeklyDropTitle } from "@/lib/ads/weekly-drop";

export async function WeeklyDropCard({ workspace }: { workspace: { id: string; adsPlan: string; subscriptionStatus: string; suspendedAt?: Date | null } }) {
  if (!isAdDepartment(workspace)) {
    return (
      <Link href="/ads/pricing" className="block">
        <Card className="border-dashed transition-colors hover:border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold"><Lock aria-hidden className="size-4" /> This week&apos;s ads</CardTitle>
            <CardDescription>{WEEKLY_TEASER} See plans.</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    );
  }
  const run = await prisma.adRun.findFirst({
    where: { workspaceId: workspace.id, kind: WEEKLY_KIND },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, status: true, ads: { where: { status: "ready", kind: "static" }, orderBy: { index: "asc" }, take: 5, select: { id: true, headline: true, assets: { where: { mime: { startsWith: "image/" } }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true } } } } },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">This week&apos;s ads</CardTitle>
        <CardDescription>{run ? weeklyDropTitle(run.createdAt) : "Ozzy makes 6 new ads for you every Monday."}</CardDescription>
      </CardHeader>
      <CardContent>
        {!run ? (
          <p className="text-sm text-muted-foreground">Your first Weekly Drop is on its way. Make a run from your website so Ozzy knows your brand.</p>
        ) : run.ads.length === 0 ? (
          <p className="text-sm text-muted-foreground">{["completed", "partial", "failed", "canceled"].includes(run.status) ? "No ads this week." : "Ozzy is making this week's ads. We'll email you when they're ready."}</p>
        ) : (
          <Link href={`/ads/runs/${run.id}`} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {run.ads.map((a) => (a.assets[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={a.id} src={`/api/ads/assets/${a.assets[0].id}/preview`} alt={a.headline} loading="lazy" className="aspect-[4/5] w-full rounded-lg object-cover" />
            ) : null))}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
