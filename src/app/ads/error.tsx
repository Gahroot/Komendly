"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { ozzy } from "@/components/ozzy/store";

/** Errors inside the studio stay in the studio, with Ozzy and a way forward. */
export default function AdsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    ozzy.emit({ type: "error", kind: "unknown" });
  }, [error]);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center">
        <div className="relative z-10 -mb-5"><OzzyLazy size={120} perch="ledge" speech={false} /></div>
        <div className="glass w-full rounded-3xl px-8 pb-10 pt-10 text-center">
          <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-medium tracking-tight">That page tripped over its cape</h1>
          <p className="mt-3 text-muted-foreground">Something went wrong on our side. Your runs and credits are safe.</p>
          <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={() => reset()}>Try again</Button>
            <Button asChild variant="outline"><Link href="/ads/app">Back to your ads</Link></Button>
          </div>
        </div>
      </div>
    </main>
  );
}
