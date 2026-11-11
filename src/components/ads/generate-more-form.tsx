"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AWARENESS_LEVELS, CREDIT_COST, RATIOS, type Awareness, type Ratio } from "@/lib/ads/contracts";
import { AdsApiError, postJson } from "@/lib/ads/run-client";
import { AWARENESS_INFO } from "@/lib/ads/run-labels";

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Paid users: another batch from the saved brand profile (skips extraction). */
export function GenerateMoreForm({ url, brandProfileId }: { url: string; brandProfileId: string | null }) {
  const router = useRouter();
  const [count, setCount] = useState(10);
  const [levels, setLevels] = useState<Awareness[]>(["problem_aware", "solution_aware"]);
  const [ratios, setRatios] = useState<Ratio[]>(["4:5"]);
  const [motion, setMotion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needCredits, setNeedCredits] = useState(false);
  const cost = count * ratios.length * CREDIT_COST.staticPerRatio + (motion ? CREDIT_COST.motion : 0);
  const valid = count >= 1 && count <= 50 && levels.length > 0 && ratios.length > 0;

  async function submit() {
    setBusy(true);
    setNeedCredits(false);
    try {
      const { runId } = await postJson<{ runId: string }>("/api/ads/runs", {
        url, count, awareness: levels, ratios, motion, brandProfileId: brandProfileId ?? undefined,
      });
      router.push(`/ads/runs/${runId}`);
    } catch (err) {
      if (err instanceof AdsApiError && err.code === "insufficient_credits") setNeedCredits(true);
      toast.error(err instanceof Error ? err.message : "Couldn't start.");
      setBusy(false);
    }
  }

  return (
    <Card className="bg-card/70 backdrop-blur">
      <CardHeader>
        <CardTitle>Generate more</CardTitle>
        <CardDescription>Uses your saved brand profile, so there&apos;s no review step.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="max-w-40 space-y-2">
          <Label htmlFor="count">Number of ads</Label>
          <Input id="count" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Awareness levels</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {AWARENESS_LEVELS.map((l) => (
              <label key={l} className="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary">
                <input type="checkbox" className="mt-0.5 accent-primary" checked={levels.includes(l)} onChange={() => setLevels(toggle(levels, l))} />
                <span>
                  <span className="font-medium">{AWARENESS_INFO[l].label}</span>
                  <span className="block text-muted-foreground">{AWARENESS_INFO[l].explain}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Ratios</legend>
          <div className="flex flex-wrap gap-2">
            {RATIOS.map((r) => (
              <Button key={r} type="button" size="sm" variant={ratios.includes(r) ? "default" : "outline"} aria-pressed={ratios.includes(r)} onClick={() => setRatios(toggle(ratios, r))}>
                {r}
              </Button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-primary" checked={motion} onChange={(e) => setMotion(e.target.checked)} />
          Add an animated ad (+{CREDIT_COST.motion} credits)
        </label>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {count} ads × {ratios.length} {ratios.length === 1 ? "ratio" : "ratios"}{motion ? " + animated" : ""} = <span className="font-medium text-foreground">{cost} credits</span>
        </p>
        <div className="flex gap-2">
          {needCredits && <Button asChild variant="outline"><Link href="/ads/billing">Top up</Link></Button>}
          <Button onClick={() => void submit()} disabled={!valid || busy}>{busy && <Loader2 className="animate-spin" />} Generate {cost} credits</Button>
        </div>
      </CardFooter>
    </Card>
  );
}
