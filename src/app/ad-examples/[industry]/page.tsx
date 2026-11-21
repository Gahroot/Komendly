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
import { MakeYoursUrlBox } from "@/components/ad-examples/url-box";
import { galleryCtaHref } from "@/lib/ads/industries";
import { MIN_INDEXABLE_SAMPLES } from "@/lib/growth/industry-examples";
import { loadIndustryExample } from "@/lib/growth/industry-examples-server";
import { comboForIndustry, galleryPage } from "@/lib/growth/ad-pages";
import { anchorText } from "@/lib/growth/vocabulary";
import { angleLabel, categoryAngles, category as tradeCategory, ideasPath, templatizeSample, tradePage, type TradePage } from "@/lib/growth/trade-playbooks";
import { Bullets, ChipLinks, Faq, PaidNote, TemplateAdCard } from "@/components/ad-examples/playbook-parts";
import { ADLIB_REPORT_PATH, leaderboardPath } from "@/lib/growth/adlib-report";
import { loadAdlibReport } from "@/lib/growth/adlib-report-server";
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
  const content = await loadIndustryExample(industry.slug);
  return { industry, ads, available, content, trade: tradePage(industry.slug) };
}

/** Indexable with a hand-written trade playbook, enough real consented ads, or enough engine-written samples + tips. */
function indexable(ads: number, samples: number, trade: TradePage | null): boolean {
  return !!trade || ads >= MIN_INDEXABLE_INDUSTRY_ADS || samples >= MIN_INDEXABLE_SAMPLES;
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
  const { industry: i, ads, content, trade } = data;
  const path = `/ad-examples/${i.slug}`;
  const title = trade?.title ?? `Facebook Ad Examples for ${titleCase(i.plural)}${ads.length ? ` (${ads.length} real ${ads.length === 1 ? "ad" : "ads"})` : ""}`;
  const desc = trade?.description ?? description(i, ads.length);
  const first = ads[0];
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title, description: desc, url: path, ...(first ? { images: [{ url: absoluteUrl(first.src), width: first.width, height: first.height, alt: `${first.brandName} ad` }] } : {}) },
    twitter: { card: "summary_large_image", title, ...(first ? { images: [absoluteUrl(first.src)] } : {}) },
    ...(!indexable(ads.length, content?.samples.length ?? 0, trade) ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function IndustryPage({ params }: PageProps) {
  const data = await load((await params).industry);
  if (!data) notFound();
  const { industry: i, ads, available, content, trade } = data;
  const guide = industryGuide(i);
  const faq = trade?.faq ?? guide.faq;
  const pb = trade?.playbook;
  const cat = pb ? tradeCategory(pb.category) : undefined;
  const path = `/ad-examples/${i.slug}`;
  const related = relatedIndustries(i, available);
  const posts = relatedPosts(i);
  const h1 = trade?.h1 ?? `Facebook ad examples for ${i.plural}`;
  const adlib = await loadAdlibReport();
  const adlibTrades = adlib.byTrade.filter((t) => t.playbook === i.slug);

  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd
        data={graph(
          galleryPageJsonLd({
            name: h1,
            description: trade?.description ?? description(i, ads.length),
            path,
            items: ads.map((a) => ({ name: a.brandName, url: path, image: { url: a.src, caption: a.headline, width: a.width, height: a.height } })),
          }),
          breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }, { name: cap(i.plural), path }]),
          faqJsonLd(faq, absoluteUrl(path)),
        )}
      />
      <StudioNav signedIn={false} />
      <main>
        <header className="mx-auto max-w-3xl px-4 pt-8 text-center sm:px-6 sm:pt-14">
          <div className="flex justify-center"><Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Ad examples", href: "/ad-examples" }, { name: cap(i.plural) }]} /></div>
          <h1 className="font-display mt-5 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">
            {trade ? h1 : <>Facebook ad examples for <span className="text-[var(--studio-gold)]">{i.plural}</span></>}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">{trade ? trade.intro : guide.intro}</p>
          {ads.length > 0 && <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-[var(--studio-gold)]">{ads.length} real {ads.length === 1 ? "ad" : "ads"} · shared with permission</p>}
        </header>

        <section className="mx-auto mt-12 max-w-6xl px-4 sm:px-6" aria-label={`Ad examples for ${i.plural}`}>
          {ads.length > 0 ? (
            <ul className="mx-auto grid max-w-sm gap-x-5 gap-y-10 sm:max-w-none sm:grid-cols-2 lg:grid-cols-3">
              {ads.map((a, n) => <AdCard key={a.adId} ad={a} eager={n < 2} />)}
            </ul>
          ) : trade ? (
            <div>
              <h2 className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-3xl">3 example {trade.playbook.term} ads to adapt</h2>
              <p className="mt-3 max-w-3xl text-sm text-muted-foreground">Example ads written by Ozzy, Komendly&apos;s AI ad maker, as templates. They aren&apos;t real companies or customer ads and claim no results: fill in the brackets with your business, town, offer and a real review.</p>
              <ul className="mt-6 grid gap-5 md:grid-cols-3">{trade.examples.map((a) => <TemplateAdCard key={a.business} ad={a} />)}</ul>
            </div>
          ) : (
            <div className="mx-auto max-w-xl text-center">
              <Image src="/brand/ozzy-explorer-focused.png" alt="" width={110} height={110} unoptimized className="mx-auto [image-rendering:pixelated]" />
              <p className="mt-4 text-muted-foreground">No {i.singular} ads shared yet. Yours could be the first.</p>
            </div>
          )}
        </section>

        {trade && pb && (
          <section className="mx-auto mt-20 max-w-5xl space-y-14 px-4 sm:px-6" aria-label={`${pb.term} ad playbook`}>
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-3xl">Hooks that fit {i.plural}</h2>
                <Bullets items={pb.hooks} />
              </div>
              <div>
                <h2 className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-3xl">Offers that work</h2>
                <Bullets items={pb.offers} />
                <p className="mt-3 text-sm text-muted-foreground">Only advertise offers you really run, say what&apos;s included and give them an end date.</p>
              </div>
              <div>
                <h2 className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-3xl">What to show</h2>
                <Bullets items={pb.proof} />
              </div>
              <div>
                <h2 className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-3xl">Formats</h2>
                <p className="mt-4 text-muted-foreground">{pb.formats}</p>
                <p className="mt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground/80">Busy season: </span>{pb.peak}</p>
              </div>
            </div>
            <div className="rounded-xl border border-border p-6">
              <h2 className="font-display text-2xl font-medium tracking-[-0.02em]">Budget guidance</h2>
              <p className="mt-3 text-muted-foreground">{trade.budget}</p>
              {pb.note && <p className="mt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground/80">Ad rules to know: </span>{pb.note}</p>}
            </div>
            {trade.seasonal.length > 0 && (
              <div>
                <h2 className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-3xl">Seasonal {pb.term} ad ideas</h2>
                <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                  {trade.seasonal.map((x) => (
                    <li key={x.season.key} className="rounded-xl border border-border p-5">
                      <h3 className="font-semibold">{x.path ? <Link href={x.path} className="hover:text-[var(--studio-gold)]">{x.season.name}</Link> : x.season.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{x.idea}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {content && (
          <section className="mx-auto mt-20 max-w-5xl px-4 sm:px-6" aria-labelledby="works-title">
            <h2 id="works-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">What works in {i.singular} ads</h2>
            <p className="mt-4 max-w-3xl text-muted-foreground">{content.intro}</p>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {content.whatWorks.map((w) => (
                <li key={w.title} className="rounded-xl border border-border p-5"><h3 className="font-semibold">{w.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{w.detail}</p></li>
              ))}
            </ul>
            <h2 className="font-display mt-16 text-2xl font-medium tracking-[-0.02em] sm:text-3xl">More {i.singular} ad templates</h2>
            <p className="mt-3 text-sm text-muted-foreground">Example ads written by Ozzy as templates: not real companies or customer ads, and no results claimed. Swap in your business, town, offer and photos.</p>
            <ul className="mt-6 grid gap-5 sm:grid-cols-2">
              {content.samples.map((a, n) => <TemplateAdCard key={n} ad={templatizeSample(a)} />)}
            </ul>
          </section>
        )}

        <section className="mx-auto mt-16 max-w-3xl px-4 text-center sm:px-6" aria-labelledby="url-title">
          <h2 id="url-title" className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-3xl">Make yours from your website</h2>
          <p className="mt-3 text-muted-foreground">Paste your {i.singular} website. Ozzy reads it and makes ads with your brand, offers and photos. 3 free ads, no card.</p>
          <div className="mt-6"><MakeYoursUrlBox href={galleryCtaHref(i.slug, "url_box")} /></div>
          <p className="mt-4 text-sm text-muted-foreground">Or try the free <Link href="/tools/ad-copy-generator" className="text-[var(--studio-gold)] hover:underline">ad copy generator</Link> and <Link href="/tools/ad-copy-grader" className="text-[var(--studio-gold)] hover:underline">ad copy grader</Link>.</p>
        </section>

        <div className="mt-16 px-4 sm:px-6">
          <CtaBlock title={`Get 3 free ads for your ${i.singular} business`} campaign={i.slug} content="mid" label="Get my 3 free ads" />
        </div>
        <PaidNote />

        {!trade && <section className="mx-auto mt-20 max-w-3xl px-4 sm:px-6" aria-labelledby="guide-title">
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
        </section>}

        <Faq items={faq} />

        {trade && cat && (
          <section className="mx-auto mt-16 grid max-w-5xl gap-10 px-4 sm:px-6 md:grid-cols-2" aria-label="Related ad ideas">
            <ChipLinks title={`${cat.label} ad ideas`} links={categoryAngles(cat.slug).map((a) => ({ href: a.path, label: angleLabel(a.angle) }))} />
            <ChipLinks title={`More ${cat.label.toLowerCase()} trades`} links={trade.related.map((r) => ({ href: `/ad-examples/${r.slug}`, label: `${r.term} ad examples` }))} />
          </section>
        )}

        {adlibTrades.length > 0 && (
          <section className="mx-auto mt-16 max-w-5xl px-4 sm:px-6" aria-labelledby="adlib-title">
            <h2 id="adlib-title" className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-3xl">What real {i.singular} advertisers run on Meta</h2>
            <ul className="mt-4 space-y-2 text-muted-foreground">
              {adlibTrades.map((t) => (
                <li key={t.slug}>{t.label} (n = {t.advertisers} in the public Meta Ad Library): median {t.medianLiveAds} live ad{t.medianLiveAds === 1 ? "" : "s"}, the sampled ad running a median {t.medianDays} days, {t.offerShare}% mentioning an offer. <Link href={leaderboardPath(t.slug)} className="text-[var(--studio-gold)] hover:underline">Longest-running {t.label.toLowerCase()} ads</Link></li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">From our <Link href={ADLIB_REPORT_PATH} className="text-[var(--studio-gold)] hover:underline">State of Local Service Meta Ads</Link> report (collected {adlib.collectedOn}).</p>
          </section>
        )}

        <nav className="mx-auto mt-16 max-w-5xl px-4 sm:px-6" aria-label="Related ad guides">
          <ul className="flex flex-wrap gap-2">
            {[comboForIndustry(i.slug), comboForIndustry(i.slug, "google"), galleryPage("platform:instagram"), galleryPage("platform:nextdoor"), galleryPage("occasion:grand-opening")].flatMap((p) => (p ? [p] : [])).map((p) => (
              <li key={p.key}><Link href={p.path} className="inline-flex rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-[var(--studio-gold)] hover:text-foreground">{anchorText(p.key, `industry:${i.slug}`)}</Link></li>
            ))}
          </ul>
        </nav>

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
          <CtaBlock title={`Your ${i.singular} ads, made from your website`} campaign={i.slug} content="end" label="Get my 3 free ads" />
        <p className="mt-4 text-center text-sm text-muted-foreground">More ideas: <Link href={ideasPath(cat?.slug ?? "home-services")} className="text-[var(--studio-gold)] hover:underline">{cat?.label ?? "Home service"} ad ideas</Link></p>
        </div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
