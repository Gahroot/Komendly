import Link from "next/link";
import { ADS_GUARANTEE } from "@/lib/ads/billing-config";
import { StudioPose } from "./studio-pose";

/** Pricing teaser + a last call to action that jumps back to the spell bar. */
export function StudioClosing() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6" aria-labelledby="closing-title">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-[linear-gradient(160deg,#24124a,#160b2c_60%,#2a1020)] p-8 sm:p-12">
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[80%] -translate-x-1/2 rounded-full bg-[oklch(0.62_0.17_45/0.35)] blur-3xl" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl space-y-3">
            <h2 id="closing-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Start free. Upgrade when the ads work.</h2>
            <p className="text-muted-foreground">Free trial: 10 static ads + 1 animated ad. Plans add monthly credits, every ratio (4:5, 1:1, 9:16) and all five awareness levels, from $49/month.</p>
            <p className="text-xs text-muted-foreground">{ADS_GUARANTEE}</p>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
            <div className="-mb-2 hidden md:block"><StudioPose form="ascended" expression="happy" size={112} /></div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <a href="#studio-url" className="spellbar__cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-2xl px-6 font-semibold">Make my free ads</a>
            <Link href="/ads/billing" className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-2xl border border-border px-6 font-medium text-foreground transition-colors hover:bg-accent">See plans</Link>
            </div>
          </div>
        </div>
      </div>
      <footer className="mt-12 flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
        <p>© {new Date().getFullYear()} Komendly</p>
        <nav className="flex gap-4" aria-label="Footer">
          <Link href="/testimonials" className="hover:text-foreground">Video testimonials</Link>
          <Link href="/blog" className="hover:text-foreground">Blog</Link>
          <Link href="/ads/billing" className="hover:text-foreground">Pricing</Link>
        </nav>
      </footer>
    </section>
  );
}
