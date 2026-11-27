// Shared server view for /ad-examples intent pages (platform / format / occasion / "facebook ads for <industry>").
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdCard, Breadcrumbs, CtaBlock } from "@/components/ad-examples/parts";
import { SearchAdsGuide, TikTokGuide } from "@/components/ad-examples/search-ads";
import { HeroFreePack } from "@/components/ad-examples/url-box";
import { JsonLd } from "@/components/json-ld";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { getIndustry } from "@/lib/ads/industries";
import { relatedGalleryPages, type GalleryKind, type GalleryPageDef } from "@/lib/growth/ad-pages";
import { loadGalleryPageData, type GalleryPageData } from "@/lib/growth/ad-pages-server";
import { FREE_TOOLS } from "@/lib/growth/free-tools";
import { TIKTOK_FAQ, searchGuideForPage } from "@/lib/growth/local-search-ads";
import type { SampleAd } from "@/lib/growth/industry-examples";
import { withSystemUtm } from "@/lib/growth/systems";
import { templatizeSample } from "@/lib/growth/trade-playbooks";
import { adImageAlt, alsoCalled, anchorText } from "@/lib/growth/vocabulary";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd, galleryPageJsonLd, graph } from "@/lib/seo/jsonld";
import "@/components/studio/studio.css";

const KIND_LABEL: Record<GalleryKind, string> = { platform: "By platform", format: "By format", occasion: "By occasion", combo: "Facebook & Google ads by trade" };
const TOOLS_FOR: Record<GalleryKind, string[]> = {
  platform: ["ad-size-checker", "ad-headline-generator", "caption-generator"],
  format: ["ad-size-checker", "hook-generator", "promo-ad-generator"],
  occasion: ["promo-ad-generator", "slogan-generator", "hook-generator"],
  combo: ["ad-budget-calculator", "ad-headline-generator", "ad-copy-grader"],
};

export function ctaHref(page: GalleryPageDef, content: string): string {
  const u = new URL(withSystemUtm("https://www.komendly.com/free-ads", "industry_examples", { campaign: page.key, content, medium: "gallery" }));
  return `${u.pathname}${u.search}`;
}

function describe(d: GalleryPageData): string {
  const e = d.page.entry;
  const real = d.ads.length ? `${d.ads.length} real ${d.ads.length === 1 ? "ad" : "ads"} shared with permission, ` : "";
  return `${e.intro.split(". ")[0].replace(/\.$/, "")}. ${real}sample ads and practical tips, plus a free way to make yours.`.slice(0, 300);
}

export async function galleryMetadata(key: string): Promise<Metadata> {
  const d = await loadGalleryPageData(key);
  if (!d) return {};
  const { entry, path } = d.page;
  const description = searchGuideForPage(key)?.googleDescription ?? describe(d);
  const first = d.ads[0];
  return {
    title: entry.title,
    description,
    alternates: { canonical: path },
    openGraph: { title: entry.title, description, url: path, ...(first ? { images: [{ url: absoluteUrl(first.src), width: first.width, height: first.height, alt: adImageAlt(key, first.brandName, first.headline) }] } : {}) },
    twitter: { card: "summary_large_image", title: entry.title, ...(first ? { images: [absoluteUrl(first.src)] } : {}) },
    ...(!d.indexable ? { robots: { index: false, follow: true } } : {}),
  };
}

function SampleAdCard({ ad }: { ad: SampleAd }) {
  return (
    <li className="studio-frame flex flex-col gap-3 rounded-xl p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-medium">Example ad <span className="text-muted-foreground">· written by Ozzy</span></p>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Template</span>
      </div>
      <p className="text-sm italic text-foreground/80">{ad.hook}</p>
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{ad.primaryText}</p>
      <div className="mt-auto flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
        <p className="text-sm font-semibold">{ad.headline}</p>
        <span className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium">{ad.cta}</span>
      </div>
      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground/80">Why it works: </span>{ad.angle}</p>
    </li>
  );
}

/** Hand-written questions first (they answer the searches these pages rank for), then the vocabulary ones; same question once. */
function mergeFaq(first: ReadonlyArray<{ q: string; a: string }>, rest: ReadonlyArray<{ q: string; a: string }>): Array<{ q: string; a: string }> {
  const seen = new Set(first.map((f) => f.q.toLowerCase()));
  return [...first, ...rest.filter((f) => !seen.has(f.q.toLowerCase()))];
}

const chip = "inline-flex rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-[var(--studio-gold)] hover:text-foreground";

export async function GalleryLanding({ pageKey }: { pageKey: string }) {
  const d = await loadGalleryPageData(pageKey);
  if (!d) notFound();
  const { page, ads, content } = d;
  const e = page.entry;
  const industry = page.industry ? getIndustry(page.industry) : undefined;
  const crumbs = [{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }, ...(industry ? [{ name: industry.plural, path: `/ad-examples/${industry.slug}` }] : []), { name: e.h1, path: page.path }];
  const related = relatedGalleryPages(page);
  const tools = TOOLS_FOR[page.kind].flatMap((slug) => { const t = FREE_TOOLS.find((x) => x.slug === slug); return t ? [t] : []; });
  const also = alsoCalled(e);
  const search = searchGuideForPage(page.key);
  const isTikTok = page.key === "platform:tiktok";
  const faq = search ? mergeFaq(search.googleFaq, e.faq) : isTikTok ? mergeFaq(TIKTOK_FAQ, e.faq) : e.faq;
  const packNote = search ? (
    <>No card. The free pack is Facebook &amp; Instagram ads made from your site, which you post yourself. Google search ads are text: write yours with the <Link href="/tools/google-ads-headline-generator" className="text-[var(--studio-gold)] hover:underline">free Google Ads headline generator</Link>.</>
  ) : undefined;

  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd
        data={graph(
          galleryPageJsonLd({ name: e.h1, description: describe(d), path: page.path, items: ads.map((a, n) => ({ name: a.brandName, url: page.path, image: { url: a.src, caption: adImageAlt(page.key, a.brandName, a.headline, n), width: a.width, height: a.height } })) }),
          breadcrumbJsonLd(crumbs),
          faqJsonLd(faq, absoluteUrl(page.path)),
        )}
      />
      <StudioNav signedIn={false} />
      <main>
        <header className="mx-auto max-w-3xl px-4 pt-8 text-center sm:px-6 sm:pt-14">
          <div className="flex justify-center"><Breadcrumbs items={crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : { name: c.name, href: c.path }))} /></div>
          <h1 className="font-display mt-5 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">{e.h1}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">{e.intro}</p>
          {also && <p className="mt-3 text-sm text-muted-foreground/80">{also}</p>}
          {ads.length > 0 && <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-[var(--studio-gold)]">{ads.length} real {ads.length === 1 ? "ad" : "ads"} · shared with permission</p>}
          {ads.length === 0 && <HeroFreePack href={ctaHref(page, "hero")} note={packNote} />}
        </header>

        {ads.length > 0 && (
          <section className="mx-auto mt-12 max-w-6xl px-4 sm:px-6" aria-label={`Real ${e.h1.toLowerCase()}`}>
            <ul className="mx-auto grid max-w-sm gap-x-5 gap-y-10 sm:max-w-none sm:grid-cols-2 lg:grid-cols-3">
              {ads.slice(0, 12).map((a, n) => <AdCard key={a.adId} ad={a} eager={n < 2} alt={adImageAlt(page.key, a.brandName, a.headline, n)} />)}
            </ul>
          </section>
        )}

        <section className="mx-auto mt-16 max-w-3xl px-4 sm:px-6" aria-labelledby="rules-title">
          <h2 id="rules-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">The short version</h2>
          <ul className="mt-6 space-y-3">
            {e.guidance.map((g) => <li key={g} className="flex gap-3 text-muted-foreground"><span aria-hidden className="mt-2 inline-block size-1.5 shrink-0 rotate-45 bg-[var(--studio-gold)]" />{g}</li>)}
          </ul>
        </section>

        {search && <SearchAdsGuide guide={search} mode="full" googlePath={page.path} tools={{ headline: "/tools/google-ads-headline-generator", counter: "/tools/ad-character-counter" }} />}
        {isTikTok && <TikTokGuide links={{ hook: "/tools/hook-generator", script: "/tools/ugc-script-generator", size: "/tools/ad-size-guide", plumbersGoogle: "/ad-examples/plumbers/google", hvacGoogle: "/ad-examples/hvac/google" }} />}

        {content ? (
          <section className="mx-auto mt-16 max-w-5xl px-4 sm:px-6" aria-labelledby="works-title">
            <h2 id="works-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">What works</h2>
            <p className="mt-4 max-w-3xl text-muted-foreground">{content.intro}</p>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {content.whatWorks.map((w) => <li key={w.title} className="rounded-xl border border-border p-5"><h3 className="font-semibold">{w.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{w.detail}</p></li>)}
            </ul>
            {!search && (
              <>
                <h2 className="font-display mt-16 text-2xl font-medium tracking-[-0.02em] sm:text-3xl">Sample ads to adapt</h2>
                <p className="mt-3 text-sm text-muted-foreground">Example ads written by Ozzy, Komendly&apos;s AI ad maker, as templates: not real companies or customer ads, and no results claimed. Swap in your business name, town, offer and photos.</p>
                <ul className="mt-6 grid gap-5 sm:grid-cols-2">{content.samples.map((a, n) => <SampleAdCard key={n} ad={templatizeSample(a)} />)}</ul>
              </>
            )}
          </section>
        ) : !search && !isTikTok ? (
          <p className="mx-auto mt-12 max-w-xl px-4 text-center text-sm text-muted-foreground">Ozzy is still writing sample ads for this page. Check back soon, or make your own below.</p>
        ) : null}

        <div className="mt-16 px-4 sm:px-6">
          <CtaBlock title={industry ? `Get 10 free Facebook ads for your ${industry.singular} business` : "Make yours free from your website"} campaign={page.key} content="mid" label="Make my free ads" href={ctaHref(page, "mid")} />
        </div>

        <section className="mx-auto mt-20 max-w-3xl px-4 sm:px-6" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Questions</h2>
          <div className="mt-6 divide-y divide-border rounded-xl border border-border">
            {faq.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">{f.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 grid max-w-5xl gap-10 px-4 sm:px-6 md:grid-cols-2" aria-label="Keep exploring">
          <div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">More ad examples</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {industry && <li><Link href={`/ad-examples/${industry.slug}`} className={chip}>{industry.singular} ad examples</Link></li>}
              {related.map((r) => <li key={r.key}><Link href={r.path} className={chip}>{anchorText(r.key, page.key)}</Link></li>)}
              <li><Link href="/ad-examples" className="inline-flex rounded-full px-3.5 py-1.5 text-sm text-[var(--studio-gold)] hover:underline">All ad examples</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Free tools</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {tools.map((t) => <li key={t.slug}><Link href={`/tools/${t.slug}`} className={chip}>{t.name}</Link></li>)}
              <li><Link href="/tools" className="inline-flex rounded-full px-3.5 py-1.5 text-sm text-[var(--studio-gold)] hover:underline">All free tools</Link></li>
            </ul>
          </div>
        </section>

        <div className="px-4 py-20 sm:px-6">
          <CtaBlock title="Your ads, made from your website" campaign={page.key} content="end" label="Get free ads" href={ctaHref(page, "end")} />
        </div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}

export { KIND_LABEL };
