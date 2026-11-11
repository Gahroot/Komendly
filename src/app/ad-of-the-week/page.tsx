import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ExternalLink, Trophy } from "lucide-react";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { loadFeaturedAds } from "@/lib/ads/feature-actions";
import "@/components/studio/studio.css";

// Social proof: real customer ads we featured (with their consent). Public, indexable; images stream via /api/ad-of-the-week/<adId>.
export const metadata: Metadata = {
  title: "Ad of the week: real ads made by Komendly customers",
  description: "Every week we feature one ad a small business made from its own website with Komendly. See the winners, then make yours free.",
  alternates: { canonical: "/ad-of-the-week" },
  openGraph: { title: "Ad of the week", description: "Real ads made from real websites by Komendly customers.", url: "/ad-of-the-week" },
};
export const dynamic = "force-dynamic";

type Featured = Awaited<ReturnType<typeof loadFeaturedAds>>[number];

const week = (d: Date | null) => (d ? `Week of ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}` : "");
const shortCaption = (c: string | null) => (c ?? "").split(/\n\s*\n/)[0]?.replace(/^Ad of the week:\s*/i, "").trim() ?? "";

function Credit({ f, big = false }: { f: Featured; big?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={big ? "font-display text-2xl font-medium sm:text-3xl" : "truncate font-medium"}>{f.brandName ?? "A Komendly customer"}</p>
      {f.handle && <p className="truncate text-sm text-[var(--studio-gold)]">{f.handle}</p>}
    </div>
  );
}

function CtaButton() {
  return (
    <Link href="/free-ads" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--studio-gold)] px-6 text-base font-semibold text-[#2a0f10] shadow-[0_0_24px_#ffcf4a55] transition hover:brightness-105">
      Make my free ads <ArrowRight className="size-4" />
    </Link>
  );
}

export default async function AdOfTheWeekPage() {
  const ads = await loadFeaturedAds(40);
  const [latest, ...archive] = ads;
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <StudioNav signedIn={false} />
      <main>
        <section className="mx-auto max-w-3xl px-4 pt-10 text-center sm:px-6 sm:pt-16" aria-labelledby="aotw-title">
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]"><Trophy className="size-3.5" aria-hidden />Ad of the week</p>
          <h1 id="aotw-title" className="font-display mt-5 text-balance text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">Real ads, made by real small businesses</h1>
          <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">Each week we pick one ad a customer made from their own website with Komendly. No designer, no prompts, minutes from start to finish.</p>
        </section>

        {latest ? (
          <section className="mx-auto mt-12 grid max-w-5xl items-center gap-8 px-4 sm:px-6 md:grid-cols-[1.1fr_1fr]" aria-label="This week's ad">
            <div className="studio-frame rounded-2xl p-2">
              <Image src={latest.src} alt={`${latest.brandName ?? "Customer"} ad: ${latest.headline}`} width={latest.width} height={latest.height} priority unoptimized sizes="(min-width: 768px) 520px, 92vw" className="h-auto w-full rounded-lg" />
            </div>
            <div className="space-y-4 text-center md:text-left">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">This week · {week(latest.featuredAt)}</p>
              <Credit f={latest} big />
              {shortCaption(latest.caption) && <p className="text-muted-foreground">{shortCaption(latest.caption)}</p>}
              <p className="text-lg">&ldquo;{latest.headline}&rdquo;</p>
              {latest.postUrl && <a href={latest.postUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[var(--studio-gold)] underline-offset-4 hover:underline">See the post <ExternalLink className="size-3.5" aria-hidden /></a>}
              <div className="flex justify-center pt-2 md:justify-start"><CtaButton /></div>
            </div>
          </section>
        ) : (
          <section className="mx-auto mt-12 max-w-xl px-4 text-center sm:px-6">
            <Image src="/brand/ozzy-creator-focused.png" alt="" width={120} height={120} unoptimized className="mx-auto [image-rendering:pixelated]" />
            <p className="mt-4 text-muted-foreground">Ozzy is picking the first winner. Make your ads and tap the award icon on your favourite to enter.</p>
            <div className="mt-6 flex justify-center"><CtaButton /></div>
          </section>
        )}

        {archive.length > 0 && (
          <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6" aria-labelledby="archive-title">
            <h2 id="archive-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Past winners</h2>
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {archive.map((f) => (
                <li key={f.id} className="space-y-2">
                  <div className="studio-frame rounded-xl p-1.5"><Image src={f.src} alt={`${f.brandName ?? "Customer"} ad: ${f.headline}`} width={f.width} height={f.height} unoptimized sizes="(min-width: 1024px) 25vw, 50vw" className="h-auto w-full rounded-md" /></div>
                  <div className="flex items-baseline justify-between gap-2 px-1"><Credit f={f} /><span className="shrink-0 text-xs text-muted-foreground">{f.featuredAt?.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span></div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6" aria-labelledby="close-title">
          <h2 id="close-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Your ad could be next</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">Paste your website and get 10 ready-to-run Facebook &amp; Instagram ads plus an animated one, free. Then enter your favourite.</p>
          <div className="mt-6"><CtaButton /></div>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
