"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { normalizeRemixUrl } from "@/lib/studio/contracts";
import { remixHref } from "@/lib/hub/safe-next";
import { freeAdsFromWebsiteHref, parseRemixPrefill, prefillWebsite, type RemixPrefill } from "@/lib/growth/chrome-extension";


/** Paste-a-link box. The page is publicly cached, so the session is checked in the browser. */
export function RemixForm({ id = "remix-url", showSource = false }: { id?: string; showSource?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [source, setSource] = useState<RemixPrefill | null>(null);
  const [website, setWebsite] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/auth/me", { signal: ctrl.signal })
      .then((r) => setSignedIn(r.ok))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  // Prefill from ?ad=<link> (e.g. "Make my version" in the Competitor ad watch email). After hydration: the page is static.
  useEffect(() => {
    const ad = new URLSearchParams(window.location.search).get("ad");
    if (ad && normalizeRemixUrl(ad)) queueMicrotask(() => setText((t) => t || ad));
  }, []);

  // Prefill from the "Remake this ad" Chrome extension (?ad_url, ad_headline, ad_text, ad_image, ad_page, website).
  useEffect(() => {
    const p = parseRemixPrefill(new URLSearchParams(window.location.search));
    if (!p) return;
    queueMicrotask(() => {
      if (p.adUrl) setText((t) => t || p.adUrl!);
      if (p.website) setWebsite((w) => w || p.website!);
      setSource(p);
    });
  }, []);
  const site = prefillWebsite(website);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const link = normalizeRemixUrl(text);
    if (!link) return setError("Paste the link to an ad, e.g. a TikTok, Reel or Facebook ad.");
    router.push(remixHref(link, signedIn));
  }

  return (
    <form onSubmit={submit} noValidate className="w-full">
      {showSource && source && <SourceAd ad={source} />}
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
      {showSource && source && (
        <div className="mt-4 rounded-2xl border border-border bg-[oklch(0.18_0.06_295/0.6)] p-3 text-left">
          <label htmlFor={`${id}-site`} className="px-2 text-xs font-medium text-muted-foreground">Your website</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id={`${id}-site`}
              type="text"
              inputMode="url"
              autoComplete="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="yourbusiness.com"
              className="h-11 flex-1 rounded-xl bg-transparent px-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {site && (
              <a href={freeAdsFromWebsiteHref(site)} className="inline-flex h-11 items-center justify-center rounded-2xl border border-[var(--studio-gold)] px-4 text-sm font-semibold text-[var(--studio-gold)] hover:bg-white/5">
                Get 10 free ads from my site
              </a>
            )}
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">No link? You can upload a screen recording or screenshot of the ad inside the Studio.</p>
    </form>
  );
}

/** The ad picked in the Meta Ad Library, shown as the source Ozzy remixes (style only, never copied word for word). */
function SourceAd({ ad }: { ad: RemixPrefill }) {
  return (
    <div className="mb-4 flex gap-3 rounded-2xl border border-border bg-[oklch(0.18_0.06_295/0.6)] p-3 text-left">
      {ad.image && (
        // eslint-disable-next-line @next/next/no-img-element -- Meta CDN thumbnail, not in next/image remotePatterns
        <img src={ad.image} alt="" referrerPolicy="no-referrer" className="size-20 shrink-0 rounded-xl object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      )}
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">The ad you picked{ad.page ? ` · ${ad.page}` : ""}</p>
        {ad.headline && <p className="mt-1 font-medium text-foreground">{ad.headline}</p>}
        {ad.text && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{ad.text}</p>}
      </div>
    </div>
  );
}
