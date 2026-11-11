"use client";
import { Check, Download, Link2, Play, Shuffle, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { RATIO_ACTIONS, type RenderView } from "@/lib/studio/thread";
import { api, mediaUrl } from "./api";

function aspect(ratio: string): string {
  const [w, h] = ratio.split(":").map(Number);
  return w && h ? `${w} / ${h}` : "9 / 16";
}

function fmtSeconds(s: number): string {
  if (!s) return "";
  const r = Math.round(s);
  return r >= 60 ? `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}` : `${r}s`;
}

/** A delivered video: poster, play, version, ratio, download, share, quick ratio versions and remix. */
export function RenderCard({ render, disabled, onSend, onRemix }: { render: RenderView; disabled: boolean; onSend: (text: string) => void; onRemix: (text: string) => void }) {
  const [playing, setPlaying] = useState(false);
  const [shared, setShared] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const portrait = render.ratio === "9:16" || render.ratio === "4:5";

  const share = async () => {
    const r = await api<{ url: string }>(`/api/studio/renders/${render.id}/share`, { body: {} });
    if (!r.ok) return toast.error(r.error);
    const url = r.data.url;
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: "Made with Ozzy", url }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success("Share link copied", { description: url });
    }
    setShared(true);
  };

  return (
    <figure id={`render-${render.id}`} className="studio-rise scroll-mt-28 overflow-hidden rounded-2xl border border-white/12 bg-[oklch(0.17_0.06_295/0.85)] shadow-[0_24px_60px_-28px_#000]">
      <div className={`relative mx-auto bg-black ${portrait ? "max-w-[300px]" : "w-full"}`} style={{ aspectRatio: aspect(render.ratio) }}>
        <video
          ref={video}
          className="h-full w-full object-contain"
          src={mediaUrl({ render: render.id })}
          poster={render.posterKey ? mediaUrl({ render: render.id, kind: "poster" }) : undefined}
          controls={playing}
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
        />
        {!playing && (
          <button
            type="button"
            onClick={() => {
              setPlaying(true);
              void video.current?.play();
            }}
            className="group absolute inset-0 grid place-items-center bg-gradient-to-t from-black/50 via-transparent to-transparent focus-visible:outline-none"
            aria-label={`Play version ${render.version}`}
          >
            <span className="grid size-16 place-items-center rounded-full bg-[var(--studio-gold)] text-[#2a0f10] shadow-[0_10px_30px_-6px_#ffcf4aaa] transition-transform group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-white/70">
              <Play className="ml-1 size-7 fill-current" />
            </span>
          </button>
        )}
        <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5">
          <span className="rounded-full bg-black/65 px-2.5 py-1 font-mono text-[11px] font-semibold text-white">v{render.version}</span>
          <span className="rounded-full bg-black/65 px-2.5 py-1 font-mono text-[11px] text-white">{render.ratio}{render.seconds ? ` · ${fmtSeconds(render.seconds)}` : ""}</span>
        </div>
        {(render.free || render.watermarked) && <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-[var(--studio-gold)] px-2.5 py-1 text-[11px] font-semibold text-[#2a0f10]">Free</span>}
      </div>
      <figcaption className="space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          <a href={mediaUrl({ render: render.id, download: true })} className="studio-chip" download>
            <Download className="size-4" aria-hidden /> Download
          </a>
          <button type="button" className="studio-chip" onClick={() => void share()}>
            {shared ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />} Share
          </button>
          <button type="button" className="studio-chip" disabled={disabled} onClick={() => onRemix(`Remix v${render.version}: keep the message but try a different style, pacing and music. `)}>
            <Shuffle className="size-4" aria-hidden /> Remix
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {RATIO_ACTIONS.filter((a) => a.ratio !== render.ratio).map((a) => (
            <button key={a.ratio} type="button" className="studio-chip studio-chip--ghost" disabled={disabled} onClick={() => onSend(a.prompt)}>
              <Sparkles className="size-3.5 text-[var(--studio-gold)]" aria-hidden /> {a.label}
            </button>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}
