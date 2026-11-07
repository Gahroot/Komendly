"use client";

import { useEffect, useRef } from "react";
import { OzzyBubble } from "./OzzyBubble";
import { OzzyRenderer } from "./renderer";
import { ozzy, useOzzyState } from "./store";
import type { OzzyExpression, OzzyForm, OzzyMotion, OzzyState } from "./types";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export interface OzzyProps {
  size?: number;
  perch?: "ground" | "ledge";
  interactive?: boolean;
  /** Accessible name when interactive (default "Ozzy"). */
  label?: string;
  className?: string;
  /** Pin a pose instead of following the global store (previews, lab). */
  pose?: { form: OzzyForm; expression: OzzyExpression; motion?: OzzyMotion };
  /** Force reduced motion on/off; defaults to the user's OS preference. */
  reducedMotion?: boolean;
  /** Render the speech bubble for store lines (default true when following the store). */
  speech?: boolean;
  seed?: number;
}

const LOOK_RADIUS = 200;

export function Ozzy({
  size = 96,
  perch = "ground",
  interactive = false,
  label = "Ozzy",
  className,
  pose,
  reducedMotion,
  speech,
  seed,
}: OzzyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OzzyRenderer | null>(null);
  const storeState = useOzzyState();
  const prefersReduced = usePrefersReducedMotion();
  const still = reducedMotion ?? prefersReduced;
  const pinnedKey = pose ? `${pose.form}|${pose.expression}|${pose.motion ?? "idle"}` : null;
  const state: OzzyState = pose
    ? { form: pose.form, expression: pose.expression, motion: pose.motion ?? "idle", orb: 0.7, beat: 0 }
    : storeState;
  const stateRef = useRef(state);
  stateRef.current = state;

  // Create renderer once per canvas / size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = new OzzyRenderer(canvas, size, { reducedMotion: still, perch, seed });
    rendererRef.current = r;
    r.setState(stateRef.current);

    let visible = true;
    let onScreen = true;
    const sync = () => r.setActive(visible && onScreen);
    const io = new IntersectionObserver(([e]) => {
      onScreen = e?.isIntersecting ?? true;
      sync();
    });
    io.observe(canvas);
    const onVis = () => {
      visible = document.visibilityState === "visible";
      sync();
    };
    document.addEventListener("visibilitychange", onVis);
    const onMove = (ev: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      const x = ev.clientX - (b.left + b.width / 2);
      const y = ev.clientY - (b.top + b.height / 2);
      r.setLook(Math.hypot(x, y) < LOOK_RADIUS + b.width / 2 ? { x, y } : null);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      r.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, seed]);

  useEffect(() => {
    rendererRef.current?.setOptions({ reducedMotion: still, perch });
  }, [still, perch]);

  useEffect(() => {
    rendererRef.current?.setState(stateRef.current);
  }, [pinnedKey, storeState]);

  const showSpeech = speech ?? !pose;
  const canvas = (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      className="block"
    />
  );

  return (
    <div
      className={`relative inline-block ${interactive ? "" : "pointer-events-none"} ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden={interactive || showSpeech ? undefined : true}
    >
      {showSpeech ? <OzzyBubble line={state.line} /> : null}
      {interactive ? (
        <button
          type="button"
          aria-label={label}
          onClick={() => ozzy.emit({ type: "poke" })}
          className="block cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#a970ff] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          {canvas}
        </button>
      ) : (
        canvas
      )}
    </div>
  );
}
