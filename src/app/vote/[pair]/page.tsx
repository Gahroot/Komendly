import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HubShell } from "@/components/hubs/hub-shell";
import { ShareLink } from "@/components/hubs/share-link";
import { VoteButtons } from "@/components/hubs/vote-buttons";
import { loadFeaturedAds } from "@/lib/ads/feature-actions";
import { parsePairId } from "@/lib/growth/creative-hubs";
import { pairTally } from "@/lib/growth/creative-hubs-server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ pair: string }> };
export const metadata: Metadata = { title: "Ad showdown: which ad wins?", description: "Two real ads, one vote.", openGraph: { title: "Which ad wins?", description: "Two real ads, one vote." }, robots: { index: false, follow: true } };

export default async function Page({ params }: P) {
  const pair = decodeURIComponent((await params).pair);
  const ids = parsePairId(pair);
  if (!ids) notFound();
  const feats = await loadFeaturedAds(200);
  const [a, b] = ids.map((id) => feats.find((f) => f.adId === id));
  if (!a || !b) notFound();
  const tally = (await pairTally(pair)) ?? { a: 0, b: 0, total: 0, aPct: 0, bPct: 0 };
  return (
    <HubShell wide title="Which ad wins?" lead="Both ads were made with Komendly by customers who agreed to feature them.">
      <div className="grid gap-4 sm:grid-cols-2">
        {([["A", a], ["B", b]] as const).map(([l, x]) => (
          <figure key={l}><Image src={x.src} alt={x.headline} width={x.width} height={x.height} unoptimized className="h-auto w-full rounded-xl" /><figcaption className="mt-2 text-sm text-muted-foreground">{l}: {x.brandName ?? "A Komendly customer"}</figcaption></figure>
        ))}
      </div>
      <VoteButtons pair={pair} a={ids[0]} b={ids[1]} initial={tally} />
      <div className="mt-6 flex flex-wrap gap-3">
        <ShareLink url={`/vote/${pair}`} text="Which ad wins? Cast your vote." />
        <Link href="/free-ads?utm_source=hub&utm_medium=acquire&utm_campaign=vote" className="inline-flex h-10 items-center rounded-lg bg-[var(--studio-gold)] px-4 text-sm font-semibold text-[#2a0f10]">Make your own free ads</Link>
      </div>
    </HubShell>
  );
}
