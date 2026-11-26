import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarTool, InspirationTool, OfferTool, QuizTool, ResizerTool } from "./tools";
import { Faq, PageShell, RelatedLinks, linkCls } from "./shell";
import { TEMPLATE_LAYOUTS, TEMPLATE_SIZES, templatePath } from "@/lib/growth/organic/templates";
import { RESOURCE_TOOLS, embedPath, getResource, resourcePath, type ResourceSlug } from "@/lib/growth/organic/registry";
import { absoluteUrl, SITE_URL } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd, freeToolJsonLd, graph } from "@/lib/seo/jsonld";

export function resourceMetadata(slug: ResourceSlug): Metadata {
  const t = getResource(slug)!;
  const path = resourcePath(slug);
  return { title: t.h1, description: t.description, alternates: { canonical: path }, openGraph: { title: t.h1, description: t.description, url: path } };
}

export function ToolBody({ slug }: { slug: string }) {
  switch (slug) {
    case "marketing-offer-generator": return <OfferTool />;
    case "marketing-calendar-generator": return <CalendarTool />;
    case "ad-image-resizer": return <ResizerTool />;
    case "marketing-playbook-quiz": return <QuizTool />;
    case "ad-inspiration": return <InspirationTool />;
    default: return null;
  }
}

/** Iframe snippet with a visible backlink, for sites that want to embed a tool. */
export function embedSnippet(slug: string, title: string): string {
  return `<iframe src="${SITE_URL}${embedPath(slug)}" title="${title}" width="100%" height="720" style="border:0;max-width:720px" loading="lazy"></iframe>\n<p><a href="${SITE_URL}${resourcePath(slug)}?utm_source=embed&utm_medium=referral&utm_campaign=${slug}">${title} by Komendly</a></p>`;
}
export function EmbedBox({ slug, title }: { slug: string; title: string }) {
  return (
    <section className="mt-14" aria-labelledby="embed-title">
      <h2 id="embed-title" className="font-display text-2xl font-medium sm:text-3xl">Embed this tool on your site</h2>
      <p className="mt-2 text-sm text-muted-foreground">Free to embed. Keep the link underneath it; it is how people find the full tool.</p>
      <textarea readOnly rows={4} className="mt-4 w-full rounded-xl border border-border bg-white/5 p-3 font-mono text-xs" value={embedSnippet(slug, title)} aria-label="Embed code" />
    </section>
  );
}

export function ResourceToolPage({ slug }: { slug: ResourceSlug }) {
  const t = getResource(slug);
  if (!t) notFound();
  const path = resourcePath(slug);
  return (
    <PageShell crumbs={[{ name: "Home", href: "/" }, { name: "Free tools", href: "/tools" }, { name: t.name }]} h1={t.h1} intro={t.intro} campaign={slug}
      jsonLd={graph(freeToolJsonLd({ name: t.name, description: t.description, path }), breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: t.name, path }]), faqJsonLd(t.faq, absoluteUrl(path)))}>
      {slug === "ad-templates" ? <TemplateGrid /> : <ToolBody slug={slug} />}
      <section className="mt-14" aria-labelledby="tips-title">
        <h2 id="tips-title" className="font-display text-2xl font-medium sm:text-3xl">Tips that make it work</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">{t.tips.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
      {t.embeddable && <EmbedBox slug={slug} title={t.name} />}
      <Faq items={t.faq} />
      <RelatedLinks items={[...RESOURCE_TOOLS.filter((x) => x.slug !== slug).map((x) => ({ href: resourcePath(x.slug), label: x.name })), { href: "/ad-copy-library", label: "Ad copy library" }, { href: "/ad-inspiration", label: "Ad inspiration search" }, { href: "/tools", label: "All free tools" }]} />
    </PageShell>
  );
}

function TemplateGrid() {
  return (
    <div className="space-y-8">
      {TEMPLATE_LAYOUTS.map((l) => (
        <section key={l.id} className="rounded-xl border border-border p-5">
          <h2 className="font-display text-xl font-medium">{l.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Best for: {l.best}</p>
          <ul className="mt-4 flex flex-wrap gap-3">
            {TEMPLATE_SIZES.map((s) => <li key={s.id}><a className={`${linkCls} inline-flex rounded-full border border-border px-4 py-2 text-sm`} href={templatePath(l.id, s.id)} download>{s.label} (SVG)</a></li>)}
          </ul>
        </section>
      ))}
      <p className="text-sm text-muted-foreground">Prefer finished ads? <Link href="/free-ads" className={linkCls}>Ozzy makes them from your website</Link>.</p>
    </div>
  );
}
