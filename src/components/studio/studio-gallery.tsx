import Image from "next/image";
import type { Awareness } from "@/lib/ads/contracts";
import { AWARENESS_INFO } from "@/lib/ads/run-labels";

// Real composed ads from live runs, saved in public/ads/samples.
const SAMPLES: { src: string; awareness: Awareness; angle: string; alt: string; tilt: string }[] = [
  { src: "/ads/samples/maxteriors-ad-0.jpg", awareness: "problem_aware", angle: "Wanting holiday lights without another climb up the ladder", alt: "Maxteriors ad: I want the lights, not another trip up the ladder", tilt: "-0.6deg" },
  { src: "/ads/samples/yaatuber-ad-6.jpg", awareness: "problem_aware", angle: "Realizing the important click is hard for viewers to see", alt: "Yaatuber ad: One tiny click. More editing.", tilt: "0.5deg" },
  { src: "/ads/samples/maxteriors-ad-8.jpg", awareness: "solution_aware", angle: "Relief when the installation is no longer your unfinished job", alt: "Maxteriors ad: Your Govee lights are finally out of the box.", tilt: "-0.4deg" },
  { src: "/ads/samples/yaatuber-ad-4.jpg", awareness: "problem_aware", angle: "Hesitating to commit to audio cleanup without hearing it", alt: "Yaatuber ad: Can I hear the cleanup before I commit?", tilt: "0.6deg" },
  { src: "/ads/samples/maxteriors-ad-4.jpg", awareness: "problem_aware", angle: "Holiday decorating turning into untangling work", alt: "Maxteriors ad: You planned to decorate, not untangle lights", tilt: "-0.5deg" },
  { src: "/ads/samples/yaatuber-ad-8.jpg", awareness: "solution_aware", angle: "Wanting to focus on teaching rather than planning zoom edits", alt: "Yaatuber ad: Keep your mind on what you're teaching.", tilt: "0.4deg" },
];

/** Real output, hung like a gallery wall. */
export function StudioGallery() {
  return (
    <section id="examples" className="relative mx-auto max-w-6xl scroll-mt-8 px-4 py-20 sm:px-6 md:py-28" aria-labelledby="gallery-title">
      <div className="max-w-xl space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Real output</p>
        <h2 id="gallery-title" className="font-display text-4xl font-medium tracking-[-0.02em] sm:text-5xl">Ads that sound like your customers.</h2>
        <p className="text-muted-foreground">Made from real websites. Every ad targets a different stage of buyer awareness.</p>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-7">
        {SAMPLES.map((s) => (
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
