"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { currentAssignments, track } from "@/lib/analytics/track";

/**
 * A/B test `free_ads_demo`: the "demo" half of /free-ads visitors see a 20 s product film under the hero form.
 * The page is publicly cached, so the arm is read from the experiment cookie on the client; control renders nothing.
 * Plays muted only while on screen; sound on tap.
 */
export function FreeAdsDemo() {
  const show = useSyncExternalStore(noopSubscribe, isDemoArm, serverIsDemoArm);
  const [muted, setMuted] = useState(true);
  const ref = useRef<HTMLVideoElement>(null);
  const seen = useRef(false);

  useEffect(() => {
    const v = ref.current;
    if (!show || !v) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        if (!seen.current) { seen.current = true; track("demo_video_view", { page: "free_ads" }); }
        if (!still) v.play().catch(() => {});
      } else v.pause();
    }, { threshold: 0.5 });
    io.observe(v);
    return () => io.disconnect();
  }, [show]);

  if (!show) return null;
  const toggleSound = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !muted;
    setMuted(!muted);
    if (muted) { v.currentTime = 0; v.play().catch(() => {}); track("demo_video_sound", { page: "free_ads" }); }
  };
  return (
    <figure className="mt-10 w-full max-w-2xl">
      <figcaption className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">See what you get · 20 seconds</figcaption>
      <div className="studio-frame relative overflow-hidden rounded-2xl p-1.5">
        <video
          ref={ref}
          className="aspect-video w-full rounded-xl bg-[#0c0820] object-cover"
          src="/demo-films/free-ads.mp4"
          poster="/demo-films/free-ads.jpg"
          muted
          loop
          playsInline
          preload="none"
          aria-label="20-second demo: paste your website and Ozzy builds 10 static ads and an animated ad in every size"
        />
        <button
          type="button"
          onClick={toggleSound}
          className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/75"
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
        >
          {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          {muted ? "Tap for sound" : "Sound on"}
        </button>
      </div>
    </figure>
  );
}

const noopSubscribe = () => () => undefined;
const isDemoArm = () => currentAssignments().free_ads_demo === "demo";
const serverIsDemoArm = () => false;
