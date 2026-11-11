/* eslint-disable @next/next/no-img-element -- token-checked streamed ad images */
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Check, Quote } from "lucide-react";
import { fraunces } from "@/components/studio/fonts";
import { StudioRoot } from "@/components/studio/studio-spell";
import { GiftViewBeacon } from "@/components/growth/gift-view-beacon";
import { giftByToken, giftView, recipientHasAccount } from "@/lib/ads/gifts";
import { REFERRED_TRIAL_STATIC } from "@/lib/ads/referrals";
import { prisma } from "@/lib/prisma";
import { startHref } from "@/lib/ads/url-submit";
import "@/components/studio/studio.css";
import { BrandMark } from "@/components/brand-mark";

export const revalidate = 60;
type Props = { params: Promise<{ token: string }> };

async function load(token: string) {
  const gift = await giftByToken(token);
  return gift ? { gift, view: await giftView(gift) } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load((await params).token);
  if (!d) return { title: "Gift not found", robots: { index: false, follow: false } };
  const title = d.view.source === "outbound" ? `An ad made for ${d.view.businessName}` : `${d.view.senderName} made you 3 ads for ${d.view.businessName}`;
  const description = "Free Facebook & Instagram ads, made from your website by Ozzy at Komendly.";
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function GiftPage({ params }: Props) {
  const { token } = await params;
  const d = await load(token);
  if (!d) notFound();
  const { gift, view: g } = d;
  const code = (await prisma.adsReferralCode.findUnique({ where: { workspaceId: gift.senderWorkspaceId }, select: { code: true } }))?.code;
  const hasAccount = await recipientHasAccount(gift.recipientDomainHash);
  const outbound = g.source === "outbound";
  const cta = outbound && !hasAccount
    ? startHref(g.url, "auto", false)
    : hasAccount ? `/ads/login?next=${encodeURIComponent("/ads/app")}` : code ? `/r/${code}?gift=${token}` : `/ads/signup?next=${encodeURIComponent(`/ads/start?url=${encodeURIComponent(g.url)}&goal=auto`)}`;
  const slots = Array.from({ length: g.expected }, (_, i) => g.ads[i] ?? null);
  const drawing = g.status !== "ready" && g.status !== "failed";
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820] text-foreground`}>
      <GiftViewBeacon token={token} />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <p className="flex items-center gap-2 font-[family-name:var(--font-fraunces)] text-lg font-semibold"><BrandMark className="size-7" />Komendly</p>
        <header className="mt-8 flex flex-col items-center text-center">
          <Image src="/brand/ozzy-classic-love.png" alt="Ozzy the ad wizard" width={112} height={112} unoptimized priority className="size-20 [image-rendering:pixelated] sm:size-24" />
          <p className="mt-3 rounded-full border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">A gift for {g.recipientName ?? g.businessName}</p>
          <h1 className="font-display mt-4 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">
            {outbound ? "We made you an ad" : `${g.senderName} made you these`}
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-muted-foreground sm:text-lg">{outbound ? "A ready-to-run Facebook & Instagram ad" : "3 ready-to-run Facebook & Instagram ads"} for <span className="text-foreground">{g.businessName}</span>, made from your website.</p>
        </header>
        {g.note && (
          <figure className="mx-auto mt-8 max-w-xl rounded-2xl border-2 border-[#1a0f3a] bg-[#fff1d6] px-5 py-4 text-[#2a1a6e] shadow-[0_4px_0_#1a0f3a]">
            <Quote className="size-4 opacity-60" aria-hidden />
            <blockquote className="mt-1 text-base font-semibold leading-snug">{g.note}</blockquote>
            <figcaption className="mt-2 text-sm opacity-75">{g.senderName}</figcaption>
          </figure>
        )}
        <div className={outbound ? "mx-auto mt-10 grid max-w-md gap-4" : "mt-10 grid gap-4 sm:grid-cols-3 sm:gap-5"}>
          {slots.map((ad, i) => (
            <div key={ad?.id ?? i} className="studio-frame overflow-hidden rounded-2xl p-1.5 sm:p-2" style={{ ["--tilt" as string]: ["-1.5deg", "1deg", "-0.5deg"][i] }}>
              {ad ? <img src={ad.imageUrl} alt={ad.headline} width={ad.width} height={ad.height} className="h-auto w-full rounded-xl" /> : (
                <div className="flex aspect-square items-center justify-center rounded-xl bg-white/[0.04] text-sm text-muted-foreground">{drawing ? "Ozzy is still drawing…" : "—"}</div>
              )}
            </div>
          ))}
        </div>
        {g.ads.length > 0 && <p className="mt-3 text-center text-xs text-muted-foreground">Long-press or right-click to save. They&apos;re yours to run.</p>}
        <section className="mx-auto mt-12 max-w-xl rounded-3xl border border-[var(--studio-gold)]/30 bg-white/[0.03] p-6 text-center">
          <h2 className="font-display text-2xl font-medium sm:text-3xl">{hasAccount ? "Want more like these?" : outbound ? "Get the rest free" : `Get your full free pack: ${REFERRED_TRIAL_STATIC} ads`}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{hasAccount ? "Your business already has a Komendly account. Log in to make more." : outbound ? `Komendly makes a full pack of ready-to-run ads from ${g.domain}, free. Your website is already filled in.` : `${g.senderName}'s gift unlocks double the usual free pack: ${REFERRED_TRIAL_STATIC} static ads plus an animated one, for ${g.domain}.`}</p>
          <a href={cta} className="spellbar__cta mt-5 inline-flex h-13 w-full items-center justify-center rounded-2xl px-6 text-base font-semibold sm:w-auto">{hasAccount ? "Log in" : outbound ? "Get the rest free" : "Get your full free pack"}</a>
          {!hasAccount && <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">{["No card", "Ready in minutes", "Yours to keep"].map((t) => <li key={t} className="inline-flex items-center gap-1"><Check className="size-3.5 text-[var(--studio-gold)]" />{t}</li>)}</ul>}
        </section>
      </main>
    </StudioRoot>
  );
}
