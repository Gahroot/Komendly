"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrackOnMount } from "@/components/analytics/track-on-mount";

/** Ask the server whether this website already used its free pack. Fails open (false) on any error or after 2.5 s. */
export async function checkTrialDomain(url: string): Promise<{ used: boolean; domain: string | null }> {
  try {
    const res = await fetch("/api/ads/trial-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { used: false, domain: null };
    const d = (await res.json()) as { used?: boolean; domain?: string | null };
    return { used: d.used === true, domain: d.domain ?? null };
  } catch {
    return { used: false, domain: null };
  }
}

/** Shown before sign-up when someone at this company already got the free ad pack for this website. */
export function TrialUsedDialog({ domain, next, onClose }: { domain: string | null; next: string; onClose: () => void }) {
  const site = domain ?? "this website";
  return (
    <Dialog open={domain !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {domain && <TrackOnMount event="trial_domain_blocked" params={{ placement: "pre_signup" }} />}
        <DialogHeader>
          <DialogTitle>{site} already got its free ads</DialogTitle>
          <DialogDescription>
            Someone at your company already used the free ad pack for {site}. It&apos;s one free pack per business.
            Log in to that account, or create an account and pick a plan to make more ads for {site}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="w-full sm:flex-1"><Link href="/ads/pricing">See plans</Link></Button>
          <Button asChild variant="outline" className="w-full sm:flex-1"><Link href={`/ads/login?next=${encodeURIComponent(next)}`}>Log in</Link></Button>
        </DialogFooter>
        <button type="button" onClick={onClose} className="text-center text-xs text-muted-foreground underline underline-offset-4">Use a different website</button>
      </DialogContent>
    </Dialog>
  );
}
