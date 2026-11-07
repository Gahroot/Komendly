import { Check } from "lucide-react";
import { StudioFloatingAds } from "./studio-floating-ads";
import { StudioParallax } from "./studio-parallax";
import { StudioSky } from "./studio-sky";
import { StudioUrlForm } from "./studio-url-form";

const COPY = {
  control: {
    title: (
      <>Your website in. <em className="not-italic text-[var(--studio-gold)]">Ready&#8209;to&#8209;run ads</em> out.</>
    ),
    sub: "Ozzy reads your site like a strategist, finds your audience, offer and the pains your customers talk about, then builds on-brand ads for every stage of awareness.",
  },
  companion: {
    title: (
      <>Meet Ozzy. He turns your website into <em className="italic text-[var(--studio-gold)]">ads that sell</em>.</>
    ),
    sub: "Paste your link and your little ad wizard gets to work: audience, offer, customer pains, brand kit, then on-brand ads for every stage of awareness.",
  },
} as const;

/** First screen: sky, headline, spell bar. Everything needed to convert is above the fold. */
export function StudioHero({ signedIn, variant }: { signedIn: boolean; variant: string }) {
  const copy = variant === "companion" ? COPY.companion : COPY.control;
  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden pb-40 sm:pb-48" aria-labelledby="hero-title">
      <StudioParallax className="absolute inset-0">
        <StudioSky />
        <div className="studio-beam" aria-hidden />
        <StudioFloatingAds />
        <div className="studio-grain" aria-hidden />
      </StudioParallax>
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 pt-24 text-center sm:px-6 sm:pt-32">
        <p className="studio-rise inline-flex items-center gap-2 rounded-full border border-border bg-[oklch(0.2_0.07_295/0.6)] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)] backdrop-blur">
          <span className="sm:hidden">10 free ads · no card</span>
          <span className="max-sm:hidden">Free: 10 static ads + 1 animated ad · no card</span>
        </p>
        <h1 id="hero-title" className="studio-rise font-display mt-5 text-balance text-[2.6rem] font-medium leading-[1.02] tracking-[-0.025em] sm:text-6xl md:text-7xl" style={{ ["--rise-delay" as string]: "80ms" }}>
          {copy.title}
        </h1>
        <p className="studio-rise mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg" style={{ ["--rise-delay" as string]: "160ms" }}>
          {copy.sub}
        </p>
        <div className="studio-rise mt-36 w-full max-w-2xl sm:mt-32" style={{ ["--rise-delay" as string]: "240ms" }}>
          <StudioUrlForm signedIn={signedIn} />
        </div>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {["First ad in under 3 minutes", "4:5, 1:1 and 9:16", "PNG + MP4 export"].map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-[var(--studio-gold)]" />{t}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
