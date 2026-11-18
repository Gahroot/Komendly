import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, CtaBlock } from "@/components/ad-examples/parts";
import { MakeYoursUrlBox } from "@/components/ad-examples/url-box";
import { ToolRunner } from "@/components/tools/tool-runner";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { FREE_TOOLS, getFreeTool } from "@/lib/growth/free-tools";
import { toolCtaHref } from "@/lib/growth/free-tools-links";
import { freeToolsEnabled } from "@/lib/growth/free-tools-server";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd, freeToolJsonLd, graph } from "@/lib/seo/jsonld";
import "@/components/studio/studio.css";

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
  return FREE_TOOLS.map((t) => ({ slug: t.slug }));
}

interface PageProps { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const t = getFreeTool((await params).slug);
  if (!t) return {};
  const path = `/tools/${t.slug}`;
  return { title: t.title, description: t.description, alternates: { canonical: path }, openGraph: { title: t.title, description: t.description, url: path } };
}

export default async function ToolPage({ params }: PageProps) {
  const t = getFreeTool((await params).slug);
  if (!t) notFound();
  const on = await freeToolsEnabled();
  const path = `/tools/${t.slug}`;
  const others = FREE_TOOLS.filter((x) => x.slug !== t.slug);
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={graph(freeToolJsonLd({ name: t.name, description: t.description, path }), breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: t.name, path }]), faqJsonLd(t.faq, absoluteUrl(path)))} />
      <StudioNav signedIn={false} />
      <main className="px-4 sm:px-6">
        <header className="mx-auto max-w-3xl pt-8 text-center sm:pt-14">
          <div className="flex justify-center"><Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Free tools", href: "/tools" }, { name: t.name }]} /></div>
          <h1 className="font-display mt-5 text-balance text-[2.1rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">{t.name}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground sm:text-lg">{t.description}</p>
        </header>
        <section className="mx-auto mt-10 max-w-2xl" aria-label={t.name}>
          {on ? <ToolRunner slug={t.slug} /> : <p className="rounded-xl border border-border p-6 text-center text-muted-foreground">This tool is taking a short break. Back soon! Meanwhile, Ozzy can still make you 10 free ads from your website.</p>}
        </section>
        <section className="mx-auto mt-16 max-w-3xl text-center" aria-labelledby="next-title">
          <h2 id="next-title" className="font-display text-2xl font-medium sm:text-3xl">Turn this into finished ads</h2>
          <p className="mt-3 text-muted-foreground">Paste your website and Ozzy makes 10 ready-to-run image ads plus an animated one with your brand, photos and offers. Free, no card.</p>
          <div className="mt-6"><MakeYoursUrlBox href={toolCtaHref(t.slug, "url_box")} /></div>
        </section>
        <section className="mx-auto mt-16 max-w-3xl" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-2xl font-medium sm:text-3xl">Questions</h2>
          <div className="mt-6 divide-y divide-border rounded-xl border border-border">
            {t.faq.map((f) => (
              <details key={f.q} className="px-5 py-4"><summary className="cursor-pointer list-none font-medium">{f.q}</summary><p className="mt-2 text-sm text-muted-foreground">{f.a}</p></details>
            ))}
          </div>
        </section>
        <nav className="mx-auto mt-12 max-w-3xl" aria-label="More free tools">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">More free tools</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {others.map((o) => <li key={o.slug}><Link href={`/tools/${o.slug}`} className="inline-flex rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground">{o.name}</Link></li>)}
            <li><Link href="/ad-examples" className="inline-flex rounded-full px-3.5 py-1.5 text-sm text-[var(--studio-gold)] hover:underline">Ad examples by industry</Link></li>
          </ul>
        </nav>
        <div className="py-16"><CtaBlock title="Get 10 free ads from your website" campaign={t.slug} content="end" label="Make my free ads" href={toolCtaHref(t.slug, "end")} /></div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
