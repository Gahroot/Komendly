import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HubShell } from "@/components/hubs/hub-shell";
import { loadFeaturedAds } from "@/lib/ads/feature-actions";
import { pairId, pairUp } from "@/lib/growth/creative-hubs";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const empty = (await loadFeaturedAds(40).catch(() => [])).length < 2;
  return { title: "Ad showdown: vote for the better ad", description: "Two ads, one vote. Real ads that Komendly customers agreed to feature.", alternates: { canonical: "/vote" }, robots: empty ? { index: false, follow: true } : undefined };
}

export default async function Page() {
  const pairs = pairUp(await loadFeaturedAds(40));
  return (
    <HubShell wide title="Ad showdown" lead="Two ads made by Komendly customers who agreed to feature them. Pick the one you'd stop scrolling for.">
      {pairs.length === 0 ? <p className="text-muted-foreground">No showdowns yet. They appear as customers approve featuring their ads.</p> : (
        <ul className="grid gap-6 sm:grid-cols-2">
          {pairs.map(([a, b]) => (
            <li key={pairId(a.adId, b.adId)}>
              <Link href={`/vote/${pairId(a.adId, b.adId)}`} className="block rounded-2xl border border-border p-3 hover:bg-white/[0.04]">
                <div className="grid grid-cols-2 gap-2">
                  {[a, b].map((x) => <Image key={x.adId} src={x.src} alt={x.headline} width={x.width} height={x.height} unoptimized className="h-auto w-full rounded-lg" />)}
                </div>
                <p className="mt-3 text-sm font-medium">Vote →</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HubShell>
  );
}
