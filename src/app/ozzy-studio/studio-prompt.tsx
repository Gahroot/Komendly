"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";

const IDEAS = [
  "A 15-second hype ad for my coffee shop",
  "Animate my logo into a 5-second intro",
  "Cut my clips into a punchy ad with captions",
] as const;

/** Where a prompt goes: straight into the Studio when signed in, otherwise sign-up first (prompt kept in `next`). Pure. */
export function studioPromptHref(prompt: string, signedIn: boolean): string {
  const studio = prompt.trim() ? `/studio?prompt=${encodeURIComponent(prompt.trim().slice(0, 2000))}` : "/studio";
  return signedIn ? studio : `/register?next=${encodeURIComponent(studio)}`;
}

/** Chat-style prompt box. The page is publicly cached, so the session is checked in the browser. */
export function StudioPrompt({ id = "studio-prompt" }: { id?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/auth/me", { signal: ctrl.signal })
      .then((r) => setSignedIn(r.ok))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(studioPromptHref(text, signedIn));
  }

  return (
    <form onSubmit={submit} className="w-full">
      <label htmlFor={id} className="sr-only">Tell Ozzy what video you want</label>
      <div className="rounded-3xl border border-border bg-[oklch(0.18_0.06_295/0.85)] p-3 text-left shadow-[0_20px_60px_-20px_#000a] backdrop-blur focus-within:border-[var(--studio-gold)]">
        <textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Make a 15-second promo for my bakery, fast cuts, warm colours…"
          className="block w-full resize-none bg-transparent px-2 py-1 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="px-2 text-xs text-muted-foreground">1 free video · no card</p>
          <button type="submit" className="spellbar__cta inline-flex h-11 items-center gap-2 rounded-2xl px-5 font-semibold">
            Make my video <ArrowUp className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {IDEAS.map((idea) => (
          <button key={idea} type="button" onClick={() => setText(idea)} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            {idea}
          </button>
        ))}
      </div>
    </form>
  );
}
