import { prisma } from "@/lib/prisma";
import { publicFeatureImageUrl } from "@/lib/ads/feature-assets";
import { defaultCaption } from "@/lib/ads/features";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { FeatureQueueCard, type FeatureQueueItem } from "../_components/feature-queue-card";

export const dynamic = "force-dynamic";

const TABS = ["queue", "featured", "declined"] as const;

export default async function AdminFeaturesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const q = await searchParams;
  const tab = TABS.find((t) => t === q.tab) ?? "queue";
  const statuses = tab === "queue" ? ["shortlisted", "consented"] : tab === "featured" ? ["featured"] : ["declined", "withdrawn"];
  const rows = await prisma.adsFeature.findMany({ where: { status: { in: statuses } }, orderBy: [{ status: "desc" }, { featuredAt: "desc" }, { consentAt: "desc" }], take: 120 });
  const [ads, users] = await Promise.all([
    prisma.ad.findMany({ where: { id: { in: rows.map((r) => r.adId) } }, select: { id: true, headline: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, email: true } }),
  ]);
  const headline = new Map(ads.map((a) => [a.id, a.headline]));
  const email = new Map(users.map((u) => [u.id, u.email]));
  const items: FeatureQueueItem[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    brandName: r.brandName,
    handle: r.handle,
    headline: headline.get(r.adId) ?? "",
    caption: r.caption ?? defaultCaption(r.brandName, r.handle),
    postUrl: r.postUrl,
    imageUrl: publicFeatureImageUrl(r.adId),
    consentAt: r.consentAt.toISOString(),
    email: email.get(r.userId) ?? "",
  }));
  return (
    <AdminAdsShell title="Ad of the week" description="Ads users consented to show (public examples + socials). Post manually, then paste the post URL and Feature: the owner gets an email and an in-app badge.">
      <nav className="flex gap-2 text-sm">
        {TABS.map((t) => <a key={t} href={`?tab=${t}`} className={`rounded-md border px-3 py-1 ${t === tab ? "bg-primary text-primary-foreground" : ""}`}>{t}</a>)}
      </nav>
      {tab === "declined" && <p className="text-sm text-muted-foreground">Declined/withdrawn images are not served publicly, so previews show as broken here.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((i) => <FeatureQueueCard key={i.id} item={i} />)}
      </div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
    </AdminAdsShell>
  );
}
