import Image from "next/image";
import Link from "next/link";
import { StudioBackdrop } from "@/components/studio/studio-backdrop";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <StudioRoot className="studio-app relative isolate min-h-dvh">
      <StudioBackdrop />
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex w-full max-w-md flex-col items-center">
          <Image src="/brand/ozzy-explorer-focused.png" alt="" width={144} height={144} unoptimized priority className="relative z-10 -mb-5 [image-rendering:pixelated]" />
          <div className="glass w-full rounded-3xl px-8 pb-10 pt-10 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--studio-gold)]">404</p>
            <h1 className="font-display mt-2 text-3xl font-medium tracking-tight">Ozzy searched everywhere</h1>
            <p className="mt-3 text-muted-foreground">This page doesn&apos;t exist, or it wandered off. Let&apos;s get you back on the trail.</p>
            <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
              <Link href="/" className="spellbar__cta inline-flex h-12 items-center justify-center rounded-2xl px-6 font-semibold">Back to home</Link>
              <Link href="/blog" className="inline-flex h-12 items-center justify-center rounded-2xl border border-border px-6 font-medium text-foreground transition-colors hover:bg-accent">Read the blog</Link>
            </div>
          </div>
        </div>
      </main>
    </StudioRoot>
  );
}
