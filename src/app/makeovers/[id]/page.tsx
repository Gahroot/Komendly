import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HubShell } from "@/components/hubs/hub-shell";
import { publicMakeover, readyAds } from "@/lib/growth/creative-hubs-server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const m = await publicMakeover((await params).id);
  if (!m) return { title: "Not found", robots: { index: false, follow: false } };
  // Unclaimed makeovers of a business's own public site stay noindex; claimed ones may be indexed.
  return { title: `Ad makeover: ${m.businessName}`, description: `A Komendly ad makeover of ${m.businessName}'s own public website.`, robots: m.basis === "claimed" ? undefined : { index: false, follow: true } };
}

export default async function Page({ params }: P) {
  const id = (await params).id;
  const m = await publicMakeover(id);
  if (!m) notFound();
  const ads = await readyAds(m.runId);
  return (
    <HubShell wide title={`Ad makeover: ${m.businessName}`} lead={m.basis === "claimed" ? "Made by Komendly and claimed by the business." : "An unofficial makeover by Komendly, built only from the business's own public website. Not endorsed by or affiliated with the business."}>
      {m.caption && <p className="mb-6 text-muted-foreground">{m.caption}</p>}
      <div className="grid gap-4 sm:grid-cols-3">{ads.map((a) => <Image key={a.id} src={`/api/hub/img/m.${id}/${a.assetId}`} alt={a.headline} width={a.width} height={a.height} unoptimized className="h-auto w-full rounded-xl" />)}</div>
      <p className="mt-8 text-sm text-muted-foreground">Are you {m.businessName}? <Link className="underline" href={`/makeover/takedown?ref=${id}`}>Take this down</Link> or <Link className="underline" href="/makeover">claim it</Link>.</p>
    </HubShell>
  );
}
