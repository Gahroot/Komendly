"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { StudioBackdrop } from "@/components/studio/studio-backdrop";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StudioRoot className="studio-app relative isolate min-h-dvh">
      <StudioBackdrop />
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex w-full max-w-md flex-col items-center">
          <Image src="/brand/ozzy-classic-confused.png" alt="" width={144} height={144} unoptimized priority className="relative z-10 -mb-5 [image-rendering:pixelated]" />
          <div className="glass w-full rounded-3xl px-8 pb-10 pt-10 text-center">
            <h1 className="font-display text-3xl font-medium tracking-tight">That page tripped over its cape</h1>
            <p className="mt-3 text-muted-foreground">Something went wrong on our side. Nothing you did. Try again, or head home.</p>
            <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
              <button type="button" onClick={() => reset()} className="spellbar__cta inline-flex h-12 items-center justify-center rounded-2xl px-6 font-semibold">Try again</button>
              <Link href="/" className="inline-flex h-12 items-center justify-center rounded-2xl border border-border px-6 font-medium text-foreground transition-colors hover:bg-accent">Back to home</Link>
            </div>
          </div>
        </div>
      </main>
    </StudioRoot>
  );
}
