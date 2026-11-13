"use client";
// Ozzy voice controls: the mic button (in the composer) and the live call bar (waveform, hands-free, hold to talk).
import { Loader2, Mic, PhoneOff } from "lucide-react";
import type { OzzyVoice } from "./use-ozzy-voice";

const BARS = [0.5, 0.8, 1, 0.75, 0.55, 0.9, 0.6];

export function MicButton({ voice, disabled }: { voice: OzzyVoice; disabled?: boolean }) {
  if (!voice.supported) return null;
  const on = voice.mode !== "off";
  const label = voice.mode === "dictation" ? "Send what I said" : voice.mode === "call" ? "End voice chat" : voice.mode === "connecting" ? "Connecting to Ozzy" : "Talk to Ozzy";
  return (
    <button
      type="button"
      disabled={disabled || voice.mode === "connecting"}
      onClick={() => (voice.mode === "off" ? void voice.start() : voice.mode === "dictation" ? voice.sendNow() : voice.stop())}
      className={`mb-0.5 grid size-10 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-gold)] disabled:opacity-50 ${on ? "studio-mic-on bg-[var(--studio-gold)] text-[#2a0f10]" : "text-[oklch(0.85_0.04_75)] hover:bg-white/8 hover:text-white"}`}
      aria-label={label}
      aria-pressed={on}
      title={label}
    >
      {voice.mode === "connecting" ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" aria-hidden />}
    </button>
  );
}

export function VoiceBar({ voice }: { voice: OzzyVoice }) {
  if (voice.mode !== "call" && voice.mode !== "dictation") return null;
  const status = voice.mode === "dictation" ? "Listening… I'll send it when you pause" : voice.speaking ? "Ozzy is talking" : voice.handsFree || voice.talking ? "Ozzy is listening" : "Hold the button to talk";
  return (
    <div className="studio-live-in mb-2 flex items-center gap-3 rounded-2xl border border-[oklch(0.85_0.12_80/0.3)] bg-[oklch(0.2_0.08_295/0.92)] px-3 py-2" role="status" aria-live="polite">
      <div className="flex h-6 items-center gap-[3px]" aria-hidden>
        {BARS.map((b, i) => (
          <span key={i} className="studio-voice-bar" style={{ height: `${Math.max(4, Math.round(24 * b * (voice.mode === "dictation" ? 0.4 + 0.3 * ((i % 3) / 2) : Math.max(0.15, voice.level))))}px` }} />
        ))}
      </div>
      <span className={`min-w-0 flex-1 truncate text-sm text-[oklch(0.94_0.03_80)] ${voice.speaking ? "studio-shimmer" : ""}`}>{status}</span>
      {voice.mode === "call" && (
        <>
          {!voice.handsFree && (
            <button
              type="button"
              className={`studio-chip ${voice.talking ? "!border-[var(--studio-gold)] !bg-[oklch(0.33_0.1_295)]" : ""}`}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); voice.setPushing(true); }}
              onPointerUp={() => voice.setPushing(false)}
              onPointerCancel={() => voice.setPushing(false)}
              onKeyDown={(e) => { if (e.key === " " && !e.repeat) voice.setPushing(true); }}
              onKeyUp={(e) => { if (e.key === " ") voice.setPushing(false); }}
            >
              <Mic className="size-4" aria-hidden /> Hold to talk
            </button>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[oklch(0.84_0.04_290)]">
            <input type="checkbox" checked={voice.handsFree} onChange={voice.toggleHandsFree} className="accent-[var(--studio-gold)]" /> Hands-free
          </label>
        </>
      )}
      <button type="button" className="studio-icon-btn" onClick={voice.stop} aria-label="Stop voice">
        <PhoneOff className="size-4" />
      </button>
    </div>
  );
}
