import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, linkCls } from "@/components/resources/shell";
import { COMPETITORS, VERIFIED_ON, alternativesPath, comparePath } from "@/lib/growth/organic/compare";
import { COMPARE_BASE } from "@/lib/growth/organic/registry";
import { breadcrumbJsonLd, graph } from "@/lib/seo/jsonld";

export const revalidate = 86400;
const DESC = `Fair, sourced comparisons of Komendly with Creatopy, Madgicx, Predis.ai and AdCreative.ai. Every competitor fact comes from the vendor's own public page, verified ${VERIFIED_ON}.`;
export const metadata: Metadata = { title: "Komendly Compared: Ad Creative Tools", description: DESC, alternates: { canonical: COMPARE_BASE }, openGraph: { title: "Komendly compared", description: DESC, url: COMPARE_BASE } };

export default function Page() {
  return (
    <PageShell crumbs={[{ name: "Home", href: "/" }, { name: "Compare" }]} h1="Komendly compared with other ad tools" intro={`We only state what the vendor shows on its own public pages (last verified ${VERIFIED_ON}) and we tell you when the other tool is the better choice.`} campaign="compare-hub"
      jsonLd={graph(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Compare", path: COMPARE_BASE }]))}>
      <ul className="space-y-3">{COMPETITORS.map((c) => <li key={c.slug} className="rounded-xl border border-border p-5"><p className="font-display text-xl font-medium">{c.name}</p><p className="mt-1 text-sm text-muted-foreground">{c.summary}</p><p className="mt-3 text-sm"><Link className={linkCls} href={comparePath(c)}>Komendly vs {c.name}</Link> · <Link className={linkCls} href={alternativesPath(c)}>{c.name} alternatives</Link></p></li>)}</ul>
    </PageShell>
  );
}
