"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small "Copy" button for a block of text (marketing blurbs, captions). */
export function CopyTextButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this text", text);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button type="button" onClick={() => void copy()} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-white/[0.08]", className)}>
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}
