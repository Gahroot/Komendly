import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { GalleryAd } from "@/lib/ads/gallery";
import { AWARENESS_LABEL, galleryCtaHref, whyItWorks } from "@/lib/ads/industries";

/** One real ad: image, brand, headline, awareness stage and a 'why it works' line from the ad's own fields. */
export function AdCard({ ad, eager = false }: { ad: GalleryAd; eager?: boolean }) {
  return (
    <li className="flex flex-col gap-3">
      <div className="studio-frame rounded-xl p-1.5 sm:p-2">
        <Image
          src={ad.src}
          alt={`${ad.brandName} Facebook ad: ${ad.headline}`}
          width={ad.width}
          height={ad.height}
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw"
          loading={eager ? "eager" : "lazy"}
          priority={eager}
          className="h-auto w-full rounded-md bg-white/5"
        />
      </div>
      <div className="space-y-1.5 px-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium">{ad.brandName}</p>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--studio-gold)]">{AWARENESS_LABEL[ad.awareness] ?? ad.awareness}</span>
        </div>
        <p className="text-[15px] leading-snug text-foreground/90">&ldquo;{ad.headline}&rdquo;</p>
        <p className="text-sm leading-relaxed text-muted-foreground"><span className="font-medium text-foreground/80">Why it works: </span>{whyItWorks(ad)}</p>
      </div>
    </li>
  );
}

export function CtaButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--studio-gold)] px-6 text-base font-semibold text-[#2a0f10] shadow-[0_0_24px_#ffcf4a55] transition hover:brightness-105">
      {children} <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

/** Closing CTA card with Ozzy. `campaign` = industry slug or "hub"; utm_content = position. */
export function CtaBlock({ title, campaign, content, label }: { title: string; campaign: string; content: string; label: string }) {
  return (
    <section className="studio-frame mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-2xl px-5 py-10 text-center sm:px-10" aria-label="Make your own ads">
      <Image src="/brand/ozzy-creator-focused.png" alt="" width={88} height={88} unoptimized className="[image-rendering:pixelated]" />
      <h2 className="font-display text-balance text-3xl font-medium tracking-[-0.02em] sm:text-4xl">{title}</h2>
      <p className="max-w-xl text-muted-foreground">Paste your website and Ozzy makes 10 ready-to-run Facebook &amp; Instagram ads plus an animated one, from your own brand and offers.</p>
      <CtaButton href={galleryCtaHref(campaign, content)}>{label}</CtaButton>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {["No card needed", "Ready in minutes", "Your brand, your photos"].map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-[var(--studio-gold)]" aria-hidden />{t}</li>
        ))}
      </ul>
    </section>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ name: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={it.name} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {it.href ? <Link href={it.href} className="transition-colors hover:text-foreground">{it.name}</Link> : <span aria-current="page" className="text-[var(--studio-gold)]">{it.name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
