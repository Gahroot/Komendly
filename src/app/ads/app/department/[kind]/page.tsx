import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { BONUS_META, BonusKindSchema, CHECKUP_AREAS, HOOK_LEVEL_LABELS, HOOK_LEVELS, type AdPlan, type HookLibrary, type WebsiteCheckup } from "@/lib/ads/bonuses/contracts";
import { loadBonusDetail, trackBonusViewed } from "@/lib/ads/bonuses/server";
import { AdsNav } from "@/components/ads/ads-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MakeAdButton, PrintButton, RerunCheckupButton } from "@/components/ads/ad-department/bonus-actions";

export const metadata = { title: "Your Ad Department", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const AREA_LABELS: Record<(typeof CHECKUP_AREAS)[number], string> = {
  headline: "Headline",
  offer: "Offer",
  proof: "Proof",
  cta: "Main button",
  speed_mobile: "Speed & phones",
  trust: "Trust",
  form_friction: "Getting in touch",
};

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function BonusPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: raw } = await params;
  const parsed = BonusKindSchema.safeParse(raw);
  if (!parsed.success) notFound();
  const kind = parsed.data;
  const user = await getCurrentUser();
  if (!user) redirect(`/ads/login?next=${encodeURIComponent(`/ads/app/department/${kind}`)}`);
  const ws = await getOrCreateWorkspace(user);
  const detail = await loadBonusDetail(ws, kind);
  if (!detail) redirect("/ads/pricing");
  if (detail.data) await trackBonusViewed(ws, user.id, kind, detail.version);
  const meta = BONUS_META[kind];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="print:hidden"><AdsNav signedIn /></div>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 print:max-w-none print:p-0">
        <div className="space-y-1">
          <Link href="/ads/app" className="text-sm text-muted-foreground hover:text-foreground print:hidden">← Your Ad Department</Link>
          <h1 className="text-3xl font-semibold tracking-tight">{meta.title}</h1>
          {detail.generatedAt ? <p className="text-sm text-muted-foreground">Made by Ozzy on {fmtDate(detail.generatedAt)}{detail.working ? " · a fresh version is on its way" : ""}</p> : null}
        </div>
        {!detail.data ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Ozzy is working on this. Check back in a few minutes.</CardContent></Card>
        ) : kind === "website_checkup" ? (
          <Checkup data={detail.data as WebsiteCheckup & { checkedUrl?: string }} rerunOn={detail.rerunOpensAt && !detail.working ? fmtDate(detail.rerunOpensAt) : null} working={detail.working} />
        ) : kind === "ad_plan" ? (
          <Plan data={detail.data as AdPlan} workspaceId={ws.id} />
        ) : (
          <Hooks data={detail.data as HookLibrary} />
        )}
      </main>
    </div>
  );
}

function Checkup({ data, rerunOn, working }: { data: WebsiteCheckup & { checkedUrl?: string }; rerunOn: string | null; working: boolean }) {
  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 pt-6">
        <p>{data.summary}</p>
        {working ? <p className="text-sm text-muted-foreground">Ozzy is checking your site again right now.</p> : <RerunCheckupButton disabledUntil={rerunOn} />}
      </CardContent></Card>
      <ol className="space-y-4">
        {data.fixes.map((f, i) => (
          <li key={f.area}>
            <Card className="break-inside-avoid">
              <CardHeader><CardTitle className="text-base font-semibold">{i + 1}. {f.title} <span className="ml-1 text-xs font-normal text-muted-foreground">{AREA_LABELS[f.area]}</span></CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="font-medium">What&apos;s wrong: </span>{f.whatsWrong}</p>
                <p><span className="font-medium">Why it matters: </span>{f.whyItMatters}</p>
                {f.rewrite ? <div className="rounded-md border bg-muted/40 p-3"><p className="text-xs font-medium text-muted-foreground">Use these words instead</p><p className="mt-1 whitespace-pre-line">{f.rewrite}</p></div> : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}

async function Plan({ data, workspaceId }: { data: AdPlan; workspaceId: string }) {
  const ads = await prisma.ad.findMany({ where: { workspaceId, id: { in: data.weeks.map((w) => w.adId) } }, select: { id: true, runId: true } });
  const runOf = new Map(ads.map((a) => [a.id, a.runId]));
  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 pt-6">
        <p>{data.summary}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">{data.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        <PrintButton />
      </CardContent></Card>
      {data.weeks.map((w) => {
        const runId = runOf.get(w.adId);
        return (
          <Card key={w.week} className="break-inside-avoid">
            <CardHeader><CardTitle className="text-base font-semibold">Week {w.week}: {w.adHeadline}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="font-medium">Why this ad: </span>{w.why}</p>
              <p><span className="font-medium">Spend: </span>${w.dailyBudgetUsd} a day</p>
              <div className="rounded-md border bg-muted/40 p-3"><p className="text-xs font-medium text-muted-foreground">Post text</p><p className="mt-1 whitespace-pre-line">{w.primaryText}</p><p className="mt-2 text-xs font-medium text-muted-foreground">Headline</p><p>{w.headline}</p></div>
              <p><span className="font-medium">When to judge it: </span>{w.judgeWhen}</p>
              {runId ? <Link href={`/ads/runs/${runId}`} className="text-sm underline print:hidden">See this ad</Link> : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Hooks({ data }: { data: HookLibrary }) {
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">For {data.industry}: {data.offer}</p>
      {HOOK_LEVELS.map((lv) => (
        <Card key={lv}>
          <CardHeader><CardTitle className="text-base font-semibold">{HOOK_LEVEL_LABELS[lv]}</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Hooks</p>
              <ul className="space-y-2">{data.hooks.filter((h) => h.level === lv).map((h) => (
                <li key={h.text} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"><span>{h.text}</span><MakeAdButton hook={h.text} /></li>
              ))}</ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Captions</p>
              <ul className="space-y-3">{data.captions.filter((c) => c.level === lv).map((c) => <li key={c.text} className="whitespace-pre-line rounded-md border bg-muted/40 p-3">{c.text}</li>)}</ul>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
