"use client";
// "Share" button: native share sheet when available, else copies the link. Used on result cards, ideas pages and tool results.
import { useState } from "react";
import { Check, Share2 } from "lucide-react";

export function ShareLink({ url, text, label = "Share", className = "" }: { url: string; text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function go() {
    const full = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    try { if (navigator.share) { await navigator.share({ title: text, text, url: full }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(full); } catch { window.prompt("Copy this link", full); }
    setDone(true); window.setTimeout(() => setDone(false), 2000);
  }
  return (
    <button type="button" onClick={() => void go()} className={`inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-white/[0.08] ${className}`}>
      {done ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />} {done ? "Link copied" : label}
    </button>
  );
}
