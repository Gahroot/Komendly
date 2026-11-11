"use client";
import { ArrowUp, FileAudio, Loader2, Paperclip, Square, X } from "lucide-react";
import { useCallback, useEffect, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type RefObject } from "react";
import { STUDIO_UPLOAD_LIMITS } from "@/lib/studio/contracts";
import type { Chip } from "./use-uploads";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  streaming: boolean;
  disabled?: boolean;
  chips: Chip[];
  onFiles: (files: File[]) => void;
  onRemoveChip: (localId: string) => void;
  uploading: boolean;
  placeholder?: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  hero?: boolean;
}

const MAX_HEIGHT = 220;

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
}

/** ChatGPT-style composer: autosize, Enter sends / Shift+Enter newline, paste + drop files, upload chips, Stop while streaming. */
export function Composer(p: Props) {
  const [dragging, setDragging] = useState(false);
  const { textareaRef, value } = p;
  useEffect(() => autosize(textareaRef.current), [value, textareaRef]);

  const canSend = !p.streaming && !p.disabled && !p.uploading && value.trim().length > 0;
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) p.onSubmit();
    }
    if (e.key === "Escape" && p.streaming) p.onStop?.();
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      p.onFiles(files);
    }
  };
  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) p.onFiles(files);
    },
    [p],
  );

  return (
    <form
      className={`studio-composer relative rounded-[22px] border transition-colors ${dragging ? "border-[var(--studio-gold)] bg-[oklch(0.24_0.08_295/0.9)]" : "border-white/12 bg-[oklch(0.19_0.07_295/0.88)]"} shadow-[0_20px_60px_-24px_#000c,inset_0_1px_0_#ffffff14] backdrop-blur-xl focus-within:border-[oklch(0.8_0.12_80/0.55)]`}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) p.onSubmit();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[22px] bg-[oklch(0.2_0.08_295/0.85)] text-sm font-medium text-[var(--studio-gold)]">
          Drop your clips, images or audio for Ozzy
        </div>
      )}
      {p.chips.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto px-3 pt-3" aria-label="Attachments">
          {p.chips.map((c) => (
            <li key={c.localId} className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/12 bg-black/30" title={c.error ?? c.name}>
              {c.previewUrl && c.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : c.previewUrl && c.mime.startsWith("video/") ? (
                <video src={c.previewUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              ) : (
                <FileAudio className="size-6 text-[var(--studio-gold)]" aria-hidden />
              )}
              {c.status === "uploading" && (
                <div className="absolute inset-0 grid place-items-center bg-black/55 text-[11px] font-semibold tabular-nums text-white">
                  {Math.round(c.progress * 100)}%
                  <span className="absolute bottom-0 left-0 h-1 bg-[var(--studio-gold)] transition-[width]" style={{ width: `${Math.round(c.progress * 100)}%` }} />
                </div>
              )}
              {c.status === "error" && <div className="absolute inset-0 grid place-items-center bg-[oklch(0.4_0.15_25/0.75)] px-1 text-center text-[10px] font-semibold text-white">Failed</div>}
              <button
                type="button"
                onClick={() => p.onRemoveChip(c.localId)}
                className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/70 text-white opacity-90 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--studio-gold)]"
                aria-label={`Remove ${c.name}`}
              >
                <X className="size-3" />
              </button>
              <span className="sr-only">{c.name} {c.status === "uploading" ? `uploading ${Math.round(c.progress * 100)}%` : c.status}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2 p-2 pl-3">
        <label className="mb-0.5 grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-[oklch(0.85_0.04_75)] transition-colors hover:bg-white/8 hover:text-white focus-within:ring-2 focus-within:ring-[var(--studio-gold)]" title="Attach files">
          <Paperclip className="size-5" aria-hidden />
          <span className="sr-only">Attach clips, images or audio</span>
          <input
            type="file"
            multiple
            className="sr-only"
            accept={STUDIO_UPLOAD_LIMITS.mimes.join(",")}
            onChange={(e) => {
              p.onFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
        <label className="sr-only" htmlFor="studio-composer-input">Message Ozzy</label>
        <textarea
          id="studio-composer-input"
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => p.onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={p.placeholder ?? "Tell Ozzy what to make…"}
          className={`max-h-[220px] min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-6 text-[oklch(0.96_0.03_75)] outline-none placeholder:text-[oklch(0.75_0.04_290)] ${p.hero ? "sm:text-base" : ""}`}
          enterKeyHint="send"
        />
        {p.streaming ? (
          <button type="button" onClick={p.onStop} className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-[oklch(0.96_0.03_75)] text-[#1a0f2e] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--studio-gold)]" aria-label="Stop Ozzy">
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button type="submit" disabled={!canSend} className="spellbar__cta mb-0.5 grid size-10 shrink-0 place-items-center rounded-full disabled:pointer-events-none disabled:opacity-40" aria-label={p.uploading ? "Waiting for uploads" : "Send message"}>
            {p.uploading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-5" strokeWidth={2.5} />}
          </button>
        )}
      </div>
    </form>
  );
}
