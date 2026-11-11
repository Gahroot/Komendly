"use client";

import Link from "next/link";
import { Coins, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdsWorkspace } from "@/hooks/useAdsWorkspace";

/** Credit balance, plan badge and the free-trial state with an upgrade CTA. */
export function AdsAccountCard() {
  const { data, error } = useAdsWorkspace();
  if (error) return <Card><CardContent className="text-sm text-destructive">Couldn&apos;t load your account. Refresh to try again.</CardContent></Card>;
  if (!data) return <Skeleton className="h-48 rounded-2xl" />;
  const planLabel = data.isPaid ? data.plan.charAt(0).toUpperCase() + data.plan.slice(1) : "Free trial";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base font-semibold">
          Your plan
          <Badge variant={data.isPaid ? "default" : "secondary"} className="rounded-full">{planLabel}</Badge>
        </CardTitle>
        <CardDescription className="truncate">{data.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="glass-subtle flex items-center gap-3 rounded-xl p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Coins className="size-5" aria-hidden /></div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{data.balance}</p>
            <p className="text-xs text-muted-foreground">credits · 1 credit = 1 static ad</p>
            {data.expiring.map((e) => (
              <p key={e.expiresAt} className="text-xs font-medium text-[var(--studio-gold,currentColor)]">{e.credits} referral credits expire {new Date(e.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
            ))}
          </div>
        </div>
        {data.isPaid ? (
          <Button asChild variant="outline" className="w-full"><Link href="/ads/billing">Manage billing</Link></Button>
        ) : data.trialAvailable ? (
          <p className="text-sm text-muted-foreground">Your free trial is ready: {data.trialStatic} static ads + 1 animated ad for one website.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">You&apos;ve used your free trial. Pick a monthly plan to keep making ads.</p>
            <Button asChild className="w-full"><Link href="/ads/billing"><Sparkles aria-hidden /> Upgrade</Link></Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
