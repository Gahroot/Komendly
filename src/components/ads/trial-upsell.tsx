import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ADS_GUARANTEE } from "@/lib/ads/billing-config";
import { TrackOnMount } from "@/components/analytics/track-on-mount";

export function TrialUpsell() {
  return (
    <Card className="border-primary/60">
      <TrackOnMount event="upsell_view" params={{ placement: "trial_done" }} />
      <CardContent className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-lg font-semibold">You now have 10 ads in one size. Want them everywhere?</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>All 3 sizes: 4:5 feed, 1:1 square, 9:16 Stories/Reels</li>
            <li>All 5 awareness levels, from cold audiences to ready buyers</li>
            <li>Animated ads, plus one-click Meta publishing on Growth</li>
          </ul>
          <p className="text-sm font-medium">Plans from $49/month.</p>
          <p className="text-xs text-muted-foreground">{ADS_GUARANTEE}</p>
        </div>
        <Button asChild size="lg"><Link href="/ads/billing">See plans</Link></Button>
      </CardContent>
    </Card>
  );
}
