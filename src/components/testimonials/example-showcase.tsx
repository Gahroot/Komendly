"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXAMPLE_VIDEOS, examplePoster, exampleSrc, type ExampleVideo } from "./example-videos";

/** Self-hosted example testimonials. Muted autoplay while on screen; tap one for sound (only one plays aloud). */
export function ExampleShowcase({ className }: { className?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLVideoElement>());

  const toggle = useCallback((slug: string) => {
    setActive((cur) => {
      const next = cur === slug ? null : slug;
      refs.current.forEach((v, key) => {
        v.muted = key !== next;
        if (key === next) {
          v.currentTime = 0;
          void v.play().catch(() => undefined);
        }
      });
      return next;
    });
  }, []);

  return (
    <div className={cn("-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none]", className)}>
      <ul className="mx-auto flex w-max gap-4 sm:gap-5">
        {EXAMPLE_VIDEOS.map((ex) => (
          <li key={ex.slug}>
            <ExampleCard
              ex={ex}
              active={active === ex.slug}
              onToggle={toggle}
              register={(el) => (el ? refs.current.set(ex.slug, el) : refs.current.delete(ex.slug))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExampleCard({ ex, active, onToggle, register }: { ex: ExampleVideo; active: boolean; onToggle: (slug: string) => void; register: (el: HTMLVideoElement | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && (!reduce || !v.muted)) void v.play().catch(() => undefined);
      else if (!entry.isIntersecting) v.pause();
    }, { threshold: 0.4 });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Mute ${ex.presenter}'s example` : `Play ${ex.presenter}'s example for ${ex.business} with sound`}
      onClick={() => onToggle(ex.slug)}
      className={cn(
        "pixel-frame studio-frame relative block w-[180px] shrink-0 overflow-hidden p-1.5 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--studio-gold)] sm:w-[220px]",
        active && "shadow-[0_0_40px_-6px_#ffcf4a99]",
      )}
    >
      <div className="pixel-frame aspect-[9/16] overflow-hidden bg-[var(--studio-ink)]">
        <video
          ref={(el) => {
            videoRef.current = el;
            register(el);
          }}
          src={exampleSrc(ex.slug)}
          poster={examplePoster(ex.slug)}
          muted
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      </div>
      <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">{ex.industry}</span>
      <span className={cn("absolute bottom-3 right-3 rounded-full p-2", active ? "bg-[var(--studio-gold)] text-[#2a0f10]" : "bg-black/60 text-white")}>
        {active ? <Volume2 aria-hidden className="h-4 w-4" /> : <VolumeX aria-hidden className="h-4 w-4" />}
      </span>
    </button>
  );
}

/** Hero example: muted autoplay loop with a sound toggle. */
export function HeroExample({ slug, title }: { slug: string; title: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  return (
    <div className="relative h-full w-full">
      <video ref={ref} src={exampleSrc(slug)} poster={examplePoster(slug)} autoPlay muted={!sound} loop playsInline preload="metadata" className="h-full w-full object-cover" aria-label={title} />
      <button
        type="button"
        onClick={() => {
          const v = ref.current;
          setSound((s) => !s);
          if (v && !sound) {
            v.currentTime = 0;
            void v.play().catch(() => undefined);
          }
        }}
        aria-pressed={sound}
        className="absolute bottom-3 right-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs font-medium text-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--studio-gold)]"
      >
        {sound ? <Volume2 aria-hidden className="h-4 w-4" /> : <VolumeX aria-hidden className="h-4 w-4" />}
        {sound ? "Sound on" : "Tap for sound"}
      </button>
    </div>
  );
}
