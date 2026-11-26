import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerifiedNote, others } from "@/components/resources/compare-parts";
import { PageShell, RelatedLinks, linkCls } from "@/components/resources/shell";
import { COMPETITORS, VERIFIED_ON, alternativesPath, comparePath, getCompetitor, komendlyFacts, slugFromParam } from "@/lib/growth/organic/compare";
import { COMPARE_BASE } from "@/lib/growth/organic/registry";
import { breadcrumbJsonLd, graph } from "@/lib/seo/jsonld";

export const revalidate = 86400;
export const dynamicParams = false;
export function generateStaticParams() { return COMPETITORS.map((c) => ({ slug: `${c.slug}-alternatives` })); }
const get = async (p: Promise<{ slug: string }>) => getCompetitor(slugFromParam((await p).slug, "alternatives"));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await get(params); if (!c) return {};
  const description = `Looking for a ${c.name} alternative? When to stay with ${c.name}, and ${others(c.slug).length + 1} other options compared fairly, with sourced facts verified ${VERIFIED_ON}.`;
  return { title: `${c.name} Alternatives for Small Business Ads`, description, alternates: { canonical: alternativesPath(c) }, openGraph: { title: `${c.name} alternatives`, description, url: alternativesPath(c) } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const c = await get(params); if (!c) notFound();
  const path = alternativesPath(c);
  return (
    <PageShell crumbs={[{ name: "Home", href: "/" }, { name: "Compare", href: COMPARE_BASE }, { name: `${c.name} alternatives` }]} h1={`${c.name} alternatives for small business ads`} intro={`${c.name} suits some teams well. If it is not the right fit, here is who else to look at and why. We start with when you should stay.`} campaign={`alt-${c.slug}`}
      jsonLd={graph(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Compare", path: COMPARE_BASE }, { name: `${c.name} alternatives`, path }]))}>
      <section className="rounded-xl border border-border p-5"><h2 className="font-display text-xl font-medium">Stay with {c.name} if</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">{c.chooseThemWhen.map((x) => <li key={x}>{x}</li>)}</ul></section>
      <h2 className="font-display mt-10 text-2xl font-medium">Options to consider instead</h2>
      <ul className="mt-4 space-y-4">
        <li className="rounded-xl border border-border p-5"><p className="font-display text-xl font-medium">Komendly</p><p className="mt-1 text-sm text-muted-foreground">Finished Facebook and Instagram ads made from your website link. Best for: {c.chooseUsWhen[0]!.charAt(0).toLowerCase() + c.chooseUsWhen[0]!.slice(1)}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{komendlyFacts().slice(0, 2).map((f) => <li key={f}>{f}</li>)}</ul></li>
        {others(c.slug).map((o) => <li key={o.slug} className="rounded-xl border border-border p-5"><p className="font-display text-xl font-medium">{o.name}</p><p className="mt-1 text-sm text-muted-foreground">{o.summary} Good fit: {o.chooseThemWhen[0]!.charAt(0).toLowerCase() + o.chooseThemWhen[0]!.slice(1)}</p><p className="mt-2 text-sm"><Link className={linkCls} href={comparePath(o)}>Komendly vs {o.name}</Link></p></li>)}
      </ul>
      <VerifiedNote />
      <p className="mt-6 text-sm text-muted-foreground">Head to head: <Link className={linkCls} href={comparePath(c)}>Komendly vs {c.name}</Link>.</p>
      <RelatedLinks items={[{ href: COMPARE_BASE, label: "All comparisons" }, { href: "/tools", label: "Free ad tools" }, { href: "/ad-examples", label: "Ad examples" }]} />
    </PageShell>
  );
}
