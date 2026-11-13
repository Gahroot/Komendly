import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Check, Quote } from "lucide-react";
import { fraunces } from "@/components/studio/fonts";
import { StudioRoot } from "@/components/studio/studio-spell";
import { GiftViewBeacon } from "@/components/growth/gift-view-beacon";
import { GiftSlots } from "@/components/growth/gift-slots";
import { giftByToken, giftView, recipientHasAccount } from "@/lib/ads/gifts";
import { REFERRED_TRIAL_STATIC } from "@/lib/ads/referrals";
import { prisma } from "@/lib/prisma";
import { startHref } from "@/lib/ads/url-submit";
import "@/components/studio/studio.css";
import { BrandMark } from "@/components/brand-mark";
import { StudioSky } from "@/components/studio/studio-sky";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";

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
  return (
    <StudioRoot className={`${fraunces.variable} relative min-h-screen overflow-hidden bg-[#0c0820] text-foreground`}>
      <GiftViewBeacon token={token} />
      {outbound && <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] opacity-80"><StudioSky /></div>}
      <main className="relative mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <p className="flex items-center gap-2 font-[family-name:var(--font-fraunces)] text-lg font-semibold"><BrandMark className="size-7" />Komendly</p>
        <header className="mt-8 flex flex-col items-center text-center">
          <Image src="/brand/ozzy-classic-love.png" alt="Ozzy the ad wizard" width={112} height={112} unoptimized priority className="size-20 [image-rendering:pixelated] sm:size-24" />
          <p className="mt-3 rounded-full border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">A gift for {g.recipientName ?? g.businessName}</p>
          <h1 className="font-display mt-4 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">
            {outbound ? "Ozzy made you a gift" : `${g.senderName} made you these`}
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-muted-foreground sm:text-lg">{outbound ? "Ready-to-run Facebook & Instagram ads" : "3 ready-to-run Facebook & Instagram ads"} for <span className="text-foreground">{g.businessName}</span>, made from your website.</p>
        </header>
        {g.note && (
          <figure className="mx-auto mt-8 max-w-xl rounded-2xl border-2 border-[#1a0f3a] bg-[#fff1d6] px-5 py-4 text-[#2a1a6e] shadow-[0_4px_0_#1a0f3a]">
            <Quote className="size-4 opacity-60" aria-hidden />
            <blockquote className="mt-1 text-base font-semibold leading-snug">{g.note}</blockquote>
            <figcaption className="mt-2 text-sm opacity-75">{g.senderName}</figcaption>
          </figure>
        )}
        <GiftSlots token={token} outbound={outbound} initial={{ status: g.status, encore: g.encore, expected: g.expected, ads: g.ads }} />
        {outbound && !hasAccount && (
          <div className="mx-auto mt-12 flex max-w-xl items-end gap-2 px-2" aria-hidden>
            <OzzyLazy size={72} perch="ledge" speech={false} pose={{ form: "creator", expression: "happy", motion: "wave" }} />
            <p className="ozzy-say relative mb-10 w-max max-w-[min(15rem,calc(100vw-9rem))] rounded-xl border-2 border-[#1a0f3a] bg-[#fff1d6] px-3 py-1.5 text-[13px] font-semibold leading-snug text-[#2a1a6e] shadow-[0_3px_0_#1a0f3a]">G&apos;day! I&apos;ve got {g.domain} ready. One tap and I&apos;ll draw you 10 more, free.</p>
          </div>
        )}
        <section className={`mx-auto max-w-xl rounded-3xl border border-[var(--studio-gold)]/30 bg-white/[0.03] p-6 text-center ${outbound && !hasAccount ? "" : "mt-12"}`}>
          <h2 className="font-display text-2xl font-medium sm:text-3xl">{hasAccount ? "Want more like these?" : outbound ? "Want 10 more? They're free." : `Get your full free pack: ${REFERRED_TRIAL_STATIC} ads`}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{hasAccount ? "Your business already has a Komendly account. Log in to make more." : outbound ? `Ozzy makes 10 more ads plus 1 animated ad from ${g.domain}, on new angles. Your website is already filled in, and the ads above come with you. No card needed.` : `${g.senderName}'s gift unlocks double the usual free pack: ${REFERRED_TRIAL_STATIC} static ads plus an animated one, for ${g.domain}.`}</p>
          <a href={cta} className="spellbar__cta mt-5 inline-flex h-13 w-full items-center justify-center rounded-2xl px-6 text-base font-semibold sm:w-auto">{hasAccount ? "Log in" : outbound ? "Get my 10 free ads" : "Get your full free pack"}</a>
          {!hasAccount && <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">{["No card", "Ready in minutes", "Yours to keep"].map((t) => <li key={t} className="inline-flex items-center gap-1"><Check className="size-3.5 text-[var(--studio-gold)]" />{t}</li>)}</ul>}
        </section>
      </main>
    </StudioRoot>
  );
}
