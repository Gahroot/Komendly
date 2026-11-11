import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdCard, Breadcrumbs, CtaBlock } from "@/components/ad-examples/parts";
import { JsonLd } from "@/components/json-ld";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { getBlogPosts, tagSlug, type BlogPostMeta } from "@/lib/blog";
import { loadGalleryAds, summarizeIndustries } from "@/lib/ads/gallery";
import { MIN_INDEXABLE_INDUSTRY_ADS, getIndustry, industryGuide, industryTagSlugs, relatedIndustries, type Industry } from "@/lib/ads/industries";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd, galleryPageJsonLd, graph } from "@/lib/seo/jsonld";
import "@/components/studio/studio.css";

// Programmatic SEO page per industry. Rendered for any known industry; noindex below MIN_INDEXABLE_INDUSTRY_ADS consented ads.
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ industry: string }>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const titleCase = (s: string) => s.split(" ").map((w) => (w === "and" ? w : cap(w))).join(" ");

async function load(slug: string) {
  const industry = getIndustry(slug);
  if (!industry) return null;
  const all = await loadGalleryAds();
  const ads = all.filter((a) => a.industry === industry.slug);
  const available = new Set(summarizeIndustries(all).map((x) => x.industry.slug));
  return { industry, ads, available };
}

function description(i: Industry, count: number): string {
  return count > 0
    ? `${count} real Facebook and Instagram ${count === 1 ? "ad" : "ads"} made by ${i.plural}, with what each one does well, hooks and offers that fit, and a free way to make your own.`
    : `Real Facebook and Instagram ads made by ${i.plural}, with what to show, hooks and offers that fit, and a free way to make your own.`;
}

function relatedPosts(i: Industry): BlogPostMeta[] {
  const wanted = industryTagSlugs(i);
  return getBlogPosts()
    .map((p) => ({ p, score: p.tags.reduce((n, t) => { const k = wanted.indexOf(tagSlug(t)); return k < 0 ? n : n + (k < 4 ? 5 : 1); }, 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.date.localeCompare(a.p.date))
    .slice(0, 3)
    .map((x) => x.p);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await load((await params).industry);
  if (!data) return {};
  const { industry: i, ads } = data;
  const path = `/ad-examples/${i.slug}`;
  const title = `Facebook Ad Examples for ${titleCase(i.plural)}${ads.length ? ` (${ads.length} real ${ads.length === 1 ? "ad" : "ads"})` : ""}`;
  const first = ads[0];
  return {
    title,
    description: description(i, ads.length),
    alternates: { canonical: path },
    openGraph: { title, description: description(i, ads.length), url: path, ...(first ? { images: [{ url: absoluteUrl(first.src), width: first.width, height: first.height, alt: `${first.brandName} ad` }] } : {}) },
    twitter: { card: "summary_large_image", title, ...(first ? { images: [absoluteUrl(first.src)] } : {}) },
    ...(ads.length < MIN_INDEXABLE_INDUSTRY_ADS ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function IndustryPage({ params }: PageProps) {
  const data = await load((await params).industry);
  if (!data) notFound();
  const { industry: i, ads, available } = data;
  const guide = industryGuide(i);
  const path = `/ad-examples/${i.slug}`;
  const related = relatedIndustries(i, available);
  const posts = relatedPosts(i);
  const h1 = `Facebook ad examples for ${i.plural}`;

  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd
        data={graph(
          galleryPageJsonLd({
            name: h1,
            description: description(i, ads.length),
            path,
            items: ads.map((a) => ({ name: a.brandName, url: path, image: { url: a.src, caption: a.headline, width: a.width, height: a.height } })),
          }),
          breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }, { name: cap(i.plural), path }]),
          faqJsonLd(guide.faq, absoluteUrl(path)),
        )}
      />
      <StudioNav signedIn={false} />
      <main>
        <header className="mx-auto max-w-3xl px-4 pt-8 text-center sm:px-6 sm:pt-14">
          <div className="flex justify-center"><Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Ad examples", href: "/ad-examples" }, { name: cap(i.plural) }]} /></div>
          <h1 className="font-display mt-5 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">
            Facebook ad examples for <span className="text-[var(--studio-gold)]">{i.plural}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">{guide.intro}</p>
          {ads.length > 0 && <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-[var(--studio-gold)]">{ads.length} real {ads.length === 1 ? "ad" : "ads"} · shared with permission</p>}
        </header>

        <section className="mx-auto mt-12 max-w-6xl px-4 sm:px-6" aria-label={`Ad examples for ${i.plural}`}>
          {ads.length > 0 ? (
            <ul className="mx-auto grid max-w-sm gap-x-5 gap-y-10 sm:max-w-none sm:grid-cols-2 lg:grid-cols-3">
              {ads.map((a, n) => <AdCard key={a.adId} ad={a} eager={n < 2} />)}
            </ul>
          ) : (
            <div className="mx-auto max-w-xl text-center">
              <Image src="/brand/ozzy-explorer-focused.png" alt="" width={110} height={110} unoptimized className="mx-auto [image-rendering:pixelated]" />
              <p className="mt-4 text-muted-foreground">No {i.singular} ads shared yet. Yours could be the first.</p>
            </div>
          )}
        </section>

        <div className="mt-16 px-4 sm:px-6">
          <CtaBlock title={`Get 10 free ads for your ${i.singular} business`} campaign={i.slug} content="mid" label="Make my free ads" />
        </div>

        <section className="mx-auto mt-20 max-w-3xl px-4 sm:px-6" aria-labelledby="guide-title">
          <h2 id="guide-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">How to make a {i.singular} ad that works</h2>
          <div className="mt-8 space-y-8">
            {guide.sections.map((s) => (
              <div key={s.title}>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <ul className="mt-3 space-y-2.5">
                  {s.points.map((p) => (
                    <li key={p} className="flex gap-3 text-muted-foreground"><span aria-hidden className="mt-2 inline-block size-1.5 shrink-0 rotate-45 bg-[var(--studio-gold)]" />{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-3xl px-4 sm:px-6" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Questions</h2>
          <div className="mt-6 divide-y divide-border rounded-xl border border-border">
            {guide.faq.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">{f.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {(related.length > 0 || posts.length > 0) && (
          <section className="mx-auto mt-20 grid max-w-5xl gap-10 px-4 sm:px-6 md:grid-cols-2" aria-label="Keep exploring">
            {related.length > 0 && (
              <div>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">More ad examples</h2>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {related.map((r) => (
                    <li key={r.slug}><Link href={`/ad-examples/${r.slug}`} className="inline-flex rounded-full border border-border px-3.5 py-1.5 text-sm capitalize text-muted-foreground transition-colors hover:border-[var(--studio-gold)] hover:text-foreground">{r.plural}</Link></li>
                  ))}
                  <li><Link href="/ad-examples" className="inline-flex rounded-full px-3.5 py-1.5 text-sm text-[var(--studio-gold)] hover:underline">All industries</Link></li>
                </ul>
              </div>
            )}
            {posts.length > 0 && (
              <div>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">From the journal</h2>
                <ul className="mt-4 space-y-3">
                  {posts.map((p) => (
                    <li key={p.slug}><Link href={`/blog/${p.slug}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{p.title}</Link></li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="px-4 py-20 sm:px-6">
          <CtaBlock title={`Your ${i.singular} ads, made from your website`} campaign={i.slug} content="end" label={`Get 10 free ${i.singular} ads`} />
        </div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
