import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FactList, VerifiedNote } from "@/components/resources/compare-parts";
import { PageShell, RelatedLinks, linkCls } from "@/components/resources/shell";
import { COMPETITORS, VERIFIED_ON, alternativesPath, comparePath, getCompetitor, komendlyFacts, slugFromParam } from "@/lib/growth/organic/compare";
import { COMPARE_BASE } from "@/lib/growth/organic/registry";
import { breadcrumbJsonLd, graph } from "@/lib/seo/jsonld";

export const revalidate = 86400;
export const dynamicParams = false;
export function generateStaticParams() { return COMPETITORS.map((c) => ({ slug: `komendly-vs-${c.slug}` })); }
const get = async (p: Promise<{ slug: string }>) => getCompetitor(slugFromParam((await p).slug, "compare"));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await get(params); if (!c) return {};
  const description = `Komendly vs ${c.name}: what each is for, what ${c.name} lists on its public pricing page (verified ${VERIFIED_ON}), and when ${c.name} is the better choice.`;
  return { title: `Komendly vs ${c.name}: Honest Comparison`, description, alternates: { canonical: comparePath(c) }, openGraph: { title: `Komendly vs ${c.name}`, description, url: comparePath(c) } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const c = await get(params); if (!c) notFound();
  const path = comparePath(c);
  return (
    <PageShell crumbs={[{ name: "Home", href: "/" }, { name: "Compare", href: COMPARE_BASE }, { name: `vs ${c.name}` }]} h1={`Komendly vs ${c.name}`} intro={`${c.name} is ${c.summary.charAt(0).toLowerCase()}${c.summary.slice(1)} Komendly makes finished Facebook and Instagram ads from your website. Here is how they differ.`} campaign={`vs-${c.slug}`}
      jsonLd={graph(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Compare", path: COMPARE_BASE }, { name: `Komendly vs ${c.name}`, path }]))}>
      <section><h2 className="font-display text-2xl font-medium">What {c.name} lists publicly</h2><FactList c={c} /></section>
      <section className="mt-10"><h2 className="font-display text-2xl font-medium">What Komendly offers</h2>
        <ul className="mt-3 space-y-2 text-sm">{komendlyFacts().map((f) => <li key={f} className="rounded-lg border border-border p-3">{f}</li>)}</ul></section>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border p-5"><h2 className="font-display text-xl font-medium">Choose {c.name} if</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">{c.chooseThemWhen.map((x) => <li key={x}>{x}</li>)}</ul></section>
        <section className="rounded-xl border border-border p-5"><h2 className="font-display text-xl font-medium">Choose Komendly if</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">{c.chooseUsWhen.map((x) => <li key={x}>{x}</li>)}</ul></section>
      </div>
      <VerifiedNote />
      <p className="mt-6 text-sm text-muted-foreground">See also <Link className={linkCls} href={alternativesPath(c)}>{c.name} alternatives</Link>.</p>
      <RelatedLinks items={[{ href: "/ad-examples", label: "Real ad examples" }, { href: "/tools", label: "Free ad tools" }, { href: "/ads/pricing", label: "Komendly pricing" }]} />
    </PageShell>
  );
}
