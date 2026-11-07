"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="glass w-full max-w-md rounded-3xl border border-border px-8 py-12 text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive shadow-[var(--glass-rim)]">
          <TriangleAlert className="size-7" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-muted-foreground">An unexpected error occurred</p>
        <Button onClick={() => reset()} className="mt-8">
          Try again
        </Button>
      </div>
    </main>
  );
}
