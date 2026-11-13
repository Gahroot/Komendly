import Image from "next/image";
import { AWARENESS_INFO } from "@/lib/ads/run-labels";
import { AD_SAMPLES } from "@/lib/studio/examples";
import { StudioWorkshop } from "./studio-workshop";


/** Real output, hung like a gallery wall. */
export function StudioGallery() {
  return (
    <section id="examples" className="relative mx-auto max-w-6xl scroll-mt-8 px-4 py-20 sm:px-6 md:py-28" aria-labelledby="gallery-title">
      <div className="max-w-xl space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Real output</p>
        <h2 id="gallery-title" className="font-display text-4xl font-medium tracking-[-0.02em] sm:text-5xl">Ads that sound like your customers</h2>
        <p className="text-muted-foreground">Ozzy listens for the words your customers already use, then builds the ad around them. Here&apos;s one run, start to finish</p>
      </div>
      <div className="mt-12"><StudioWorkshop /></div>
      <h3 className="font-display mt-20 text-2xl font-medium tracking-[-0.01em] sm:text-3xl">More real output</h3>
      <p className="mt-2 text-sm text-muted-foreground">Made from real websites. Every ad targets a different stage of buyer awareness</p>
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-7">
        {AD_SAMPLES.map((s) => (
          <figure key={s.src} className="group">
            <div className="studio-frame rounded-xl p-2 sm:p-2.5" style={{ ["--tilt" as string]: s.tilt }}>
              <Image src={s.src} alt={s.alt} width={900} height={900} sizes="(min-width: 768px) 33vw, 50vw" className="h-auto w-full rounded-md" />
            </div>
            <figcaption className="mt-3 space-y-1 px-1">
              <p className="flex items-center gap-1.5 text-xs font-medium"><span aria-hidden className="size-1.5 bg-[var(--studio-gold)]" />{AWARENESS_INFO[s.awareness].label}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{s.angle}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
