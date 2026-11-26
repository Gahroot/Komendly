"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { hostOf, SITE_COOKIE } from "@/lib/ads/lead-qualify";
import { savePendingRun } from "@/lib/ads/run-client";
import { checkTrialDomain } from "@/lib/ads/trial-check-client";
import { TRADE_COOKIE, TRADE_COOKIE_MAX_AGE } from "@/lib/ads/trade";
import { isValidSiteUrl, startHref } from "@/lib/ads/url-submit";
import { track } from "@/lib/analytics/track";
import { normalizePicked, pickerOptions } from "@/lib/growth/free-ads-trades";

// Only needed when the website already had its pack; keeps the dialog out of the first load.
const TrialUsedDialog = dynamic(() => import("./trial-used-dialog").then((m) => m.TrialUsedDialog), { ssr: false });

/**
 * Cold-traffic (/free-ads) URL form: one field, one button. Same contract as StudioUrlForm (pending run survives
 * sign-up and resumes at /ads/start) without the goal picker, Ozzy or zod, so the page hydrates fast in the Facebook app.
 */
/** trade: set on trade landing pages (/free-ads/roofers); only tags analytics here (TradeCookie carries it to sign-up). */
export function FreeAdsUrlForm({ id, cta = "Get my free ads", trade, pickTrade = false }: { id: string; cta?: string; trade?: string; pickTrade?: boolean }) {
  // pickTrade (generic /free-ads): "What kind of business?" picker, kept in the kmd_trade cookie for sign-up, the pack and emails.
  const [picked, setPicked] = useState("");
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "valid" | "invalid" | "cast">("idle");
  const [usedDomain, setUsedDomain] = useState<string | null>(null);
  const focusedOnce = useRef(false);
  // Prefill from ?url= (URL boxes on /ad-examples/<industry> and /tools submit here).
  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get("url");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill from the URL after hydration
    if (u) setUrl(u.slice(0, 300));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!isValidSiteUrl(trimmed)) {
      setError(trimmed ? "That doesn't look like a website yet. Try yourbusiness.com" : "Type your website to begin, e.g. yourbusiness.com");
      setState("invalid");
      track("url_invalid", { length: trimmed.length });
      return;
    }
    setState("cast");
    writeCookie(SITE_COOKIE, hostOf(trimmed) ?? "");
    const pickedTrade = pickTrade ? normalizePicked(picked) : null;
    if (pickedTrade) writeCookie(TRADE_COOKIE, pickedTrade);
    const check = await checkTrialDomain(trimmed);
    if (check.used) {
      setState("valid");
      setUsedDomain(check.domain ?? trimmed);
      return;
    }
    savePendingRun({ url: trimmed, goal: "auto" });
    track("url_submit", { signed_in: false, goal: "auto", placement: id, ...((trade ?? pickedTrade) ? { trade: (trade ?? pickedTrade) as string } : {}) });
    router.push(startHref(trimmed, "auto", false));
  }

  const inputId = `${id}-url`;
  return (
    <form onSubmit={submit} noValidate className="w-full">
      {pickTrade && (
        <div className="mb-2 text-left">
          <label htmlFor={`${id}-trade`} className="mb-1 block text-base font-semibold text-foreground/90">What kind of business do you run?</label>
          <select id={`${id}-trade`} value={picked} onChange={(e) => { setPicked(e.target.value); setError(null); }} className="h-14 w-full rounded-2xl border border-border bg-transparent px-4 text-lg text-foreground outline-none">
            <option value="" className="text-black">Choose your trade…</option>
            {pickerOptions().map((o) => <option key={o.value} value={o.value} className="text-black">{o.label}</option>)}
          </select>
        </div>
      )}
      <div className="spellbar flex flex-col gap-2 sm:flex-row" data-state={state}>
        <label htmlFor={inputId} className="sr-only">Your website</label>
        <input
          id={inputId}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
            setState(isValidSiteUrl(e.target.value) ? "valid" : "idle");
          }}
          onFocus={() => {
            if (!focusedOnce.current) track("url_focus", { placement: id });
            focusedOnce.current = true;
          }}
          placeholder="yourbusiness.com"
          aria-invalid={state === "invalid"}
          aria-describedby={error ? `${inputId}-error` : undefined}
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          className="h-14 min-w-0 w-full shrink-0 rounded-2xl sm:w-auto sm:flex-1 bg-transparent px-4 text-lg text-foreground outline-none placeholder:text-muted-foreground/80 sm:px-5"
        />
        <button type="submit" disabled={state === "cast"} className="spellbar__cta inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-6 text-lg font-semibold disabled:opacity-90">
          {state === "cast" ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
          {state === "cast" ? "One moment…" : cta}
          {state !== "cast" && <ArrowRight aria-hidden className="size-5" />}
        </button>
      </div>
      <p id={`${inputId}-error`} role="alert" className="mt-1 empty:min-h-0 min-h-5 text-left text-base text-[oklch(0.8_0.12_30)]">{error}</p>
      {usedDomain !== null && <TrialUsedDialog domain={usedDomain} next={startHref(url, "auto", true)} onClose={() => setUsedDomain(null)} />}
    </form>
  );
}

function writeCookie(name: string, value: string) {
  if (!value) return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${TRADE_COOKIE_MAX_AGE}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}
