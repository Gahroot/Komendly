"use client";

import { useEffect, useState } from "react";
import { FIRST_VIDEO_OFFER, formatUsd } from "@/lib/first-video-offer";

/** Mobile-only bottom bar that jumps back to the review form once it has scrolled out of view. */
export function StickyMobileCta({ targetId }: { targetId: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setShow(entry ? !entry.isIntersecting && entry.boundingClientRect.top < 0 : false));
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  function go() {
    const el = document.getElementById(targetId);
    el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    el?.querySelector("textarea")?.focus({ preventScroll: true });
  }

  if (!show) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-[oklch(0.14_0.06_290/0.94)] px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur sm:hidden">
      <button type="button" onClick={go} className="spellbar__cta flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold">
        Make my video · {formatUsd(FIRST_VIDEO_OFFER.priceCents)}
      </button>
    </div>
  );
}
