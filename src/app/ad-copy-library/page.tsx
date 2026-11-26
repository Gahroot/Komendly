import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, RelatedLinks, linkCls } from "@/components/resources/shell";
import { COPY_LIBRARY } from "@/lib/growth/organic/copy-library";
import { COPY_LIBRARY_BASE } from "@/lib/growth/organic/registry";
import { PLAYBOOKS } from "@/lib/growth/trade-playbooks-data";
import { breadcrumbJsonLd, graph } from "@/lib/seo/jsonld";

export const revalidate = 3600;
const DESC = "Hand-written Facebook and Instagram ad headlines and primary text for local trades: roofers, plumbers, HVAC, dentists, salons, auto repair, restaurants and real estate. Copy, fill in the blanks, run.";
export const metadata: Metadata = { title: "Ad Headline and Copy Library for Local Businesses", description: DESC, alternates: { canonical: COPY_LIBRARY_BASE }, openGraph: { title: "Ad headline and copy library", description: DESC, url: COPY_LIBRARY_BASE } };

export default function Page() {
  return (
    <PageShell crumbs={[{ name: "Home", href: "/" }, { name: "Ad copy library" }]} h1="Ad headline and copy library" intro="Curated headlines and ad text by trade, grouped by the angle they use. Every line is written by hand with blanks for your details." campaign="ad-copy-library"
      jsonLd={graph(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Ad copy library", path: COPY_LIBRARY_BASE }]))}>
      <ul className="grid gap-4 sm:grid-cols-2">
        {COPY_LIBRARY.map((c) => { const p = PLAYBOOKS.find((x) => x.slug === c.slug)!; return (
          <li key={c.slug}><Link href={`${COPY_LIBRARY_BASE}/${c.slug}`} className="studio-frame block rounded-xl p-5 hover:brightness-110"><p className="font-display text-xl font-medium">{p.term.charAt(0).toUpperCase() + p.term.slice(1)} ad copy</p><p className="mt-1 text-sm text-muted-foreground">{c.headlines.length} headlines · {c.primaryTexts.length} ad texts</p></Link></li>); })}
      </ul>
      <p className="mt-8 text-sm text-muted-foreground">Looking for another trade? <Link href="/ad-inspiration" className={linkCls}>Search every hook and offer</Link>.</p>
      <RelatedLinks items={[{ href: "/tools/ad-copy-generator", label: "Ad copy generator" }, { href: "/tools/ad-character-counter", label: "Ad character counter" }, { href: "/ad-examples", label: "Ad examples" }]} />
    </PageShell>
  );
}
