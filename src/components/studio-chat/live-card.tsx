"use client";
// Live preview: the work in progress playing in a sandboxed frame (HyperFrames runtime, driven over postMessage),
// seconds after Ozzy's edit exists. The final video card replaces it when it lands.
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadLive } from "@/lib/studio/thread";

/** Messages to the HyperFrames runtime inside the frame (its parent-control protocol). */
function control(frame: HTMLIFrameElement | null, action: string, extra: Record<string, unknown> = {}) {
  frame?.contentWindow?.postMessage({ source: "hf-parent", type: "control", action, ...extra }, "*");
}

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function LiveCard({ sessionId, live, finishing }: { sessionId: string; live: ThreadLive; finishing: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scale, setScale] = useState(0);
  const scrubbing = useRef(false);
  const portrait = live.height > live.width;
  const src = `/api/studio/sessions/${encodeURIComponent(sessionId)}/live/${live.version}`;

  // The composition is authored at its own pixel size: scale it to the card.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / live.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [live.width]);

  // A new version remounts this card (key in message.tsx), so state starts fresh.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || d.source !== "hf-preview") return;
      if (d.type === "ready") {
        setReady(true);
        control(frame.current, "set-muted", { muted: true });
        control(frame.current, "play");
      } else if (d.type === "timeline" && typeof d.durationSeconds === "number") {
        setDuration(d.durationSeconds);
        setReady(true);
      } else if (d.type === "state") {
        const t = typeof d.currentTime === "number" ? d.currentTime : 0;
        if (!scrubbing.current) setTime(t);
        setPlaying(d.isPlaying === true);
        // Loop: start again from the top when the end is reached.
        if (d.ended === true) {
          control(frame.current, "seek", { timeSeconds: 0 });
          control(frame.current, "play");
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [live.version]);

  const toggle = useCallback(() => control(frame.current, playing ? "pause" : "play"), [playing]);
  const restart = () => {
    control(frame.current, "seek", { timeSeconds: 0 });
    control(frame.current, "play");
  };

  return (
    <figure className="studio-live-in overflow-hidden rounded-2xl border border-[oklch(0.85_0.12_80/0.35)] bg-[oklch(0.17_0.06_295/0.85)] shadow-[0_24px_60px_-28px_#000,0_0_0_1px_#ffcf4a14]" data-testid="live-preview">
      <div ref={box} className={`relative mx-auto overflow-hidden bg-black ${portrait ? "max-w-[300px]" : "w-full"}`} style={{ aspectRatio: `${live.width} / ${live.height}` }}>
        <iframe
          key={live.version}
          ref={frame}
          src={src}
          title="Live preview"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className={`absolute left-0 top-0 origin-top-left border-0 transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
          style={{ width: live.width, height: live.height, transform: `scale(${scale})` }}
          onLoad={() => window.setTimeout(() => setReady(true), 1500)}
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="studio-pulse" aria-hidden />
            <span className="sr-only">Loading the live preview</span>
          </div>
        )}
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white">
          <span className="studio-live-dot" aria-hidden /> Live preview
        </span>
        <button type="button" onClick={toggle} className="absolute inset-0 focus-visible:outline-none" aria-label={playing ? "Pause live preview" : "Play live preview"} />
      </div>
      <figcaption className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <button type="button" className="studio-icon-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={Math.min(time, duration || 1)}
            disabled={!duration}
            aria-label="Scrub live preview"
            className="studio-scrub h-1.5 flex-1 cursor-pointer"
            onPointerDown={() => (scrubbing.current = true)}
            onPointerUp={() => (scrubbing.current = false)}
            onChange={(e) => {
              const t = Number(e.target.value);
              setTime(t);
              control(frame.current, "seek", { timeSeconds: t });
            }}
          />
          <span className="w-20 text-right font-mono text-[11px] tabular-nums text-[oklch(0.8_0.03_290)]">{fmt(time)} / {fmt(duration)}</span>
          <button type="button" className="studio-icon-btn" onClick={restart} aria-label="Play from the start">
            <RotateCcw className="size-3.5" />
          </button>
        </div>
        <p className="text-xs text-[oklch(0.82_0.03_80)]">
          {finishing ? "Live preview · your final video is on its way…" : "Live preview · sound and fine details arrive with the final video"}
        </p>
      </figcaption>
    </figure>
  );
}
