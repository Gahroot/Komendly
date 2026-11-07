"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdGoalValue } from "@/lib/ads/contracts";
import { savePendingRun } from "@/lib/ads/run-client";
import { isValidSiteUrl, startHref } from "@/lib/ads/url-submit";
import { track } from "@/lib/analytics/track";
import { ozzy } from "@/components/ozzy/store";
import { GoalChips } from "./goal-chips";

/** Website URL + optional goal. Saves the request so it survives sign-up, then continues at /ads/start. */
export function AdsUrlForm({ signedIn, cta = "Make my ads" }: { signedIn: boolean; cta?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState<AdGoalValue>("auto");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!isValidSiteUrl(trimmed)) {
      setError("Enter your website, e.g. yourbrand.com");
      track("url_invalid", { length: trimmed.length });
      ozzy.emit({ type: "url:invalid" });
      return;
    }
    savePendingRun({ url: trimmed, goal });
    track("url_submit", { signed_in: signedIn, goal });
    ozzy.emit({ type: "url:submit" });
    router.push(startHref(trimmed, goal, signedIn));
  }

  return (
    <form onSubmit={submit} className="w-full space-y-4">
      <div className="flex flex-col gap-2 field rounded-xl border p-1.5 transition-shadow focus-within:ring-2 focus-within:ring-ring/50 sm:flex-row">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
              const valid = isValidSiteUrl(e.target.value);
              if (valid && !isValidSiteUrl(url)) ozzy.emit({ type: "url:valid" });
              else if (!valid) ozzy.emit({ type: "url:typing", length: e.target.value.length });
            }}
            placeholder="yourwebsite.com"
            aria-label="Website URL"
            aria-invalid={Boolean(error)}
            onFocus={() => {
              if (!focused) track("url_focus");
              ozzy.emit({ type: "url:focus" });
              setFocused(true);
            }}
            inputMode="url"
            autoComplete="url"
            className="h-11 border-0 bg-transparent pl-9 text-base shadow-none focus-visible:ring-0"
          />
        </div>
        <Button type="submit" size="lg" className="h-11 w-full sm:w-auto">
          {cta} <ArrowRight />
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Goal (optional)</p>
        <GoalChips
          value={goal}
          onChange={(g) => {
            setGoal(g);
            track("goal_select", { goal: g });
            ozzy.emit({ type: "goal:select" });
          }}
        />
      </div>
    </form>
  );
}
