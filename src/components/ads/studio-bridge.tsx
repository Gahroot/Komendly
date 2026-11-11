"use client";
// Ads -> Ozzy Studio bridge (flag studio_bridge). Shown only after the run's ads are ready, below the gallery
// and the upsell; never inside the offer modal. Clicks POST /api/studio/sessions/from-ad and land in the chat.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ArrowUp, Clapperboard, Film, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { firstInSession } from "@/lib/ads/offer-session";
import type { BridgePlacement, BridgeStarter } from "@/lib/studio/bridge";
import { STUDIO_VIDEO_TYPES, videoTypePrompt } from "@/lib/studio/contracts";

interface BridgeCtx { enabled: boolean }
const Ctx = createContext<BridgeCtx>({ enabled: false });

export function StudioBridgeProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <Ctx.Provider value={{ enabled }}>{children}</Ctx.Provider>;
}

export function useStudioBridge(): boolean {
  return useContext(Ctx).enabled;
}

type FromAdBody = { adId?: string; runId?: string; starter?: BridgeStarter; prompt?: string; placement: BridgePlacement };

async function openStudio(body: FromAdBody): Promise<void> {
  try {
    const res = await fetch("/api/studio/sessions/from-ad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && data.url) {
      window.location.href = data.url;
      return;
    }
    toast.error(data.error ?? "Couldn't open Ozzy Studio. Try again.");
  } catch {
    toast.error("You seem to be offline. Check your connection.");
  }
}

function useShown(placement: BridgePlacement, key: string) {
  useEffect(() => {
    if (!firstInSession(`studio_bridge:${placement}:${key}`)) return;
    void fetch("/api/studio/bridge-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement }) }).catch(() => undefined);
  }, [placement, key]);
}

/** Small text action under a ready ad / in the lightbox. Renders nothing when the bridge is off. */
export function StudioBridgeAction({ adId, motion, placement, className = "" }: { adId: string; motion: boolean; placement: BridgePlacement; className?: string }) {
  const enabled = useStudioBridge();
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  const Icon = motion ? Wand2 : Clapperboard;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await openStudio({ adId, placement: motion ? "motion_card" : placement });
        setBusy(false);
      }}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60 ${className}`}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
      {motion ? "Change it with Ozzy" : "Make this a video with Ozzy"}
    </button>
  );
}

export interface BridgeCardData { runId: string; domain: string; bestAdId: string | null; hasLogo: boolean; freeVideosLeft: number }

/**
 * Ozzy card under the user's ready ads: a prompt box first (type anything), tiny "kind of video" chips that
 * only PREFILL the box, and one quiet shortcut to turn their best ad into a Reels video.
 */
export function StudioBridgeCard({ data, placement }: { data: BridgeCardData; placement: BridgePlacement }) {
  useShown(placement, data.runId);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const go = async (id: string, body: FromAdBody) => {
    setBusy(id);
    await openStudio(body);
    setBusy(null);
  };
  const send = () => {
    const prompt = text.trim();
    if (prompt.length < 2 || busy) return;
    void go("prompt", { ...(data.bestAdId ? { adId: data.bestAdId } : { runId: data.runId }), prompt, placement });
  };
  const prefill = (id: string) => {
    setText(videoTypePrompt(id, data.domain));
    requestAnimationFrame(() => {
      const el = boxRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };
  const free = data.freeVideosLeft > 0;
  return (
    <section id="studio-bridge" aria-labelledby="studio-bridge-title" className="scroll-mt-24 rounded-2xl border bg-card/70 p-4 backdrop-blur sm:p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ozzy Studio</p>
      <h2 id="studio-bridge-title" className="mt-1 font-display text-xl leading-snug">
        Your ads are ready. Want a video Ozzy makes just for you?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell him what you want in your own words. He already knows your website and brand{free ? ", and your first video is free" : ""}.
      </p>
      <form
        className="mt-3 flex items-end gap-2 rounded-xl border bg-background/60 p-2 focus-within:ring-2 focus-within:ring-[var(--studio-gold)]"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="studio-bridge-prompt" className="sr-only">What video should Ozzy make?</label>
        <textarea
          id="studio-bridge-prompt"
          ref={boxRef}
          rows={2}
          value={text}
          maxLength={2000}
          disabled={busy !== null}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`e.g. a 15-second video for ${data.domain} that makes people want to book today`}
          className="min-h-[3rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/80"
        />
        <button
          type="submit"
          aria-label="Send to Ozzy"
          disabled={busy !== null || text.trim().length < 2}
          className="spellbar__cta grid size-10 shrink-0 place-items-center rounded-xl disabled:opacity-50"
        >
          {busy === "prompt" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowUp className="size-4" aria-hidden />}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Ideas (fills the box)">
        <span className="text-[11px] text-muted-foreground">Ideas:</span>
        {STUDIO_VIDEO_TYPES.filter((t) => t.id !== "logo" || data.hasLogo).map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={busy !== null}
            onClick={() => prefill(t.id)}
            className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
          >
            {t.label}
          </button>
        ))}
        {data.bestAdId && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void go("reels", { adId: data.bestAdId!, starter: "reels", placement })}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            {busy === "reels" ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Film className="size-3" aria-hidden />}
            Or turn my best ad into a Reels video
          </button>
        )}
      </div>
    </section>
  );
}
