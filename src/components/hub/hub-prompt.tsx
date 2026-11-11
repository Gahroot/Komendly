"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { STUDIO_STARTERS } from "@/lib/studio/contracts";

/** "What do you want to make?" — hands the text to Ozzy Studio (/studio?prompt=…). */
export function HubPrompt() {
  const router = useRouter();
  const [text, setText] = useState("");
  const go = (t: string) => {
    const v = t.trim();
    router.push(v ? `/studio?prompt=${encodeURIComponent(v)}` : "/studio");
  };
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
        className="relative rounded-3xl border border-border bg-[oklch(0.16_0.06_290/0.75)] p-3 shadow-[0_20px_60px_-30px_#000] backdrop-blur-xl focus-within:border-[var(--studio-gold)]/60"
      >
        <label htmlFor="hub-prompt" className="sr-only">What do you want to make?</label>
        <textarea
          id="hub-prompt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go(text);
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="What do you want to make? e.g. a 15-second promo for my café"
          className="block w-full resize-none bg-transparent px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 px-2 pt-1">
          <span className="text-xs text-muted-foreground">Ozzy Studio · press Enter</span>
          <button type="submit" aria-label="Send to Ozzy Studio" className="spellbar__cta inline-flex size-10 items-center justify-center rounded-xl">
            <ArrowUp aria-hidden className="size-5" />
          </button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {STUDIO_STARTERS.slice(0, 4).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setText(s.prompt)}
            className="min-h-9 rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            {s.title}
          </button>
        ))}
      </div>
    </div>
  );
}
