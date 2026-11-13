"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { type StudioExample, studioExamplePoster, studioExampleSrc } from "@/lib/studio/examples";

/** 9:16 Ozzy Studio examples: poster first, muted autoplay only while on screen, tap one for sound (one at a time). */
export function StudioVideoGrid({ examples }: { examples: readonly StudioExample[] }) {
  const [active, setActive] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLVideoElement>());

  const toggle = useCallback((id: string) => {
    setActive((cur) => {
      const next = cur === id ? null : id;
      refs.current.forEach((v, key) => {
        v.muted = key !== next;
        if (key === next) void v.play().catch(() => undefined);
      });
      return next;
    });
  }, []);

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {examples.map((ex) => (
        <li key={ex.id} className="space-y-2">
          <StudioVideo ex={ex} active={active === ex.id} onToggle={toggle} register={(el) => (el ? refs.current.set(ex.id, el) : refs.current.delete(ex.id))} />
          <p className="text-xs text-muted-foreground">{ex.label}</p>
        </li>
      ))}
    </ul>
  );
}

function StudioVideo({ ex, active, onToggle, register }: { ex: StudioExample; active: boolean; onToggle: (id: string) => void; register: (el: HTMLVideoElement | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && (!reduce || !v.muted)) void v.play().catch(() => undefined);
      else if (!entry?.isIntersecting) v.pause();
    }, { threshold: 0.4 });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Mute ${ex.label}` : `Play ${ex.label} with sound`}
      onClick={() => onToggle(ex.id)}
      className={cn(
        "relative block aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border bg-[#0c0820] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--studio-gold)]",
        active && "shadow-[0_0_40px_-6px_#ffcf4a99]",
      )}
    >
      <video
        ref={(el) => {
          videoRef.current = el;
          register(el);
        }}
        src={studioExampleSrc(ex)}
        poster={studioExamplePoster(ex)}
        muted
        loop
        playsInline
        preload="none"
        className="h-full w-full object-cover"
      />
      <span className={cn("absolute bottom-2 right-2 rounded-full p-2", active ? "bg-[var(--studio-gold)] text-[#2a0f10]" : "bg-black/60 text-white")}>
        {active ? <Volume2 aria-hidden className="h-4 w-4" /> : <VolumeX aria-hidden className="h-4 w-4" />}
      </span>
    </button>
  );
}
