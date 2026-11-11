import { TrackOnMount } from "@/components/analytics/track-on-mount";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const TITLES: Record<string, string> = {
  trial_used: "You've used your free trial",
  device_used: "A free trial was already used on this device",
  domain_used: "This website already got its free ads",
  ip_used: "A free trial was already used on this network",
  insufficient_credits: "You're out of credits",
};

const PERKS = ["Monthly ad credits", "Every ratio: 4:5, 1:1 and 9:16", "All five awareness levels", "Animated video ads"];

/** Shown when starting a run hits a 402 (trial used, device used, out of credits). */
export function StartRunUpsell({ code, message }: { code: string; message: string }) {
  return (
    <Card className="glow-primary w-full max-w-md pt-8">
      <TrackOnMount event="upsell_view" params={{ placement: "start_blocked", code }} />
      <CardHeader className="space-y-3">
        <CardTitle className="text-xl">{TITLES[code] ?? "Pick a plan to keep going"}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {PERKS.map((p) => (
            <li key={p} className="flex items-center gap-2"><Check className="size-4 text-primary" />{p}</li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="w-full sm:flex-1"><Link href="/ads/billing">{code === "insufficient_credits" ? "Get more credits" : "See plans"}</Link></Button>
        <Button asChild variant="outline" className="w-full sm:flex-1"><Link href="/ads/app">Back to home</Link></Button>
      </CardFooter>
    </Card>
  );
}
