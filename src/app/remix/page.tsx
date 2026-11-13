import type { Metadata } from "next";
import Link from "next/link";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { SiteFooter } from "@/components/site-footer";
import { fraunces } from "@/components/studio/fonts";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { StudioSky } from "@/components/studio/studio-sky";
import "@/components/studio/studio.css";
import { faqJsonLd, graph, jsonLdString, studioApplicationJsonLd } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";
import { STUDIO_PRICE } from "@/lib/studio/contracts";
import { RemixForm } from "./remix-form";

export const metadata: Metadata = {
  title: "Remix any ad with Ozzy: show Ozzy any ad, get yours",
  description:
    "Paste a link to any ad you love (TikTok, Reels, Facebook, X) and Ozzy rebuilds its hook, pacing and style for your brand. Your first video is free.",
  alternates: { canonical: "/remix" },
  openGraph: { title: "Show Ozzy any ad. Get yours.", url: "/remix" },
};

const STEPS = [
  { title: "Paste any ad", body: "A link to a TikTok, Reel, Facebook or X ad, or a screen recording of one (including YouTube ads)." },
  { title: "Ozzy studies it", body: "He maps the hook, every beat, the pacing, the text style, the transitions and the music feel." },
  { title: "Get your version", body: "The same structure and energy, rebuilt with your logo, colours, product and offer." },
] as const;

const FAQ = [
  { q: "Will it copy the other brand's ad?", a: "No. Ozzy borrows the structure and style only: the hook, rhythm, text treatment and transitions. Logos, people, footage, brand names and wording are never reused. Your video is built from your own brand." },
  { q: "Which links work?", a: "TikTok, Instagram Reels, the Facebook Ad Library, X, direct video or image links, and most pages that show the ad. If a link won't open, upload a screen recording or screenshot instead." },
  { q: "Does a remix cost more?", a: `No. A remix is a normal Ozzy Studio video: your first one is free, then ${STUDIO_PRICE.newShort} credits for a new video with ${STUDIO_PRICE.includedRevisions} revisions included.` },
  { q: "Can I change things after?", a: "Yes. Just ask in the chat: a different offer, a new colour, shorter, square instead of vertical." },
] as const;

const jsonLd = graph(studioApplicationJsonLd(), faqJsonLd(FAQ.map((f) => ({ q: f.q, a: f.a })), `${SITE_URL}/remix`));

export default function RemixPage() {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <div className="absolute inset-x-0 top-0 z-20"><StudioNav signedIn={false} /></div>
      <main>
        <section className="relative isolate overflow-hidden pb-20" aria-labelledby="hero-title">
          <div className="absolute inset-0"><StudioSky /><div className="studio-grain" aria-hidden /></div>
          <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 pt-24 text-center sm:px-6 sm:pt-32">
            <p className="studio-rise inline-flex items-center gap-2 rounded-full border border-border bg-[oklch(0.2_0.07_295/0.6)] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)] backdrop-blur">
              New · Remix any ad · First video free
            </p>
            <h1 id="hero-title" className="studio-rise font-display mt-5 text-balance text-[2.5rem] font-medium leading-[1.04] tracking-[-0.025em] sm:text-6xl" style={{ ["--rise-delay" as string]: "80ms" }}>
              Show Ozzy any ad. <em className="italic text-[var(--studio-gold)]">Get yours.</em>
            </h1>
            <p className="studio-rise mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg" style={{ ["--rise-delay" as string]: "160ms" }}>
              Saw an ad that stopped your scroll? Paste the link. Ozzy rebuilds its hook, pacing and style for your brand, with your logo, colours and offer.
            </p>
            <div className="mt-6" aria-hidden><OzzyLazy size={112} perch="ledge" pose={{ form: "creator", expression: "happy", motion: "idle" }} /></div>
            <div className="studio-rise w-full max-w-2xl" style={{ ["--rise-delay" as string]: "240ms" }}>
              <RemixForm />
            </div>
          </div>
        </section>

        <div className="relative bg-[linear-gradient(180deg,#140818,#0c0820_30%)]">
          <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="how-title">
            <h2 id="how-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">How it works</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-border p-6">
                  <span className="font-mono text-sm text-[var(--studio-gold)]">0{i + 1}</span>
                  <h3 className="mt-2 font-display text-xl font-medium">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-labelledby="free-title">
            <div className="rounded-3xl border border-border bg-[oklch(0.18_0.06_295/0.7)] p-8 sm:p-10">
              <h2 id="free-title" className="font-display text-3xl font-medium tracking-[-0.02em]">Your first video is free</h2>
              <p className="mt-2 text-sm text-muted-foreground">No card, no watermark. After that a remix costs the same as any Ozzy video.</p>
              <Link href="/ozzy-studio" className="mt-3 inline-block text-sm font-medium text-[var(--studio-gold)] underline-offset-4 hover:underline">More about Ozzy Studio</Link>
            </div>
          </section>

          <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6" aria-labelledby="faq-title">
            <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em]">Questions</h2>
            <div className="mt-6 divide-y divide-border rounded-2xl border border-border">
              {FAQ.map((f) => (
                <details key={f.q} className="group p-5">
                  <summary className="cursor-pointer list-none font-medium text-foreground">{f.q}</summary>
                  <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="mx-auto max-w-3xl px-4 pb-16 pt-8 text-center sm:px-6" aria-labelledby="final-title">
            <h2 id="final-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Which ad should Ozzy remix for you?</h2>
            <div className="mt-6"><RemixForm id="remix-url-final" /></div>
          </section>
          <SiteFooter />
        </div>
      </main>
    </StudioRoot>
  );
}
