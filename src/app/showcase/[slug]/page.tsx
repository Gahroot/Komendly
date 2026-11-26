import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HubShell } from "@/components/hubs/hub-shell";
import { ShareLink } from "@/components/hubs/share-link";
import { publishEnabled, readyAds, showcaseBySlug } from "@/lib/growth/creative-hubs-server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

// Existence is only revealed once the owner opted in (404 otherwise); noindex until then is implied by the 404.
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const s = (await publishEnabled()) ? await showcaseBySlug((await params).slug) : null;
  if (!s) return { title: "Not found", robots: { index: false, follow: false } };
  return { title: `${s.title}: ads made with Komendly`, description: s.blurb || `Ads from ${s.title}, shared by the business.`, alternates: { canonical: `/showcase/${s.slug}` }, openGraph: { title: s.title } };
}

export default async function Page({ params }: P) {
  const s = (await publishEnabled()) ? await showcaseBySlug((await params).slug) : null;
  if (!s) notFound();
  const ads = await readyAds("", s.adIds);
  return (
    <HubShell wide title={s.title} lead={s.blurb || undefined}>
      <div className="grid gap-4 sm:grid-cols-3">{ads.map((a) => <figure key={a.id}><Image src={`/api/hub/img/${encodeURIComponent(`s.${s.slug}`)}/${a.assetId}`} alt={a.headline} width={a.width} height={a.height} unoptimized className="h-auto w-full rounded-xl" /></figure>)}</div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/free-ads?utm_source=showcase&utm_medium=acquire&utm_campaign=showcase" className="inline-flex h-11 items-center rounded-xl bg-[var(--studio-gold)] px-5 font-semibold text-[#2a0f10]">Make your own free ads</Link>
        <ShareLink url={`/showcase/${s.slug}`} text={`${s.title}: ads made with Komendly`} />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Shared by the business. <Link className="underline" href="/makeover/takedown">Report a problem</Link></p>
    </HubShell>
  );
}
