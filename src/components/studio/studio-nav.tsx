import Link from "next/link";

/** Transparent night nav over the sky. Keeps the same destinations as AdsNav. */
export function StudioNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="relative z-20">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="font-display flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <span aria-hidden className="inline-block size-3 rotate-45 bg-[var(--studio-gold)] shadow-[0_0_14px_#ffcf4a99]" />
          Komendly
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <a href="#examples" className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground sm:inline-block">Examples</a>
          <Link href="/ads/billing" className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground sm:inline-block">Pricing</Link>
          {signedIn ? (
            <Link href="/ads/app" className="rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-colors hover:bg-accent">Your studio</Link>
          ) : (
            <>
              <Link href="/ads/login" className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">Sign in</Link>
              <Link href="/ads/signup" className="hidden rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-colors hover:bg-accent sm:inline-block">Try free</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
