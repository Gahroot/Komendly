"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { normalizeRemixUrl } from "@/lib/studio/contracts";
import { remixHref } from "@/lib/hub/safe-next";


/** Paste-a-link box. The page is publicly cached, so the session is checked in the browser. */
export function RemixForm({ id = "remix-url" }: { id?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
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
    const link = normalizeRemixUrl(text);
    if (!link) return setError("Paste the link to an ad, e.g. a TikTok, Reel or Facebook ad.");
    router.push(remixHref(link, signedIn));
  }

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <label htmlFor={id} className="sr-only">Link to the ad you want to remix</label>
      <div className="rounded-3xl border border-border bg-[oklch(0.18_0.06_295/0.85)] p-3 text-left shadow-[0_20px_60px_-20px_#000a] backdrop-blur focus-within:border-[var(--studio-gold)]">
        <input
          id={id}
          type="url"
          inputMode="url"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="Paste a link to any ad: TikTok, Reel, Short, Facebook ad…"
          className="block h-11 w-full bg-transparent px-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="px-2 text-xs text-muted-foreground">First video free · no card</p>
          <button type="submit" className="spellbar__cta inline-flex h-11 items-center gap-2 rounded-2xl px-5 font-semibold">
            Remix it <ArrowUp className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-[oklch(0.8_0.12_30)]">{error}</p>}
      <p className="mt-3 text-xs text-muted-foreground">No link? You can upload a screen recording or screenshot of the ad inside the Studio.</p>
    </form>
  );
}
