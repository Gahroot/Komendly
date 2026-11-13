import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CtaButton } from "@/components/ad-examples/parts";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { ExampleShowcase } from "@/components/testimonials/example-showcase";
import { AD_SAMPLES, STUDIO_EXAMPLES } from "@/lib/studio/examples";
import { StudioVideoGrid } from "./studio-video-grid";
import "@/components/studio/studio.css";

// Static, session-independent marketing page (cached publicly via next.config.ts headers()).
const DESCRIPTION = "See what Komendly makes: animated video ads from Ozzy Studio, static Ad Packs built from real websites, and AI video testimonials. Try any of them free.";

export const metadata: Metadata = {
  title: "Examples",
  description: DESCRIPTION,
  alternates: { canonical: "/examples" },
  openGraph: { title: "Examples: what Ozzy makes", description: DESCRIPTION, url: "/examples" },
};

function SectionHead({ id, kicker, title, line }: { id: string; kicker: string; title: string; line: string }) {
  return (
    <div className="max-w-2xl space-y-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{kicker}</p>
      <h2 id={id} className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-5xl">{title}</h2>
      <p className="text-pretty text-muted-foreground">{line}</p>
    </div>
  );
}

export default function ExamplesPage() {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <StudioNav signedIn={false} />
      <main>
        <section className="mx-auto max-w-3xl px-4 pt-8 text-center sm:px-6 sm:pt-14">
          <h1 className="font-display text-balance text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">Things Ozzy made</h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Animated ads, static ad packs and video testimonials, all made with Komendly. Pick the one you want and make yours free.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="studio-title">
          <SectionHead id="studio-title" kicker="Ozzy Studio · animated ads" title="Ads that move" line="Tell Ozzy what you want in a sentence and he builds a 9:16 video ad for Reels and TikTok. Tap one for sound." />
          <div className="mt-8"><StudioVideoGrid examples={STUDIO_EXAMPLES} /></div>
          <div className="mt-8"><CtaButton href="/ozzy-studio">Make a video free</CtaButton></div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="packs-title">
          <SectionHead id="packs-title" kicker="Ad Packs · static ads" title="Ads from your website" line="Paste your website and Ozzy writes and designs a pack of ads in your customers' own words." />
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            {AD_SAMPLES.map((s) => (
              <li key={s.src} className="studio-frame overflow-hidden rounded-xl p-1.5">
                <div className="relative aspect-square overflow-hidden rounded-md bg-white/5">
                  <Image src={s.src} alt={s.alt} fill sizes="(min-width: 1024px) 270px, (min-width: 768px) 30vw, 46vw" className="object-cover" />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <CtaButton href="/free-ads">Get free ads</CtaButton>
            <Link href="/ad-examples" className="text-sm text-[var(--studio-gold)] underline-offset-4 hover:underline">Browse real customer ads by industry →</Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="testimonials-title">
          <SectionHead id="testimonials-title" kicker="Testimonials · AI video" title="Reviews that talk" line="Turn a written customer review into a short video testimonial. Tap it for sound." />
          <ExampleShowcase className="mt-8 [&>ul]:mx-0" />
          <div className="mt-8"><CtaButton href="/testimonials">Make a testimonial free</CtaButton></div>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
