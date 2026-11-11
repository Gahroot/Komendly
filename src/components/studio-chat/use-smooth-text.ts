"use client";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion as useReducedMotion } from "@/components/ozzy/use-reduced-motion";

/**
 * Token-by-token feel on top of ~150ms batched deltas: reveal the backlog over a few frames
 * (faster when far behind). Finished or reduced-motion text shows at once.
 */
export function useSmoothText(text: string, streaming: boolean): string {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(streaming ? 0 : text.length);
  const shownRef = useRef(shown);
  useEffect(() => {
    let raf = 0;
    if (!streaming || reduced) {
      shownRef.current = text.length;
      raf = requestAnimationFrame(() => setShown(text.length));
      return () => cancelAnimationFrame(raf);
    }
    const tick = () => {
      const backlog = text.length - shownRef.current;
      if (backlog <= 0) return;
      shownRef.current += Math.max(1, Math.ceil(backlog / 10));
      setShown(shownRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, streaming, reduced]);
  if (!streaming || reduced) return text;
  return text.slice(0, Math.min(shown, text.length));
}
