import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Check, Gift } from "lucide-react";
import { DeviceCookie } from "@/components/ads/device-cookie";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { StudioUrlForm } from "@/components/studio/studio-url-form";
import { REFERRED_TRIAL_STATIC, lookupReferralCode } from "@/lib/ads/referrals";
import "@/components/studio/studio.css";

// Referral landing (/r/<code> redirects here after setting kmd_ref). Per-code content only: safe to cache publicly.
export const revalidate = 3600;

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ref = await lookupReferralCode((await params).code.toLowerCase());
  const title = ref ? `${ref.name} sent you ${REFERRED_TRIAL_STATIC} free ads` : "Free Ad Pack";
  return {
    title,
    description: `Paste your website and get ${REFERRED_TRIAL_STATIC} ready-to-run Facebook & Instagram ads plus an animated ad, free. Double the usual free pack.`,
    robots: { index: false, follow: false },
    openGraph: { title, description: `${REFERRED_TRIAL_STATIC} free Facebook & Instagram ads made from your website. No card.` },
  };
}

const SAMPLES = [
  { src: "/ads/samples/tidybooks-ad-0-4x5.jpg", alt: "Tidybooks ad", w: 1024, h: 1280, tilt: "-3deg" },
  { src: "/ads/samples/plausible-ad-1-4x5.jpg", alt: "Plausible ad", w: 1024, h: 1280, tilt: "2deg" },
  { src: "/ads/samples/nightshift-ad-1-4x5.jpg", alt: "Nightshift ad", w: 1024, h: 1280, tilt: "-1.5deg" },
];

export default async function ReferralLandingPage({ params }: Props) {
  const ref = await lookupReferralCode((await params).code.toLowerCase());
  if (!ref) redirect("/free-ads");
  const perks = [`${REFERRED_TRIAL_STATIC} on-brand static ads (double the usual 10)`, "1 animated video ad", "Copy written from your customers' own words", "No card, nothing to cancel"];
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <DeviceCookie />
      <TrackOnMount event="landing_view" params={{ page: "referral" }} />
      <StudioNav signedIn={false} />
      <main>
        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-12 pt-8 text-center sm:px-6 sm:pt-14" aria-labelledby="ref-title">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-[var(--studio-gold)] text-[#2a0f10] shadow-[0_10px_30px_-6px_#ffcf4a99]"><Gift className="size-7" aria-hidden /></span>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">
            A gift from {ref.name}
          </p>
          <h1 id="ref-title" className="font-display mt-4 text-balance text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">
            {ref.name} sent you <span className="text-[var(--studio-gold)]">{REFERRED_TRIAL_STATIC} free ads</span>
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Paste your website and Ozzy makes {REFERRED_TRIAL_STATIC} ready-to-run Facebook &amp; Instagram ads, plus an animated one. Twice the normal free pack, because a friend sent you.
          </p>
          <div className="w-full max-w-2xl pt-28 sm:pt-20">
            <StudioUrlForm signedIn={false} cta={`Get my ${REFERRED_TRIAL_STATIC} free ads`} />
          </div>
          <ul className="mt-6 grid w-full max-w-xl gap-2 text-left sm:grid-cols-2">
            {perks.map((p) => (
              <li key={p} className="flex items-start gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2.5 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" aria-hidden />{p}</li>
            ))}
          </ul>
        </section>
        <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6" aria-labelledby="ref-examples">
          <h2 id="ref-examples" className="font-display text-center text-2xl font-medium tracking-[-0.02em] sm:text-3xl">Real ads, made from real websites</h2>
          <div className="mt-8 grid grid-cols-3 gap-2.5 sm:gap-5">
            {SAMPLES.map((s) => (
              <div key={s.src} className="studio-frame rounded-xl p-1 sm:p-2" style={{ ["--tilt" as string]: s.tilt }}>
                <Image src={s.src} alt={s.alt} width={s.w} height={s.h} sizes="(min-width: 768px) 30vw, 33vw" className="h-auto w-full rounded-md" />
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">One free pack per business. Ready in minutes.</p>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
