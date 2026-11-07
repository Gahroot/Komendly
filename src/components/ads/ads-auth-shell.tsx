import { Suspense } from "react";
import { Check } from "lucide-react";
import { AdsAuthOzzy } from "./ads-auth-ozzy";

const POINTS = ["10 static ads + 1 animated ad, free", "Built from your real site and reviews", "Export PNG and MP4 in every ratio"];

/** Centered auth layout: soft glow, form on the right, value points on the left (desktop only). */
export function AdsAuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-2">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-80 w-[560px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="hidden space-y-6 lg:block">
        <Suspense fallback={<div className="h-[140px]" />}><AdsAuthOzzy /></Suspense>
        <h1 className="font-[family-name:var(--font-fraunces)] text-5xl font-medium tracking-tight">Your website in. <span className="text-primary">Ads out.</span></h1>
        <p className="max-w-md text-muted-foreground">Ozzy reads your site like a strategist and turns what your customers say into on-brand ads for every stage of awareness.</p>
        <ul className="space-y-3 text-sm">
          {POINTS.map((p) => (
            <li key={p} className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="size-3.5" /></span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-center lg:justify-end">{children}</div>
    </main>
  );
}
