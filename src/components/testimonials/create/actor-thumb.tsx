"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { thumbSources, type StudioActor } from "./actors";

/** Actor portrait: tries the generated thumb, then the vendor images, then initials. */
export function ActorThumb({ actor, className }: { actor: StudioActor; className?: string }) {
  const sources = thumbSources(actor);
  const [idx, setIdx] = useState(0);
  const src = sources[idx];
  const initials = actor.name.split(" ").map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase();
  return (
    <div className={cn("relative overflow-hidden bg-[linear-gradient(160deg,#3a2266,#1c0f36)]", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- local + vendor URLs with a fallback chain
        <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" onError={() => setIdx((i) => i + 1)} />
      ) : (
        <span aria-hidden className="font-display absolute inset-0 flex items-center justify-center text-3xl text-[var(--studio-gold)]">{initials}</span>
      )}
    </div>
  );
}
