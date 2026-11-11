import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, CtaBlock, CtaButton } from "@/components/ad-examples/parts";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { loadGalleryAds, summarizeIndustries } from "@/lib/ads/gallery";
import { galleryCtaHref } from "@/lib/ads/industries";
import { breadcrumbJsonLd, galleryPageJsonLd, graph } from "@/lib/seo/jsonld";
import "@/components/studio/studio.css";

// Programmatic SEO hub: industries with real, consented customer ads. ISR hourly (data cached 1h in gallery.ts).
export const revalidate = 3600;

const DESCRIPTION = "Real Facebook and Instagram ads made by small businesses with Komendly, grouped by industry. Shared with permission. Browse by business type, then make yours free.";

export const metadata: Metadata = {
  title: "Facebook Ad Examples by Industry: real small-business ads",
  description: DESCRIPTION,
  alternates: { canonical: "/ad-examples" },
  openGraph: { title: "Facebook ad examples by industry", description: DESCRIPTION, url: "/ad-examples" },
};

export default async function AdExamplesHub() {
  const industries = summarizeIndustries(await loadGalleryAds());
  const total = industries.reduce((n, x) => n + x.count, 0);
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd
        data={graph(
          galleryPageJsonLd({
            name: "Facebook ad examples by industry",
            description: DESCRIPTION,
            path: "/ad-examples",
            items: industries.filter((x) => x.indexable).map((x) => ({ name: `Facebook ad examples for ${x.industry.plural}`, url: `/ad-examples/${x.industry.slug}` })),
          }),
          breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }]),
        )}
      />
      <StudioNav signedIn={false} />
      <main>
        <section className="mx-auto max-w-3xl px-4 pt-8 text-center sm:px-6 sm:pt-14" aria-labelledby="hub-title">
          <div className="flex justify-center"><Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Ad examples" }]} /></div>
          <h1 id="hub-title" className="font-display mt-5 text-balance text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">Facebook ad examples, by industry</h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Real ads small businesses made from their own websites with Komendly, shown with their permission. Pick your industry and steal the ideas.
          </p>
          {total > 0 && <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-[var(--studio-gold)]">{total} real {total === 1 ? "ad" : "ads"} · {industries.length} {industries.length === 1 ? "industry" : "industries"}</p>}
          <div className="mt-7 flex justify-center"><CtaButton href={galleryCtaHref("hub", "hero")}>Make yours free</CtaButton></div>
        </section>

        {industries.length > 0 ? (
          <section className="mx-auto mt-14 max-w-6xl px-4 sm:px-6" aria-labelledby="industries-title">
            <h2 id="industries-title" className="sr-only">Industries</h2>
            <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {industries.map((x, i) => (
                <li key={x.industry.slug}>
                  <Link href={`/ad-examples/${x.industry.slug}`} className="group block space-y-2.5">
                    <div className="studio-frame overflow-hidden rounded-xl p-1.5">
                      <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-white/5">
                        <Image src={x.hero.src} alt={`${x.hero.brandName} ad: ${x.hero.headline}`} fill sizes="(min-width: 1024px) 270px, (min-width: 768px) 30vw, 46vw" priority={i < 2} className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      </div>
                    </div>
                    <div className="px-1">
                      <p className="font-display text-lg font-medium capitalize leading-tight group-hover:text-[var(--studio-gold)] sm:text-xl">{x.industry.plural}</p>
                      <p className="text-sm text-muted-foreground">{x.count} real {x.count === 1 ? "ad" : "ads"}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="mx-auto mt-12 max-w-xl px-4 text-center sm:px-6">
            <Image src="/brand/ozzy-explorer-focused.png" alt="" width={120} height={120} unoptimized className="mx-auto [image-rendering:pixelated]" />
            <p className="mt-4 text-muted-foreground">Ozzy is collecting the first examples. Make your ads and share your favourite to be featured here.</p>
          </section>
        )}

        <div className="px-4 py-20 sm:px-6">
          <CtaBlock title="Get 10 free ads for your business" campaign="hub" content="end" label="Make yours free" />
        </div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
