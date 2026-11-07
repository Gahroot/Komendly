"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { AD_GOALS, type AdGoalValue } from "@/lib/ads/contracts";
import { GOAL_LABELS } from "@/lib/ads/run-labels";
import { savePendingRun } from "@/lib/ads/run-client";
import { isValidSiteUrl, startHref } from "@/lib/ads/url-submit";
import { track } from "@/lib/analytics/track";
import { ozzy } from "@/components/ozzy/store";
import { useSpell } from "./studio-spell";
import { StudioOzzySlot } from "./studio-ozzy-slot";

const GOALS: AdGoalValue[] = ["auto", ...AD_GOALS.filter((g) => g !== "auto")];

/** The hero "spell bar": URL + goal. Same contract as AdsUrlForm (pending run survives sign-up, resumes at /ads/start). */
export function StudioUrlForm({ signedIn, cta = "Make my ads" }: { signedIn: boolean; cta?: string }) {
  const router = useRouter();
  const { setSpell } = useSpell();
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState<AdGoalValue>("auto");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "valid" | "invalid" | "cast">("idle");
  const focusedOnce = useRef(false);

  function onChange(v: string) {
    setUrl(v);
    setError(null);
    const valid = isValidSiteUrl(v);
    if (valid && state !== "valid") ozzy.emit({ type: "url:valid" });
    else if (!valid) ozzy.emit({ type: "url:typing", length: v.length });
    setState(valid ? "valid" : "idle");
    setSpell(valid ? "valid" : v ? "typing" : "idle");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!isValidSiteUrl(trimmed)) {
      setError(trimmed ? "That doesn't look like a website yet. Try yourbrand.com" : "Paste your website to begin, e.g. yourbrand.com");
      setState("invalid");
      setSpell("invalid");
      track("url_invalid", { length: trimmed.length });
      ozzy.emit({ type: "url:invalid" });
      return;
    }
    savePendingRun({ url: trimmed, goal });
    track("url_submit", { signed_in: signedIn, goal, placement: "hero" });
    ozzy.emit({ type: "url:submit" });
    setState("cast");
    setSpell("cast");
    router.push(startHref(trimmed, goal, signedIn));
  }

  return (
    <form onSubmit={submit} noValidate className="relative w-full">
      <div className="spellbar flex flex-col gap-2 sm:flex-row" data-state={state}>
        <label htmlFor="studio-url" className="sr-only">Your website</label>
        <input
          id="studio-url"
          value={url}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (!focusedOnce.current) track("url_focus", { placement: "hero" });
            focusedOnce.current = true;
            if (!url) setSpell("typing");
            ozzy.emit(url ? { type: "url:typing", length: url.length } : { type: "url:focus" });
          }}
          onBlur={() => !url && setSpell("idle")}
          placeholder="yourbrand.com"
          aria-invalid={state === "invalid"}
          aria-describedby={error ? "studio-url-error" : "studio-url-hint"}
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          className="h-14 min-w-0 flex-1 rounded-2xl bg-transparent px-4 text-lg text-foreground outline-none placeholder:text-muted-foreground/70 sm:px-5"
        />
        <button type="submit" disabled={state === "cast"} onPointerEnter={() => ozzy.emit({ type: "cta:hover" })} className="spellbar__cta inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-6 text-base font-semibold disabled:opacity-90">
          {state === "cast" ? <Loader2 className="size-4 animate-spin" /> : null}
          {state === "cast" ? "Opening the studio…" : cta}
          {state !== "cast" && <ArrowRight className="size-4" />}
        </button>
      </div>
      <p id="studio-url-error" role="alert" className="mt-3 min-h-5 text-left text-sm text-[oklch(0.8_0.12_30)]">{error}</p>
      <div className="mt-1 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        <span id="studio-url-hint" className="text-xs text-muted-foreground">Goal (optional)</span>
        <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Ads goal">
          {GOALS.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={goal === g}
              onClick={() => {
                setGoal(g);
                track("goal_select", { goal: g, placement: "hero" });
                ozzy.emit({ type: "goal:select" });
              }}
              className="spell-chip h-9 rounded-full px-3.5 text-[13px] font-medium"
            >
              {g === "auto" ? "Auto" : GOAL_LABELS[g]}
            </button>
          ))}
        </div>
      </div>
      <StudioOzzySlot greet size={128} className="pointer-events-none absolute bottom-full left-1 z-10 -mb-[14px] sm:left-5 [&>*]:pointer-events-auto" />
    </form>
  );
}
