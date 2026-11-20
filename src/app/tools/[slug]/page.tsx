import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, CtaBlock } from "@/components/ad-examples/parts";
import { MakeYoursUrlBox } from "@/components/ad-examples/url-box";
import { ToolRunner } from "@/components/tools/tool-runner";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { AD_SIZE_GUIDE, FREE_TOOLS, LEGACY_TOOL_SLUGS, getFreeTool, type FreeTool } from "@/lib/growth/free-tools";
import { alsoCalled, anchorText, vocab, type VocabEntry } from "@/lib/growth/vocabulary";
import { toolCtaHref } from "@/lib/growth/free-tools-links";
import { freeToolsEnabled } from "@/lib/growth/free-tools-server";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd, freeToolJsonLd, graph } from "@/lib/seo/jsonld";
import "@/components/studio/studio.css";

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
  return [...FREE_TOOLS.map((t) => t.slug), ...Object.keys(LEGACY_TOOL_SLUGS)].map((slug) => ({ slug }));
}

interface PageProps { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const r = resolve((await params).slug);
  if (!r) return {};
  const { t, v } = r;
  const path = `/tools/${t.slug}`;
  return { title: v.title, description: t.description, alternates: { canonical: path }, openGraph: { title: v.title, description: t.description, url: path } };
}

function resolve(slug: string): { t: FreeTool; v: VocabEntry } | null {
  const t = getFreeTool(slug);
  const v = t ? vocab(`tool:${t.slug}`) : undefined;
  return t && v ? { t, v } : null;
}

export default async function ToolPage({ params }: PageProps) {
  const slug = (await params).slug;
  if (LEGACY_TOOL_SLUGS[slug]) permanentRedirect(`/tools/${LEGACY_TOOL_SLUGS[slug]}`);
  const r = resolve(slug);
  if (!r) notFound();
  const { t, v } = r;
  const faq = [...v.faq, ...t.faq];
  const also = alsoCalled(v, 6);
  const on = await freeToolsEnabled();
  const path = `/tools/${t.slug}`;
  const others = FREE_TOOLS.filter((x) => x.slug !== t.slug);
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={graph(freeToolJsonLd({ name: t.name, description: t.description, path }), breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: t.name, path }]), faqJsonLd(faq, absoluteUrl(path)))} />
      <StudioNav signedIn={false} />
      <main className="px-4 sm:px-6">
        <header className="mx-auto max-w-3xl pt-8 text-center sm:pt-14">
          <div className="flex justify-center"><Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Free tools", href: "/tools" }, { name: t.name }]} /></div>
          <h1 className="font-display mt-5 text-balance text-[2.1rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">{v.h1}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground sm:text-lg">{v.intro}</p>
          {also && <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">{also}</p>}
        </header>
        <section className="mx-auto mt-10 max-w-2xl" aria-label={t.name}>
          {on ? <ToolRunner slug={t.slug} /> : <p className="rounded-xl border border-border p-6 text-center text-muted-foreground">This tool is taking a short break. Back soon! Meanwhile, Ozzy can still make you free ads from your website.</p>}
        </section>
        {t.related?.length ? (
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
            Pairs well with:{" "}
            {t.related.map((r, i) => <span key={r}>{i > 0 && " · "}<Link href={`/tools/${r}`} className="text-[var(--studio-gold)] hover:underline">{anchorText(`tool:${r}`, `tool:${t.slug}`)}</Link></span>)}
          </p>
        ) : null}
        {t.slug === "ad-size-guide" && <SizeGuide />}
        <section className="mx-auto mt-14 max-w-3xl" aria-labelledby="tips-title">
          <h2 id="tips-title" className="font-display text-2xl font-medium sm:text-3xl">Tips that make it work</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">{v.guidance.map((g) => <li key={g}>{g}</li>)}</ul>
        </section>
        <section className="mx-auto mt-16 max-w-3xl text-center" aria-labelledby="next-title">
          <h2 id="next-title" className="font-display text-2xl font-medium sm:text-3xl">Turn this into finished ads</h2>
          <p className="mt-3 text-muted-foreground">Paste your website and Ozzy makes 10 ready-to-run image ads plus an animated one with your brand, photos and offers. Free, no card.</p>
          <div className="mt-6"><MakeYoursUrlBox href={toolCtaHref(t.slug, "url_box")} /></div>
        </section>
        <section className="mx-auto mt-16 max-w-3xl" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-2xl font-medium sm:text-3xl">Questions</h2>
          <div className="mt-6 divide-y divide-border rounded-xl border border-border">
            {faq.map((f) => (
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
        <div className="py-16"><CtaBlock title="Get free ads from your website" campaign={t.slug} content="end" label="Make my free ads" href={toolCtaHref(t.slug, "end")} /></div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}

function SizeGuide() {
  return (
    <section className="mx-auto mt-14 max-w-3xl" aria-labelledby="sizes-title">
      <h2 id="sizes-title" className="font-display text-2xl font-medium sm:text-3xl">Ad sizes by platform</h2>
      <ul className="mt-4 flex flex-wrap gap-2 text-sm">
        {AD_SIZE_GUIDE.map((g) => <li key={g.id}><a href={`#${g.id}`} className="inline-flex rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-foreground">{g.platform}</a></li>)}
      </ul>
      {AD_SIZE_GUIDE.map((g) => (
        <div key={g.id} id={g.id} className="mt-8 scroll-mt-24">
          <h3 className="font-display text-xl font-medium">{g.question}</h3>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Format</th><th className="px-4 py-2 font-medium">Size (px)</th><th className="px-4 py-2 font-medium">Ratio</th><th className="px-4 py-2 font-medium">Note</th></tr></thead>
              <tbody>{g.specs.map((s) => <tr key={s.format} className="border-t border-border"><td className="px-4 py-2">{s.format}</td><td className="px-4 py-2 font-mono">{s.size}</td><td className="px-4 py-2">{s.ratio}</td><td className="px-4 py-2 text-muted-foreground">{s.note ?? ""}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
