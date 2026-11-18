import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Quote } from "lucide-react";
import { fraunces } from "@/components/studio/fonts";
import { StudioRoot } from "@/components/studio/studio-spell";
import { StudioSky } from "@/components/studio/studio-sky";
import { BrandMark } from "@/components/brand-mark";
import { ReviewGiftBeacon } from "@/components/growth/review-gift-beacon";
import { withSystemUtm } from "@/lib/growth/systems";
import { prisma } from "@/lib/prisma";
import "@/components/studio/studio.css";

// Kly review_gifts: a short video made from one real review the business published on its own website
// (default: an animated quote video of the review's words; optional capped AI-presenter version).
export const revalidate = 60;
type Props = { params: Promise<{ token: string }> };

async function load(token: string) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  const g = await prisma.klyReviewGift.findUnique({ where: { token } });
  return g && g.status === "ready" && (g.videoKey || g.videoUrl) ? g : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = await load((await params).token);
  if (!g) return { title: "Gift not found", robots: { index: false, follow: false } };
  const title = `A review video for ${g.businessName}`;
  return { title, description: `${g.reviewerName}'s review, turned into a short video.`, robots: { index: false, follow: false } };
}

export default async function ReviewGiftPage({ params }: Props) {
  const { token } = await params;
  const g = await load(token);
  if (!g) notFound();
  const cta = withSystemUtm("https://www.komendly.com/testimonials", "review_gifts", { medium: "gift", campaign: "review-video", content: "make-more" });
  return (
    <StudioRoot className={`${fraunces.variable} relative min-h-screen overflow-hidden bg-[#0c0820] text-foreground`}>
      <ReviewGiftBeacon token={token} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] opacity-80"><StudioSky /></div>
      <main className="relative mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <p className="flex items-center gap-2 font-[family-name:var(--font-fraunces)] text-lg font-semibold"><BrandMark className="size-7" />Komendly</p>
        <header className="mt-8 text-center">
          <p className="inline-block rounded-full border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">A gift for {g.businessName}</p>
          <h1 className="font-display mt-4 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">Your review, as a video</h1>
          <p className="mt-3 text-pretty text-muted-foreground">Made from a real review published on your website. Yours to post, free.</p>
        </header>
        <div className="mx-auto mt-8 max-w-sm overflow-hidden rounded-3xl border border-[var(--studio-gold)]/30 bg-black">
          <video src={`/api/ads/gift-public/review/${token}/video`} controls playsInline preload="metadata" className="aspect-[9/16] w-full" />
        </div>
        <p className="mx-auto mt-3 max-w-sm text-center text-xs text-muted-foreground">{g.kind === "presenter" ? <>Dramatization: an AI presenter reads {g.reviewerName}&apos;s words. Not the reviewer&apos;s own voice or face.</> : <>{g.reviewerName}&apos;s words, exactly as published on your website.</>}</p>
        <figure className="mx-auto mt-8 max-w-xl rounded-2xl border-2 border-[#1a0f3a] bg-[#fff1d6] px-5 py-4 text-[#2a1a6e] shadow-[0_4px_0_#1a0f3a]">
          <Quote className="size-4 opacity-60" aria-hidden />
          <blockquote className="mt-1 text-base font-semibold leading-snug">{g.fullReview}</blockquote>
          <figcaption className="mt-2 text-sm opacity-75">{g.reviewerName}{g.rating ? ` · ${g.rating}/5` : ""} · <a href={g.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">as published on your site</a></figcaption>
        </figure>
        <section className="mx-auto mt-12 max-w-xl rounded-3xl border border-[var(--studio-gold)]/30 bg-white/[0.03] p-6 text-center">
          <h2 className="font-display text-2xl font-medium sm:text-3xl">Make more from your reviews</h2>
          <p className="mt-2 text-sm text-muted-foreground">Komendly turns your best customer reviews into short testimonial videos for Facebook, Instagram and your site.</p>
          <a href={cta} className="spellbar__cta mt-5 inline-flex h-13 w-full items-center justify-center rounded-2xl px-6 text-base font-semibold sm:w-auto">Make more review videos</a>
          <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">{["Your real reviews", "Ready in minutes", "Yours to keep"].map((t) => <li key={t} className="inline-flex items-center gap-1"><Check className="size-3.5 text-[var(--studio-gold)]" />{t}</li>)}</ul>
        </section>
      </main>
    </StudioRoot>
  );
}
