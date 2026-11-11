"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Award, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postJson } from "@/lib/ads/run-client";
import type { RunFeatures } from "@/lib/ads/feature-actions";
import { cn } from "@/lib/utils";

type FeatureCtx = { data: RunFeatures | null; reload: () => void };
const Ctx = createContext<FeatureCtx>({ data: null, reload: () => {} });

/** Loads the run's Ad of the week state once; AdCards read it. Gift runs come back disabled. */
export function FeatureProvider({ runId, children }: { runId: string; children: ReactNode }) {
  const [data, setData] = useState<RunFeatures | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/ads/features?runId=${encodeURIComponent(runId)}`, { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<RunFeatures>) : null))
      .then((d) => setData(d))
      .catch(() => {});
    return () => ac.abort();
  }, [runId, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return <Ctx.Provider value={{ data, reload }}>{children}</Ctx.Provider>;
}

const ACTION = "size-8 rounded-full border bg-background/85 shadow-sm backdrop-blur hover:bg-background";

/** Card action: offer this ad for Ad of the week (or see / withdraw the offer). Renders nothing outside a FeatureProvider. */
export function FeatureAdButton({ adId, className }: { adId: string; className?: string }) {
  const { data } = useContext(Ctx);
  const [open, setOpen] = useState(false);
  if (!data?.enabled) return null;
  const state = data.byAd[adId];
  const active = state && ["consented", "shortlisted", "featured"].includes(state.status);
  return (
    <>
      <Button type="button" variant="ghost" size="icon" className={cn(ACTION, active && "text-[var(--studio-gold)]", className)} onClick={() => setOpen(true)} aria-label={active ? "Ad of the week: offered" : "Feature my ad"} title={active ? "Offered for Ad of the week" : "Feature my ad"}>
        <Award className="size-4" />
      </Button>
      {open && <FeatureDialog adId={adId} open={open} onOpenChange={setOpen} />}
    </>
  );
}

/** Gold ribbon on an ad that was picked as Ad of the week. */
export function FeaturedBadge({ adId }: { adId: string }) {
  const { data } = useContext(Ctx);
  if (data?.byAd[adId]?.status !== "featured") return null;
  return (
    <span className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-[var(--studio-gold)] px-2.5 py-1 text-xs font-semibold text-[#2a0f10] shadow">
      <Trophy className="size-3.5" aria-hidden /> Ad of the week
    </span>
  );
}

export function FeatureDialog({ adId, open, onOpenChange }: { adId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, reload } = useContext(Ctx);
  const state = data?.byAd[adId];
  const active = state && ["consented", "shortlisted", "featured"].includes(state.status);
  const [handle, setHandle] = useState(state?.handle ?? "");
  const [brandName, setBrandName] = useState(data?.brandName ?? "");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/ads/features", { adId, handle, brandName, consent });
      toast.success("Thanks! We'll let you know if your ad is picked.");
      reload();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      const res = await fetch(`/api/ads/features?adId=${encodeURIComponent(adId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't withdraw. Try again.");
      toast.success("Withdrawn. We won't show this ad publicly.");
      reload();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Image src="/brand/ozzy-ascended-happy.png" alt="" width={56} height={56} unoptimized className="size-12 shrink-0 [image-rendering:pixelated]" />
            <DialogTitle className="font-display text-xl font-medium">{state?.status === "featured" ? "This is Ad of the week!" : active ? "You're in the running" : "Feature my ad"}</DialogTitle>
          </div>
          <DialogDescription>
            {state?.status === "featured"
              ? "We featured this ad on Komendly's socials. Thank you!"
              : active
                ? "This ad may appear in our public ad examples, and it's in the running for Ad of the week. We email you if it's picked."
                : "With your permission, we may show this ad in Komendly's public ad examples (e.g. \"Facebook ad examples for bakeries\") and feature it on our socials, tagging you."}
          </DialogDescription>
        </DialogHeader>
        {active ? (
          <div className="space-y-3 text-sm">
            {state.handle && <p className="text-muted-foreground">We&apos;ll tag <span className="text-foreground">{state.handle}</span>.</p>}
            {state.status === "featured" && state.postUrl && <a className="text-[var(--studio-gold)] underline underline-offset-4" href={state.postUrl} target="_blank" rel="noopener noreferrer">See the post</a>}
            {state.status === "featured" && <p><Link className="underline underline-offset-4" href="/ad-of-the-week">See it on the Ad of the week page</Link></p>}
            {error && <p className="text-destructive" role="alert">{error}</p>}
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => void withdraw()}>{busy && <Loader2 className="animate-spin" />}Withdraw permission</Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor={`fb-${adId}`}>Brand name</Label><Input id={`fb-${adId}`} value={brandName} maxLength={80} onChange={(e) => setBrandName(e.target.value)} /></div>
            <div className="space-y-2">
              <Label htmlFor={`fh-${adId}`}>Instagram handle or Facebook page <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id={`fh-${adId}`} value={handle} maxLength={200} placeholder="@yourbrand" onChange={(e) => setHandle(e.target.value)} />
            </div>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--studio-gold)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>I own this brand (or may act for it) and Komendly may show this ad, with my brand name and handle, in its public ad examples and on its socials. I can withdraw any time.</span>
            </label>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
              <Button type="submit" disabled={busy || !consent}>{busy && <Loader2 className="animate-spin" />}Yes, feature my ad</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
