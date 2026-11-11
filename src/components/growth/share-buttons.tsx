"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Mail, MessageCircle, MessageSquareText, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ShareChannel = "copy" | "sms" | "whatsapp" | "email" | "native";

const noop = () => () => undefined;

/** Copy / text / WhatsApp / email / native share for a link with prefilled text. `onShare` fires per channel (beacons). */
export function ShareButtons({ link, text, subject, onShare, className = "", compact = false }: {
  link: string;
  /** Full message (should contain the link). */
  text: string;
  subject: string;
  onShare?: (channel: ShareChannel) => void;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const canNative = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy this link", link);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
    onShare?.("copy");
  }
  async function native() {
    try {
      await navigator.share({ title: subject, text, url: link });
      onShare?.("native");
    } catch {
      // dismissed
    }
  }
  const enc = encodeURIComponent;
  const pill = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white/[0.04] px-2 text-[13px] font-medium whitespace-nowrap transition-colors sm:px-3 sm:text-sm hover:bg-white/[0.09] focus-visible:outline-2 focus-visible:outline-[var(--studio-gold)]";
  return (
    <div className={cn("min-w-0 space-y-2.5", className)}>
      <div className="flex items-stretch gap-2">
        <div className="flex h-12 min-w-0 flex-1 items-center rounded-xl border border-[var(--studio-gold)]/30 bg-black/30 px-3 font-mono text-[13px] text-foreground/90">
          <span className="truncate">{link.replace(/^https?:\/\//, "")}</span>
        </div>
        <button type="button" onClick={() => void copy()} className="spellbar__cta inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className={cn("grid gap-2", compact ? "grid-cols-3" : canNative ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
        <a className={pill} href={`sms:?&body=${enc(text)}`} onClick={() => onShare?.("sms")}><MessageSquareText className="size-4" aria-hidden />Text it</a>
        <a className={pill} href={`https://wa.me/?text=${enc(text)}`} target="_blank" rel="noopener noreferrer" onClick={() => onShare?.("whatsapp")}><MessageCircle className="size-4" aria-hidden />WhatsApp</a>
        <a className={pill} href={`mailto:?subject=${enc(subject)}&body=${enc(text)}`} onClick={() => onShare?.("email")}><Mail className="size-4" aria-hidden />Email it</a>
        {canNative && !compact && <button type="button" className={pill} onClick={() => void native()}><Share2 className="size-4" aria-hidden />Share…</button>}
      </div>
    </div>
  );
}
