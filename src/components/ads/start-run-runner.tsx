"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdsApiError, clearPendingRun, postJson, readPendingRun, type PendingRun } from "@/lib/ads/run-client";
import { track } from "@/lib/analytics/track";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { ozzy } from "@/components/ozzy/store";
import { StartRunUpsell } from "./start-run-upsell";
import { VerifyEmailNotice } from "./verify-email-notice";

const BILLING_CODES = new Set(["insufficient_credits", "domain_used", "device_used", "ip_used", "trial_used"]);

/** Starts the run saved before sign-up and forwards to the live run page. */
export function StartRunRunner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<AdsApiError | null>(null);

  const start = useCallback(async () => {
    const fromQuery: PendingRun | null = params.get("url") ? { url: params.get("url") ?? "", goal: params.get("goal") ?? undefined } : null;
    const pending = readPendingRun() ?? fromQuery;
    if (!pending) {
      router.replace("/ads/app");
      return;
    }
    try {
      const { runId } = await postJson<{ runId: string }>("/api/ads/runs", { url: pending.url, goal: pending.goal });
      clearPendingRun();
      track("run_started", { run_id: runId, goal: pending.goal ?? "auto" });
      router.replace(`/ads/runs/${runId}`);
    } catch (err) {
      if (err instanceof AdsApiError && err.status === 401) {
        router.replace(`/ads/login?next=${encodeURIComponent("/ads/start")}`);
        return;
      }
      const apiErr = err instanceof AdsApiError ? err : new AdsApiError(0, "network", "Network error. Check your connection and try again.");
      track("run_start_failed", { code: apiErr.code, status: apiErr.status });
      if (BILLING_CODES.has(apiErr.code) || apiErr.status === 402) ozzy.emit({ type: "upsell:shown" });
      else ozzy.emit({ type: "error", kind: apiErr.code === "network" ? "network" : apiErr.code === "email_unverified" ? "auth" : "unknown" });
      setError(apiErr);
    }
  }, [params, router]);

  const retry = () => {
    setError(null);
    ozzy.emit({ type: "recovery:retry" });
    void start();
  };

  useEffect(() => {
    // Deferred so React StrictMode's mount/unmount/mount only fires one request.
    ozzy.emit({ type: "url:submit" });
    const timer = window.setTimeout(() => void start(), 0);
    return () => window.clearTimeout(timer);
  }, [start]);

  const perched = (node: React.ReactNode) => (
    <div className="flex w-full max-w-md flex-col items-center">
      <div className="relative z-10 -mb-5"><OzzyLazy size={120} perch="ledge" speech={false} /></div>
      {node}
    </div>
  );
  if (error?.code === "email_unverified") return perched(<VerifyEmailNotice onContinue={retry} />);
  if (error && (BILLING_CODES.has(error.code) || error.status === 402)) {
    return perched(<StartRunUpsell code={error.code} message={error.message} />);
  }
  if (error) {
    return perched(
      <Card className="w-full">
        <CardHeader>
          <CardTitle>We couldn&apos;t start your ads</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={retry}>Try again</Button>
          <Button asChild variant="outline"><Link href="/ads/app">Change website</Link></Button>
        </CardContent>
      </Card>,
    );
  }
  return (
    <div className="glass flex w-full max-w-md flex-col items-center gap-4 rounded-2xl p-8 text-center" aria-live="polite">
      <OzzyLazy size={128} perch="ground" speech={false} />
      <div className="space-y-1">
        <p className="flex items-center justify-center gap-2 font-semibold"><Loader2 className="size-4 animate-spin" />Starting your ads…</p>
        <p className="text-sm text-muted-foreground">Ozzy is opening your website.</p>
      </div>
    </div>
  );
}
